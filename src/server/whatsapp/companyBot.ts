// A company's own WhatsApp number, instead of 1FOLD's bot: its admins set it up (a QR, like WhatsApp Web) from
// Integrations → Team Bot, and the worker runs it beside 1FOLD's. Once it's paired, everything for that company —
// briefs, alerts, replies, linking — goes through it; while it's reconnecting, alerts wait and briefs go by email
// (never from another number). Until it's paired, or once WhatsApp logs it out or it's disconnected, the company is on
// 1FOLD's bot.
import { eq, sql } from "drizzle-orm";
import { database } from "../db/client.ts";
import * as s from "../db/schema.ts";
import type { SessionRow } from "../accounts.ts";
import type { BotState } from "./bot.ts";
import { asAdmin } from "./settings.ts";

export interface CompanyBot { state: BotState; qr: string | null; phone: string | null; request: string | null }
export type BotRequest = "pair" | "logout";

/** The company's own bot, or null when it uses 1FOLD's. */
export async function companyBot(orgId: string): Promise<CompanyBot | null> {
  const [row] = await database().select().from(s.companyBots).where(eq(s.companyBots.orgId, orgId));
  return row ? { state: row.state as BotState, qr: row.qr, phone: row.phone, request: row.request } : null;
}

/** An admin asks for the company's own number (the worker shows a QR to scan), or to disconnect it. */
export async function requestCompanyBot(who: SessionRow, request: BotRequest): Promise<void> {
  await asAdmin(who);
  if (request === "pair") {
    await database().insert(s.companyBots).values({ orgId: who.orgId, request })
      .onConflictDoUpdate({ target: s.companyBots.orgId, set: { request, updatedAt: sql`now()` } });
  } else {
    await database().update(s.companyBots).set({ request, updatedAt: sql`now()` }).where(eq(s.companyBots.orgId, who.orgId));
  }
}

/** The worker: every request waiting for it, each taken (so it runs once). */
export async function takeCompanyBotRequests(): Promise<{ orgId: string; request: BotRequest }[]> {
  const { rows } = await database().execute(sql`
    with old as (select org_id, request from company_bots where request is not null for update)
    update company_bots c set request = null from old where c.org_id = old.org_id returning old.org_id as "orgId", old.request as request`);
  return (rows as { orgId: string; request: string }[]).filter((r) => r.request === "pair" || r.request === "logout") as { orgId: string; request: BotRequest }[];
}

/** The worker: what the company's connection is doing now. */
export async function setCompanyBotState(orgId: string, state: BotState, extra: { qr?: string | null; phone?: string | null } = {}): Promise<void> {
  const patch: Partial<typeof s.companyBots.$inferInsert> = { state, qr: extra.qr ?? null, updatedAt: sql`now()` as unknown as string };
  if (extra.phone !== undefined) patch.phone = extra.phone;
  await database().update(s.companyBots).set(patch).where(eq(s.companyBots.orgId, orgId));
}

/** The worker, once it's logged out: the company is back on 1FOLD's bot. */
export async function dropCompanyBot(orgId: string): Promise<void> {
  await database().delete(s.companyBots).where(eq(s.companyBots.orgId, orgId));
}

/** The worker, when it starts: the companies with their own number. */
export async function companyBotIds(): Promise<string[]> {
  return (await database().select({ orgId: s.companyBots.orgId }).from(s.companyBots)).map((r) => r.orgId);
}

/** Whether a company's own number is the one in use: it's paired (connected, or reconnecting with its session). */
export const ownInUse = (own: CompanyBot | null): own is CompanyBot => !!own?.phone && (own.state === "connected" || own.state === "connecting");

/** The number a company's teammates link to and hear from: its own, once it's paired, else 1FOLD's. */
export async function botFor(orgId: string): Promise<{ state: BotState; phone: string | null; own: boolean }> {
  const own = await companyBot(orgId);
  if (ownInUse(own)) return { state: own.state, phone: own.phone, own: true };
  const [main] = await database().select({ state: s.whatsappBot.state, phone: s.whatsappBot.phone }).from(s.whatsappBot).where(eq(s.whatsappBot.id, 1));
  return { state: (main?.state ?? "off") as BotState, phone: main?.phone ?? null, own: false };
}
