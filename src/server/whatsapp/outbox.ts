// Alerts the bot sends on someone's linked WhatsApp — e.g. "Ayla needs you: mentioned you in CH-1" — within seconds:
// the app queues them (urgent.ts), the worker sends them (sendOutbox, every few seconds). People without a linked
// number get nothing here (they still have the in-app notification).
import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import { database } from "../db/client.ts";
import * as s from "../db/schema.ts";

const MAX_ATTEMPTS = 5;
const BATCH = 20;

export interface Sender { send: (jid: string, text: string) => Promise<void> }

/**
 * Sends what's waiting, oldest first; a failure is retried on the next run, up to 5 times. `whatsapp`: one sender, or
 * the sender for each message's company (its own number, or 1FOLD's) — null while that one is down: the message waits.
 */
export async function sendOutbox(whatsapp: Sender | ((orgId: string | null) => Sender | null)): Promise<{ sent: number; failed: number } | undefined> {
  const senderFor = typeof whatsapp === "function" ? whatsapp : () => whatsapp;
  const db = database();
  const waiting = await db.select().from(s.whatsappOutbox)
    .where(and(isNull(s.whatsappOutbox.sentAt), lt(s.whatsappOutbox.attempts, MAX_ATTEMPTS)))
    .orderBy(asc(s.whatsappOutbox.id)).limit(BATCH);
  if (!waiting.length) return undefined;
  let sent = 0;
  let failed = 0;
  for (const m of waiting) {
    const sender = senderFor(m.orgId);
    if (!sender) continue; // its company's number is down: it waits, with no try used up
    try {
      await sender.send(m.jid, m.text);
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
