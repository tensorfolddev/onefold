// The bot's side of WhatsApp, Hermes-style: deny by default and never message anyone first.
// - Linking: a teammate asks 1Fold for a one-time code and sends it to the bot from their phone. That proves the
//   number is theirs and means they wrote first. Anyone else who writes is ignored.
// - Replies from a linked number: 1FOLD (or TODAY) sends the brief now; anything else gets a short help. There's no
//   STOP: the brief is part of the job, not a newsletter.
// - The bot's own state (for Settings), which only platform admins (PLATFORM_ADMIN_EMAILS) can change.
import { randomInt } from "node:crypto";
import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { AccessError, ValidationError } from "../../domain/commands/index.ts";
import { activeMemberId as memberOf, type SessionRow } from "../accounts.ts";
import { sha256 } from "../auth/secrets.ts";
import { database, inScope } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { botDownEmail, emailEnabled, sendEmail } from "../email.ts";
import { briefFor } from "./brief.ts";

export type BotState = "off" | "pairing" | "connecting" | "connected" | "logged_out";
export interface Inbound { jid: string; phone: string; text: string }
export interface Replier { send: (jid: string, text: string) => Promise<void> }

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I to misread
const CODE_RE = /\b1FOLD-([A-HJ-NP-Z2-9]{6})\b/i;
const CODE_MINUTES = 15;
const MAX_TRIES_PER_HOUR = 10; // codes a number may try (a code has ~10⁹ possibilities and lasts 15 minutes)
const MAX_REPLIES_PER_HOUR = 20; // the bot never gets into a conversation loop with another bot

export const newLinkCode = () => `1FOLD-${Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;

// ---------- the bot itself ----------

export interface BotStatus { state: BotState; qr: string | null; phone: string | null; request: string | null; updatedAt: string }

export async function botStatus(): Promise<BotStatus> {
  const [row] = await database().select().from(s.whatsappBot).where(eq(s.whatsappBot.id, 1));
  return row ? { state: row.state as BotState, qr: row.qr, phone: row.phone, request: row.request, updatedAt: row.updatedAt }
    : { state: "off", qr: null, phone: null, request: null, updatedAt: "" };
}

const platformAdmins = () => (process.env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

/**
 * Whether this login may pair and unpair the environment's bot — its email is listed, and (once email is set up)
 * confirmed: otherwise whoever signed up first with a listed address would get the pairing QR.
 */
export async function isPlatformAdmin(who: SessionRow): Promise<boolean> {
  const admins = platformAdmins();
  if (!admins.length) return false;
  const [user] = await database().select({ email: s.users.email, verifiedAt: s.users.emailVerifiedAt }).from(s.users).where(eq(s.users.id, who.userId));
  return !!user && admins.includes(user.email) && (!!user.verifiedAt || !emailEnabled());
}

/** A platform admin asks the worker to pair the bot (show a QR) or log it out. */
export async function requestBot(who: SessionRow, request: "pair" | "logout"): Promise<void> {
  if (!(await isPlatformAdmin(who))) throw new AccessError();
  await database().update(s.whatsappBot).set({ request, updatedAt: sql`now()` }).where(eq(s.whatsappBot.id, 1));
}

/** The worker: the request waiting for it, if any (and it's taken, so it runs once). */
export async function takeBotRequest(): Promise<"pair" | "logout" | null> {
  const { rows } = await database().execute(sql`
    with old as (select request from whatsapp_bot where id = 1 for update)
    update whatsapp_bot set request = null from old where id = 1 and old.request is not null returning old.request as request`);
  return ((rows[0] as { request?: string } | undefined)?.request ?? null) as "pair" | "logout" | null;
}

/** The worker: what the connection is doing now. When it's been logged out, platform admins get one email about it. */
export async function setBotState(state: BotState, extra: { qr?: string | null; phone?: string | null } = {}, appUrl = process.env.APP_URL ?? ""): Promise<void> {
  const patch: Partial<typeof s.whatsappBot.$inferInsert> = { state, qr: extra.qr ?? null, updatedAt: sql`now()` as unknown as string };
  if (extra.phone !== undefined) patch.phone = extra.phone;
  if (state === "connected") patch.alertedAt = null;
  await database().update(s.whatsappBot).set(patch).where(eq(s.whatsappBot.id, 1));
  if (state !== "logged_out") return;
  const [alert] = await database().update(s.whatsappBot).set({ alertedAt: sql`now()` })
    .where(and(eq(s.whatsappBot.id, 1), isNull(s.whatsappBot.alertedAt))).returning({ id: s.whatsappBot.id });
  if (!alert) return; // already told them about this one
  for (const to of platformAdmins()) await sendEmail(botDownEmail({ to, settingsUrl: `${appUrl}/admin/settings` }));
}

// ---------- a teammate's link ----------

export interface MyWhatsApp {
  /** Whether the bot is there to link to right now. */
  available: boolean;
  linked: { phone: string; briefs: boolean; linkedAt: string } | null;
}

export async function myWhatsApp(who: SessionRow): Promise<MyWhatsApp> {
  const memberId = await memberOf(who);
  const [link] = await database().select().from(s.whatsappLinks)
    .where(and(eq(s.whatsappLinks.orgId, who.orgId), eq(s.whatsappLinks.memberId, memberId)));
  const bot = await botStatus();
  return {
    available: bot.state === "connected" && !!bot.phone,
    linked: link ? { phone: link.phone, briefs: link.briefs, linkedAt: link.linkedAt } : null,
  };
}

/** A one-time code to send the bot, and a wa.me link that opens WhatsApp with it already typed. */
export async function createLinkCode(who: SessionRow): Promise<{ code: string; url: string; botPhone: string; expiresAt: string }> {
  const memberId = await memberOf(who);
  const bot = await botStatus();
  if (bot.state !== "connected" || !bot.phone) throw new ValidationError("1Fold's WhatsApp isn't connected right now — ask your admin");
  const code = newLinkCode();
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
  await database().transaction(async (tx) => {
    // Only the newest code works: asking again cancels the one before.
    await tx.update(s.whatsappLinkCodes).set({ usedAt: sql`now()` }).where(and(
      eq(s.whatsappLinkCodes.orgId, who.orgId), eq(s.whatsappLinkCodes.memberId, memberId), isNull(s.whatsappLinkCodes.usedAt)));
    await tx.insert(s.whatsappLinkCodes).values({ id: sha256(code), orgId: who.orgId, memberId, userId: who.userId, expiresAt });
  });
  return { code, url: `https://wa.me/${bot.phone}?text=${encodeURIComponent(code)}`, botPhone: bot.phone, expiresAt };
}

export async function unlinkWhatsApp(who: SessionRow): Promise<void> {
  const memberId = await memberOf(who);
  await database().delete(s.whatsappLinks).where(and(eq(s.whatsappLinks.orgId, who.orgId), eq(s.whatsappLinks.memberId, memberId)));
}

/** The worker, hourly: codes that expired over a day ago are gone for good. */
export async function cleanupLinkCodes(): Promise<number> {
  const gone = await database().delete(s.whatsappLinkCodes)
    .where(lt(s.whatsappLinkCodes.expiresAt, sql`now() - interval '1 day'`)).returning({ id: s.whatsappLinkCodes.id });
  return gone.length;
}

// ---------- messages to the bot ----------

/** At most `max` per key per hour (in memory; one worker per environment). */
function hourlyLimit(max: number) {
  const counts = new Map<string, { count: number; until: number }>();
  return (key: string): boolean => {
    const now = Date.now();
    if (counts.size > 10_000) for (const [k, v] of counts) if (v.until < now) counts.delete(k);
    const entry = counts.get(key);
    if (!entry || entry.until < now) { counts.set(key, { count: 1, until: now + 3_600_000 }); return true; }
    entry.count += 1;
    return entry.count <= max;
  };
}
const allowTry = hourlyLimit(MAX_TRIES_PER_HOUR);
const allowReply = hourlyLimit(MAX_REPLIES_PER_HOUR);

/** A linked chat: by its id, or by the phone number behind it (WhatsApp may show either form, …@lid or …@s.whatsapp.net). */
const sameChat = (msg: Inbound) => msg.phone
  ? or(eq(s.whatsappLinks.jid, msg.jid), eq(s.whatsappLinks.phone, msg.phone))!
  : eq(s.whatsappLinks.jid, msg.jid);

const SIGN_OFF = "🤍 *1FOLD By TensorFold* 🤍";
const HELP = ["👋 *This is 1FOLD*", "", "Reply *1FOLD* anytime for your pending tasks.", "", SIGN_OFF].join("\n");
const CODE_FAILED = ["⚠️ *That code didn't work*", "", "It may have expired — codes last 15 minutes.",
  "Get a new one in 1FOLD: your name → *WhatsApp* → *Connect WhatsApp*."].join("\n");
const connected = (company: string) => ["✅ *You're connected to 1FOLD*", `_${company}_`, "",
  "Every working day at *9:00* you'll get your pending tasks here.", "", "Reply *1FOLD* anytime for updates.", "", SIGN_OFF].join("\n");

/**
 * One message someone sent the bot. Replies through `reply` — to a person who just sent a code, or to a linked number;
 * anyone else gets nothing at all. Replies are capped per number, so the bot can't get stuck talking to a bot.
 */
export async function handleMessage(msg: Inbound, whatsapp: Replier, appUrl: string): Promise<void> {
  const reply: Replier = { send: async (jid, text) => { if (allowReply(jid)) await whatsapp.send(jid, text); } };
  const code = msg.text.match(CODE_RE);
  if (code) {
    if (!allowTry(msg.jid)) return;
    return linkNumber(msg, `1FOLD-${code[1].toUpperCase()}`, reply);
  }
  const links = await database().select().from(s.whatsappLinks).where(sameChat(msg));
  if (!links.length) return; // deny by default
  if (links.some((l) => l.jid !== msg.jid)) { // the same person, now writing from the other form of their id
    await database().update(s.whatsappLinks).set({ jid: msg.jid }).where(sameChat(msg));
  }
  const word = msg.text.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (word === "1fold" || word === "today") { // one brief per company they're linked in
    const briefs = await Promise.all(links.map((l) => briefFor(l.orgId, l.memberId, appUrl)));
    for (const text of briefs.filter((t): t is string => !!t)) await reply.send(msg.jid, text);
    return;
  }
  await reply.send(msg.jid, HELP);
}

async function linkNumber(msg: Inbound, code: string, reply: Replier) {
  const [used] = await database().update(s.whatsappLinkCodes).set({ usedAt: sql`now()` })
    .where(and(eq(s.whatsappLinkCodes.id, sha256(code)), isNull(s.whatsappLinkCodes.usedAt), gt(s.whatsappLinkCodes.expiresAt, sql`now()`)))
    .returning();
  if (!used) {
    await reply.send(msg.jid, CODE_FAILED);
    return;
  }
  await database().transaction(async (tx) => {
    // A number belongs to one login: whoever linked it before (a recycled or shared number) loses it, so their
    // briefs can never reach this phone. The same person's links in their other companies stay.
    await tx.delete(s.whatsappLinks).where(and(sameChat(msg), ne(s.whatsappLinks.userId, used.userId)));
    await tx.insert(s.whatsappLinks)
      .values({ orgId: used.orgId, memberId: used.memberId, userId: used.userId, jid: msg.jid, phone: msg.phone, briefs: true })
      .onConflictDoUpdate({
        target: [s.whatsappLinks.orgId, s.whatsappLinks.memberId],
        set: { jid: msg.jid, phone: msg.phone, userId: used.userId, briefs: true, linkedAt: sql`now()` },
      });
  });
  const [org] = await inScope({ orgId: used.orgId }, (tx) => tx.select({ name: s.orgs.name }).from(s.orgs).where(eq(s.orgs.id, used.orgId)));
  await reply.send(msg.jid, connected(org?.name ?? "your company"));
}
