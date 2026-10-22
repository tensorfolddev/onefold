// The daily brief: at the company's time (9:00 unless its admins changed it) in its time zone, on its days (Monday–
// Friday unless changed), every teammate who linked WhatsApp gets their pending tickets, project by project, with due
// dates and links. When WhatsApp is down it goes by email instead. Each person gets at most one a day, whatever happens.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../data/db.ts";
import { PANEL_SLUG } from "../../data/session.ts";
import { statusOf } from "../../domain/selectors/product.ts";
import { snapshotFor, withoutArchived } from "../../domain/snapshot.ts";
import type { Person, Ticket } from "../../domain/types.ts";
import { DEFAULT_SETTINGS, message, minutesOf, type WhatsAppSettings } from "../../domain/whatsapp.ts";
import { loadCompany } from "../company/store.ts";
import { database, inScope } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { briefEmail, sendEmail } from "../email.ts";
import { settingsFor } from "./settings.ts";

const SEND_WINDOW_MINUTES = 9 * 60; // a brief that couldn't go out within 9 hours of its time waits for the next day
const WAIT_FOR_WHATSAPP_MINUTES = 2 * 60; // while WhatsApp is reconnecting, hold briefs this long — after that, email
const RETRY_AFTER = "10 minutes"; // a brief stuck "pending" (the worker died mid-send) or "failed" is tried again
const DEFAULT_TIME_ZONE = "Asia/Karachi";
const SEND_GAP_MS = 4000; // a few seconds between messages, like a person would
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Something that can send a WhatsApp message (the real bridge, or a fake in tests). */
export interface Sender {
  connected: () => boolean;
  /** Not connected yet, but on its way (starting, reconnecting): worth waiting for. */
  waiting?: () => boolean;
  send: (jid: string, text: string) => Promise<void>;
}

/** The date, weekday (0 = Sunday), hour and minute at `at` in `timeZone`. */
export function localClock(timeZone: string, at: Date): { day: string; weekday: number; hour: number; minute: number } {
  let zone = timeZone;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: zone }); } catch { zone = DEFAULT_TIME_ZONE; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(at).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, weekday: WEEKDAYS.indexOf(parts.weekday), hour: Number(parts.hour), minute: Number(parts.minute) };
}

const MAX_PER_PROJECT = 10;
const LINE = "━━━━━━━━━━━━━━";
const PROJECT_LINE = "━━━━━━━━━━";

const utcDate = (day: string) => new Date(`${day}T00:00:00Z`);
const part = (day: string, options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(utcDate(day));
/** "16-October-2026" */
const fullDate = (day: string) => `${Number(day.slice(8, 10))}-${part(day, { month: "long" })}-${day.slice(0, 4)}`;
const greeting = (hour: number) => (hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening");
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export interface ProjectTasks { name: string; tickets: Ticket[] }

/** Someone's pending tickets (anything not done or cancelled), by project; soonest due first, undated last. */
export function pendingByProject(db: Db, personId: string): ProjectTasks[] {
  const pending = db.tickets.filter((t) => {
    const category = statusOf(db, t)?.category;
    return !t.archivedAt && !!t.assigneeIds?.includes(personId) && t.type !== "epic" && !!category && category !== "done" && category !== "cancelled";
  });
  const number = (t: Ticket) => Number(t.key.split("-").pop());
  const due = (t: Ticket) => t.due ?? "9999-12-31"; // undated last
  const byDue = (a: Ticket, b: Ticket) => due(a).localeCompare(due(b)) || number(a) - number(b);
  return [...new Set(pending.map((t) => t.productKey))]
    .map((key) => ({ name: db.products.find((p) => p.key === key)?.name ?? key, tickets: pending.filter((t) => t.productKey === key).sort(byDue) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The brief as a WhatsApp message, built from what this person may see in the app (never a ticket on a product
 * they're no longer on). With nothing pending it's null — the 9:00 brief is then skipped — unless `whenEmpty`
 * (someone asked for it), which says so instead.
 */
export function briefText(company: Db, person: Person, clock: { day: string; hour: number }, appUrl: string,
  opts: { whenEmpty?: boolean; settings?: WhatsAppSettings } = {}): string | null {
  const settings = opts.settings ?? DEFAULT_SETTINGS;
  const db = withoutArchived(snapshotFor(company, person)); // never an archived product's tickets
  const projects = pendingByProject(db, person.id);
  const total = projects.reduce((n, p) => n + p.tickets.length, 0);
  if ((!total && !opts.whenEmpty) || !person.panel) return null;
  const lines = [
    LINE, `        *${db.org.name}*`, `  ${fullDate(clock.day)} | ${part(clock.day, { weekday: "long" })}`, LINE, "", "",
    message(settings, "briefGreeting", { greeting: greeting(clock.hour), name: person.name.split(" ")[0] }), "",
  ];
  if (!total) lines.push(message(settings, "briefEmpty"));
  else {
    lines.push(`You have total *${plural(total, "task")}* pending`, "");
    for (const p of projects) lines.push(`🧩🧩  *${p.name}* : ${plural(p.tickets.length, "Task")} pending`);
    lines.push("", "", "", "");
    projects.forEach((p, i) => {
      if (i > 0) lines.push("");
      lines.push(`🧩🧩  *${p.name}*`, PROJECT_LINE);
      p.tickets.slice(0, MAX_PER_PROJECT).forEach((t, n) => {
        if (n > 0) lines.push("");
        lines.push(`*${n + 1}. ${t.key}* ${t.title}`, `   • *Due:* ${t.due ? fullDate(t.due) : "No due date"}`, `   • *Link:* ${appUrl}/t/${t.key}`);
      });
      if (p.tickets.length > MAX_PER_PROJECT) lines.push("", `_…and ${p.tickets.length - MAX_PER_PROJECT} more — see All your work_`);
    });
  }
  lines.push(LINE, message(settings, "briefClosing", { link: `${appUrl}/my-work` }));
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

/** The brief for one member of one company, right now (someone replied 1FOLD). Says so when nothing is pending. */
export async function briefFor(orgId: string, memberId: string, appUrl: string, at = new Date()): Promise<string | null> {
  const company = await companyOf(orgId);
  const person = company?.db.people.find((p) => p.id === memberId);
  if (!company || !person?.active) return null;
  return briefText(company.db, person, localClock(company.timeZone, at), appUrl, { whenEmpty: true, settings: await settingsFor(orgId) });
}

export interface BriefRun { whatsapp: number; email: number; none: number; failed: number }

/**
 * Sends every brief that's due now: companies whose brief is on, on one of its days, from its time to 9 hours after;
 * people who linked WhatsApp and want briefs and haven't had today's at this time — moving the time later sends it
 * again at the new time. Runs every minute in the worker; safe to run any number of times.
 */
export async function sendDueBriefs(opts: {
  appUrl: string; at?: Date; gapMs?: number;
  whatsappFor: (orgId: string) => Sender | null; // the company's own number — none: the brief goes by its email
}): Promise<BriefRun> {
  const at = opts.at ?? new Date();
  const run: BriefRun = { whatsapp: 0, email: 0, none: 0, failed: 0 };
  const links = await database().select().from(s.whatsappLinks).where(eq(s.whatsappLinks.briefs, true));
  for (const orgId of new Set(links.map((l) => l.orgId))) {
    const settings = await settingsFor(orgId);
    if (!settings.briefOn) continue;
    const company = await companyOf(orgId);
    if (!company) continue;
    const clock = localClock(company.timeZone, at);
    const since = clock.hour * 60 + clock.minute - minutesOf(settings.briefAt); // minutes since the brief's time today
    if (!settings.briefDays.includes(clock.weekday) || since < 0 || since >= SEND_WINDOW_MINUTES) continue;
    const whatsapp = opts.whatsappFor(orgId);
    if (whatsapp?.waiting?.() && since < WAIT_FOR_WHATSAPP_MINUTES) continue; // (re)connecting: try next minute
    for (const link of links.filter((l) => l.orgId === orgId)) {
      const person = company.db.people.find((p) => p.id === link.memberId);
      if (!person?.active || !person.panel) continue;
      // Claim today's brief at this time first: if an earlier run already did, it's been sent — never send it twice.
      // A claim left "pending" (the worker died mid-send) or "failed" is taken over after a while, so it's tried again.
      const slot = settings.briefAt;
      const claimed = await database().insert(s.briefSends)
        .values({ orgId, memberId: link.memberId, day: clock.day, slot, channel: "pending" })
        .onConflictDoUpdate({
          target: [s.briefSends.orgId, s.briefSends.memberId, s.briefSends.day, s.briefSends.slot],
          set: { channel: "pending", at: sql`now()` },
          setWhere: sql`${s.briefSends.channel} in ('pending', 'failed') and ${s.briefSends.at} < now() - ${RETRY_AFTER}::interval`,
        })
        .returning();
      if (!claimed.length) continue;
      const text = briefText(company.db, person, clock, opts.appUrl, { settings });
      const { channel, error } = text === null ? { channel: "none" as const, error: null }
        : await deliver({ ...opts, whatsapp }, link.jid, person, orgId, company.db.org.name, text);
      run[channel] += 1;
      await database().update(s.briefSends).set({ channel, text, error })
        .where(and(eq(s.briefSends.orgId, orgId), eq(s.briefSends.memberId, link.memberId), eq(s.briefSends.day, clock.day), eq(s.briefSends.slot, slot)));
      // The day's row, for versions before brief_sends (so a rollback never sends today's brief twice).
      await database().insert(s.briefDeliveries).values({ orgId, memberId: link.memberId, day: clock.day, channel })
        .onConflictDoUpdate({ target: [s.briefDeliveries.orgId, s.briefDeliveries.memberId, s.briefDeliveries.day], set: { channel, at: sql`now()` } });
    }
  }
  return run;
}

/** Sends one brief: on WhatsApp, or by email when that can't. Says how it went — and, when it went wrong, why. */
async function deliver(opts: { whatsapp: Sender | null; appUrl: string; gapMs?: number }, jid: string, person: Person, orgId: string, orgName: string, text: string) {
  let why = opts.whatsapp ? "WhatsApp wasn't connected" : "The company has no WhatsApp number connected";
  if (opts.whatsapp?.connected()) {
    try {
      await opts.whatsapp.send(jid, text);
      await new Promise((resolve) => setTimeout(resolve, opts.gapMs ?? SEND_GAP_MS));
      return { channel: "whatsapp" as const, error: null };
    } catch (e) {
      console.error(`[brief] WhatsApp send failed for ${person.id}; sending by email`, e);
      why = `WhatsApp didn't send it: ${errorText(e)}`;
    }
  }
  const myWorkUrl = `${opts.appUrl}/${PANEL_SLUG[person.panel!]}/my-work`;
  const mailed = await sendEmail(briefEmail({ to: person.email, orgName, text, myWorkUrl }), { orgId });
  return mailed ? { channel: "email" as const, error: `${why}, so it went by email` } : { channel: "failed" as const, error: `${why}, and the email didn't send either` };
}

/** An error as one short line, for the delivery log. */
export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ").slice(0, 300);
