// Alerts the bot sends on someone's linked WhatsApp — e.g. "Ayla mentioned you in Design spec" — within seconds:
// the app queues them (here), the worker sends them (sendOutbox, every few seconds). People without a linked number
// get nothing here (they still have the in-app notification).
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { database } from "../db/client.ts";
import * as s from "../db/schema.ts";

const MAX_ATTEMPTS = 5;
const BATCH = 20;

export interface Sender { send: (jid: string, text: string) => Promise<void> }

/** Queues "<actor> mentioned you in <doc>" for each person who has linked WhatsApp. */
export async function queueMentionAlerts(input: {
  orgId: string; memberIds: string[]; actor: string; docId: string; docTitle: string; space: string; appUrl?: string;
}): Promise<number> {
  if (!input.memberIds.length) return 0;
  const db = database();
  const links = await db.select({ jid: s.whatsappLinks.jid }).from(s.whatsappLinks)
    .where(and(eq(s.whatsappLinks.orgId, input.orgId), inArray(s.whatsappLinks.memberId, input.memberIds)));
  if (!links.length) return 0;
  const url = `${(input.appUrl ?? process.env.APP_URL ?? "").replace(/\/$/, "")}/d/${input.docId}`;
  const text = `🔔 *${input.actor}* mentioned you in *${input.docTitle}* (${input.space})\n${url}`;
  await db.insert(s.whatsappOutbox).values(links.map((l) => ({ jid: l.jid, text })));
  return links.length;
}

/** Sends what's waiting, oldest first; a failure is retried on the next run, up to 5 times. */
export async function sendOutbox(whatsapp: Sender): Promise<{ sent: number; failed: number } | undefined> {
  const db = database();
  const waiting = await db.select().from(s.whatsappOutbox)
    .where(and(isNull(s.whatsappOutbox.sentAt), lt(s.whatsappOutbox.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(s.whatsappOutbox.id)).limit(BATCH);
  if (!waiting.length) return undefined;
  let sent = 0;
  let failed = 0;
  for (const m of waiting) {
    try {
      await whatsapp.send(m.jid, m.text);
      await db.update(s.whatsappOutbox).set({ sentAt: new Date().toISOString() }).where(eq(s.whatsappOutbox.id, m.id));
      sent += 1;
    } catch (e) {
      console.error("[whatsapp] couldn't send an alert", e);
      await db.update(s.whatsappOutbox).set({ attempts: sql`${s.whatsappOutbox.attempts} + 1` }).where(eq(s.whatsappOutbox.id, m.id));
      failed += 1;
    }
  }
  return { sent, failed };
}
