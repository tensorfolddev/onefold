// A company's WhatsApp, for its admins: what they set (the brief's time and days, the words that ask the bot for it,
// the bot's messages — domain/whatsapp.ts), who linked a number, and how each message went (sent, waiting, failed;
// a brief on WhatsApp, by email, or nothing to tell). The worker reads the settings across companies.
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { AccessError } from "../../domain/commands/index.ts";
import { can } from "../../domain/permissions.ts";
import { cleanSettings, DEFAULT_SETTINGS, TEMPLATE_KEYS, type WhatsAppSettings } from "../../domain/whatsapp.ts";
import { personFor, type SessionRow } from "../accounts.ts";
import { mustLoad } from "../changes.ts";
import { database, inScope } from "../db/client.ts";
import * as s from "../db/schema.ts";

const LOG_DAYS = 14;
const LOG_ROWS = 100;
const PREVIEW = 90;
const MAX_ATTEMPTS = 5; // as outbox.ts: after that, a message is given up on

/** A company's settings, 1FOLD's defaults where it set nothing. Never fails a send: bad stored data reads as default. */
export async function settingsFor(orgId: string): Promise<WhatsAppSettings> {
  const [row] = await database().select().from(s.whatsappSettings).where(eq(s.whatsappSettings.orgId, orgId));
  if (!row) return DEFAULT_SETTINGS;
  try {
    return cleanSettings({ briefOn: row.briefOn, briefAt: row.briefAt, briefDays: row.briefDays, words: row.words, templates: row.templates });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Refuses anyone but one of the company's admins. */
async function asAdmin(who: SessionRow): Promise<string> {
  return inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
    const loaded = await mustLoad(tx, who);
    const me = personFor(loaded, who.userId);
    if (!can(me, "org.manage")) throw new AccessError();
    return me.id;
  });
}

/** Saves what an admin changed (checked first); templates are kept only where they differ from 1FOLD's own. */
export async function saveSettings(who: SessionRow, input: unknown): Promise<WhatsAppSettings> {
  const meId = await asAdmin(who);
  const next = cleanSettings(input, await settingsFor(who.orgId));
  const reworded = Object.fromEntries(TEMPLATE_KEYS.filter((k) => next.templates[k] !== DEFAULT_SETTINGS.templates[k]).map((k) => [k, next.templates[k]]));
  const row = { briefOn: next.briefOn, briefAt: next.briefAt, briefDays: next.briefDays, words: next.words, templates: reworded, updatedBy: meId, updatedAt: sql`now()` };
  await database().insert(s.whatsappSettings).values({ orgId: who.orgId, ...row })
    .onConflictDoUpdate({ target: s.whatsappSettings.orgId, set: row });
  return next;
}

export interface LinkedMember { personId: string; phone: string; briefs: boolean; linkedAt: string }
export interface Delivery { at: string; personId: string | null; kind: string; status: "sent" | "email" | "waiting" | "failed" | "none"; preview: string }
export interface CompanyWhatsApp { settings: WhatsAppSettings; timeZone: string; linked: LinkedMember[]; log: Delivery[] }

/** "923001112222" → "+92 30•••2222": enough to tell numbers apart, not to copy one. */
export const maskPhone = (phone: string) => (phone.length > 6 ? `+${phone.slice(0, 2)} ${phone.slice(2, 4)}•••${phone.slice(-4)}` : "Private number");

const BRIEF_STATUS: Record<string, Delivery["status"]> = { whatsapp: "sent", email: "email", none: "none", failed: "failed", pending: "waiting" };

/** Everything the company's WhatsApp page shows: the settings, who's linked, and the last two weeks of deliveries. */
export async function companyWhatsApp(who: SessionRow): Promise<CompanyWhatsApp> {
  await asAdmin(who);
  const db = database();
  const [org] = await inScope({ orgId: who.orgId }, (tx) => tx.select({ timezone: s.orgs.timezone }).from(s.orgs).where(eq(s.orgs.id, who.orgId)));
  const since = new Date(Date.now() - LOG_DAYS * 24 * 60 * 60_000);
  const [settings, links, sent, briefs] = await Promise.all([
    settingsFor(who.orgId),
    db.select().from(s.whatsappLinks).where(eq(s.whatsappLinks.orgId, who.orgId)),
    db.select().from(s.whatsappOutbox).where(and(eq(s.whatsappOutbox.orgId, who.orgId), gte(s.whatsappOutbox.createdAt, since.toISOString())))
      .orderBy(desc(s.whatsappOutbox.id)).limit(LOG_ROWS),
    db.select().from(s.briefDeliveries).where(and(eq(s.briefDeliveries.orgId, who.orgId), gte(s.briefDeliveries.at, since.toISOString())))
      .orderBy(desc(s.briefDeliveries.at)).limit(LOG_ROWS),
  ]);
  const log: Delivery[] = [
    ...sent.map((m) => ({
      at: m.createdAt, personId: m.memberId, kind: m.kind ?? "message",
      status: m.sentAt ? "sent" as const : m.attempts >= MAX_ATTEMPTS ? "failed" as const : "waiting" as const,
      preview: m.text.replace(/\s+/g, " ").slice(0, PREVIEW),
    })),
    ...briefs.map((b) => ({ at: b.at, personId: b.memberId, kind: "brief", status: BRIEF_STATUS[b.channel] ?? "waiting", preview: `Daily brief for ${b.day}` })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, LOG_ROWS);
  return {
    settings,
    timeZone: org?.timezone ?? "Asia/Karachi",
    linked: links.map((l) => ({ personId: l.memberId, phone: maskPhone(l.phone), briefs: l.briefs, linkedAt: l.linkedAt })),
    log,
  };
}
