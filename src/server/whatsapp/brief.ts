// The daily brief: at 9:00 in each company's time zone, on working days (Monday–Friday), every teammate who linked
// WhatsApp (and didn't reply STOP) gets what's on their plate — overdue, due today, in progress, in review — with
// links. When WhatsApp is down it goes by email instead. Each person gets at most one a day, whatever happens.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../data/db.ts";
import { PANEL_SLUG } from "../../data/session.ts";
import { statusOf } from "../../domain/selectors/product.ts";
import { snapshotFor } from "../../domain/snapshot.ts";
import type { Person, Ticket } from "../../domain/types.ts";
import { loadCompany } from "../company/store.ts";
import { database, inScope } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { briefEmail, sendEmail } from "../email.ts";

export const BRIEF_HOUR = 9;
const LAST_HOUR = 18; // a brief that couldn't go out by then waits for the next working day
const WAIT_FOR_WHATSAPP_UNTIL = 11; // while WhatsApp is reconnecting, hold briefs until then — after that, email
const RETRY_AFTER = "10 minutes"; // a brief stuck "pending" (the worker died mid-send) or "failed" is tried again
const DEFAULT_TIME_ZONE = "Asia/Karachi";
const MAX_PER_SECTION = 10;
const SEND_GAP_MS = 4000; // a few seconds between messages, like a person would
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Something that can send a WhatsApp message (the real bridge, or a fake in tests). */
export interface Sender {
  connected: () => boolean;
  /** Not connected yet, but on its way (starting, reconnecting): worth waiting for. */
  waiting?: () => boolean;
  send: (jid: string, text: string) => Promise<void>;
}

/** The date, weekday (0 = Sunday) and hour at `at` in `timeZone`. */
export function localClock(timeZone: string, at: Date): { day: string; weekday: number; hour: number } {
  let zone = timeZone;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: zone }); } catch { zone = DEFAULT_TIME_ZONE; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(at).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekday: WEEKDAYS.indexOf(parts.weekday), hour: Number(parts.hour) };
}

const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);
const longDay = (day: string) => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(utcDate(day));
const shortDay = (day: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(utcDate(day));

export interface BriefSection { title: string; tickets: Ticket[] }

/** Someone's open tickets on `day`, each once, in the first section it fits: overdue, due today, in progress, in review. */
export function briefSections(db: Db, personId: string, day: string): BriefSection[] {
  const open = db.tickets.filter((t) => {
    const category = statusOf(db, t)?.category;
    return !!t.assigneeIds?.includes(personId) && t.type !== "epic" && !!category && category !== "done" && category !== "cancelled";
  });
  const review = (t: Ticket) => statusOf(db, t)?.tone === "review";
  const sections: { title: string; fits: (t: Ticket) => boolean }[] = [
    { title: "Overdue", fits: (t) => !!t.due && t.due < day },
    { title: "Due today", fits: (t) => t.due === day },
    { title: "In progress", fits: (t) => statusOf(db, t)?.category === "in_progress" && !review(t) },
    { title: "In review", fits: review },
  ];
  const placed = new Set<string>();
  return sections.map(({ title, fits }) => {
    const tickets = open.filter((t) => !placed.has(t.key) && fits(t)).sort((a, b) => (a.due ?? "~").localeCompare(b.due ?? "~"));
    tickets.forEach((t) => placed.add(t.key));
    return { title, tickets };
  }).filter((section) => section.tickets.length > 0);
}

/**
 * The brief as a WhatsApp message, or null when there's nothing to tell (then nothing is sent). Built from what this
 * person may see in the app — never a ticket on a product they're no longer on.
 */
export function briefText(company: Db, person: Person, day: string, appUrl: string): string | null {
  const db = snapshotFor(company, person);
  const sections = briefSections(db, person.id, day);
  if (!sections.length || !person.panel) return null;
  const home = `${appUrl}/${PANEL_SLUG[person.panel]}`;
  const lines = [`Good morning ${person.name.split(" ")[0]} — your 1Fold tasks at ${db.org.name} for ${longDay(day)}:`];
  for (const { title, tickets } of sections) {
    lines.push("", `*${title}* (${tickets.length})`);
    for (const t of tickets.slice(0, MAX_PER_SECTION)) {
      const due = t.due && t.due !== day ? ` — due ${shortDay(t.due)}` : "";
      lines.push(`• ${t.key} ${t.title}${due}`, `  ${home}/t/${t.key}`);
    }
    if (tickets.length > MAX_PER_SECTION) lines.push(`…and ${tickets.length - MAX_PER_SECTION} more`);
  }
  lines.push("", `My Work: ${home}/my-work`, "Reply TODAY to get this again, STOP to pause these messages.");
  return lines.join("\n");
}

interface Company { db: Db; timeZone: string }

async function companyOf(orgId: string): Promise<Company | null> {
  return inScope({ orgId }, async (tx) => {
    const loaded = await loadCompany(tx, orgId);
    if (!loaded) return null;
    const [org] = await tx.select({ timezone: s.orgs.timezone }).from(s.orgs).where(eq(s.orgs.id, orgId));
    return { db: loaded.db, timeZone: org?.timezone ?? DEFAULT_TIME_ZONE };
  });
}

/** Today's brief for one member of one company, right now (the TODAY reply). Null when there's nothing to tell. */
export async function briefFor(orgId: string, memberId: string, appUrl: string, at = new Date()): Promise<string | null> {
  const company = await companyOf(orgId);
  const person = company?.db.people.find((p) => p.id === memberId);
  if (!company || !person?.active) return null;
  return briefText(company.db, person, localClock(company.timeZone, at).day, appUrl);
}

export interface BriefRun { whatsapp: number; email: number; none: number; failed: number }

/**
 * Sends every brief that's due now: companies where it's a working day between 9:00 and 18:00, people who linked
 * WhatsApp and want briefs and haven't had today's. Runs every minute in the worker; safe to run any number of times.
 */
export async function sendDueBriefs(opts: { whatsapp: Sender | null; appUrl: string; at?: Date; gapMs?: number }): Promise<BriefRun> {
  const at = opts.at ?? new Date();
  const run: BriefRun = { whatsapp: 0, email: 0, none: 0, failed: 0 };
  const links = await database().select().from(s.whatsappLinks).where(eq(s.whatsappLinks.briefs, true));
  for (const orgId of new Set(links.map((l) => l.orgId))) {
    const company = await companyOf(orgId);
    if (!company) continue;
    const clock = localClock(company.timeZone, at);
    if (clock.weekday === 0 || clock.weekday === 6 || clock.hour < BRIEF_HOUR || clock.hour >= LAST_HOUR) continue;
    if (opts.whatsapp?.waiting?.() && clock.hour < WAIT_FOR_WHATSAPP_UNTIL) continue; // (re)connecting: try next minute
    for (const link of links.filter((l) => l.orgId === orgId)) {
      const person = company.db.people.find((p) => p.id === link.memberId);
      if (!person?.active || !person.panel) continue;
      // Claim today's brief first: if an earlier run already did, it's been sent — never send it twice. A claim left
      // "pending" (the worker died mid-send) or "failed" is taken over after a while, so it's tried again.
      const claimed = await database().insert(s.briefDeliveries)
        .values({ orgId, memberId: link.memberId, day: clock.day, channel: "pending" })
        .onConflictDoUpdate({
          target: [s.briefDeliveries.orgId, s.briefDeliveries.memberId, s.briefDeliveries.day],
          set: { channel: "pending", at: sql`now()` },
          setWhere: sql`${s.briefDeliveries.channel} in ('pending', 'failed') and ${s.briefDeliveries.at} < now() - ${RETRY_AFTER}::interval`,
        })
        .returning();
      if (!claimed.length) continue;
      const text = briefText(company.db, person, clock.day, opts.appUrl);
      const channel = text === null ? "none" : await deliver(opts, link.jid, person, company.db.org.name, text);
      run[channel] += 1;
      await database().update(s.briefDeliveries).set({ channel })
        .where(and(eq(s.briefDeliveries.orgId, orgId), eq(s.briefDeliveries.memberId, link.memberId), eq(s.briefDeliveries.day, clock.day)));
    }
  }
  return run;
}

async function deliver(opts: { whatsapp: Sender | null; appUrl: string; gapMs?: number }, jid: string, person: Person, orgName: string, text: string) {
  if (opts.whatsapp?.connected()) {
    try {
      await opts.whatsapp.send(jid, text);
      await new Promise((resolve) => setTimeout(resolve, opts.gapMs ?? SEND_GAP_MS));
      return "whatsapp" as const;
    } catch (e) {
      console.error(`[brief] WhatsApp send failed for ${person.id}; sending by email`, e);
    }
  }
  const myWorkUrl = `${opts.appUrl}/${PANEL_SLUG[person.panel!]}/my-work`;
  return (await sendEmail(briefEmail({ to: person.email, orgName, text, myWorkUrl }))) ? "email" as const : "failed" as const;
}
