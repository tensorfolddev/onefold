// The bot's side of WhatsApp, Hermes-style: deny by default and never message anyone first.
// - Linking: a teammate asks 1Fold for a one-time code and sends it to the bot from their phone. That proves the
//   number is theirs and means they wrote first. Anyone else who writes is ignored.
// - Replies from a linked number: 1FOLD (or TODAY) sends the brief now; anything else gets a short help. There's no
//   STOP: the brief is part of the job, not a newsletter.
// Every company talks to its people through its own number (Integrations → Team Bot): one company's bot never answers
// for another, and there's no shared one — until a company connects its number, it has no WhatsApp.
import { randomInt } from "node:crypto";
import { and, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { ValidationError } from "../../domain/commands/index.ts";
import { activeMemberId as memberOf, type SessionRow } from "../accounts.ts";
import { sha256 } from "../auth/secrets.ts";
import { database, inScope } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { message, normalWord, scheduleText } from "../../domain/whatsapp.ts";
import { briefFor } from "./brief.ts";
import { botFor } from "./companyBot.ts";
import { settingsFor } from "./settings.ts";

export type BotState = "off" | "pairing" | "connecting" | "connected" | "logged_out";
export interface Inbound { jid: string; phone: string; text: string }
export interface Replier { send: (jid: string, text: string) => Promise<void> }

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O or 1/I to misread
const CODE_RE = /\b1FOLD-([A-HJ-NP-Z2-9]{6})\b/i;
const CODE_MINUTES = 15;
const MAX_TRIES_PER_HOUR = 10; // codes a number may try (a code has ~10⁹ possibilities and lasts 15 minutes)
const MAX_REPLIES_PER_HOUR = 20; // the bot never gets into a conversation loop with another bot

export const newLinkCode = () => `1FOLD-${Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("")}`;

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
  const bot = await botFor(who.orgId); // the company's own number
  return {
    available: bot.state === "connected" && !!bot.phone,
    linked: link ? { phone: link.phone, briefs: link.briefs, linkedAt: link.linkedAt } : null,
  };
}

/** A one-time code to send the company's own number, and a wa.me link with it already typed. */
export async function createLinkCode(who: SessionRow): Promise<{ code: string; url: string; botPhone: string; expiresAt: string }> {
  const memberId = await memberOf(who);
  const bot = await botFor(who.orgId);
  if (bot.state !== "connected" || !bot.phone) throw new ValidationError("Your company's WhatsApp number isn't connected — ask your admin to set it up in Integrations → Team Bot");
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

const CODE_FAILED = ["⚠️ *That code didn't work*", "", "It may have expired — codes last 15 minutes.",
  "Get a new one in 1FOLD: your name → *WhatsApp* → *Connect WhatsApp*."].join("\n");

/**
 * A reply to a linked teammate, written down for their company's Deliveries (as `kind`). One that can't go right now
 * waits in the outbox and goes with the next alerts — never lost. Capped per number, like every reply.
 */
async function replyLogged(whatsapp: Replier, jid: string, text: string, to: { orgId: string; memberId: string; kind: string }): Promise<void> {
  if (!allowReply(jid)) return;
  try {
    await whatsapp.send(jid, text);
    await database().insert(s.whatsappOutbox).values({ jid, text, ...to, sentAt: new Date().toISOString() });
  } catch (e) {
    console.error("[whatsapp] couldn't reply now; it'll go with the next alerts", e);
    await database().insert(s.whatsappOutbox).values({ jid, text, ...to });
  }
}

/**
 * One message someone sent a company's number (`orgId`). Replies only to that chat — to a person who just sent a
 * code, or to a linked teammate of that company — and only about them; anyone else gets nothing at all. Replies are
 * capped per number, so the bot can't get stuck talking to a bot.
 */
export async function handleMessage(msg: Inbound, whatsapp: Replier, appUrl: string, orgId: string): Promise<void> {
  const reply: Replier = { send: async (jid, text) => { if (allowReply(jid)) await whatsapp.send(jid, text); } };
  const code = msg.text.match(CODE_RE);
  if (code) {
    if (!allowTry(msg.jid)) return;
    return linkNumber(msg, `1FOLD-${code[1].toUpperCase()}`, reply, whatsapp, orgId);
  }
  const ours = and(sameChat(msg), eq(s.whatsappLinks.orgId, orgId));
  const [link] = await database().select().from(s.whatsappLinks).where(ours);
  if (!link) return; // deny by default
  if (link.jid !== msg.jid) await database().update(s.whatsappLinks).set({ jid: msg.jid }).where(ours); // the other form of their id
  // The company's own words ask for the brief ("1FOLD", "TODAY" unless its admins changed them): theirs, nobody else's.
  const settings = await settingsFor(orgId);
  const to = { orgId, memberId: link.memberId };
  if (settings.words.includes(normalWord(msg.text))) {
    const text = await briefFor(orgId, link.memberId, appUrl);
    if (text) await replyLogged(whatsapp, msg.jid, text, { ...to, kind: "asked" });
    return;
  }
  await replyLogged(whatsapp, msg.jid, message(settings, "help"), { ...to, kind: "help" });
}

async function linkNumber(msg: Inbound, code: string, reply: Replier, whatsapp: Replier, orgId: string) {
  const [used] = await database().update(s.whatsappLinkCodes).set({ usedAt: sql`now()` })
    .where(and(eq(s.whatsappLinkCodes.id, sha256(code)), isNull(s.whatsappLinkCodes.usedAt), gt(s.whatsappLinkCodes.expiresAt, sql`now()`),
      eq(s.whatsappLinkCodes.orgId, orgId))) // a company's number links only its own people
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
  const settings = await settingsFor(used.orgId);
  await replyLogged(whatsapp, msg.jid, message(settings, "connected", { company: org?.name ?? "your company", schedule: scheduleText(settings) }),
    { orgId: used.orgId, memberId: used.memberId, kind: "linked" });
}
