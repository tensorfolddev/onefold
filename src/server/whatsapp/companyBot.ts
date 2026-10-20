// A company's own WhatsApp number — the only one its people hear from: its admins set it up (a QR, like WhatsApp Web)
// from Integrations → Team Bot, and the worker runs it. Once it's paired, everything for that company — briefs,
// alerts, replies, linking — goes through it; while it's reconnecting, alerts wait and briefs go by email (never from
// another number). Until it's paired, or once WhatsApp logs it out or it's disconnected, the company has no WhatsApp.
import { eq, sql } from "drizzle-orm";
import { loadCompany } from "../company/store.ts";
import { database, inScope } from "../db/client.ts";
import { numberDownEmail, sendEmail } from "../email.ts";
import * as s from "../db/schema.ts";
import type { SessionRow } from "../accounts.ts";
import type { BotState } from "./bot.ts";
import { asAdmin } from "./settings.ts";

export interface CompanyBot { state: BotState; qr: string | null; phone: string | null; request: string | null }
export type BotRequest = "pair" | "logout";

/** The company's own bot, or null when it has none set up. */
export async function companyBot(orgId: string): Promise<CompanyBot | null> {
  const [row] = await database().select().from(s.companyBots).where(eq(s.companyBots.orgId, orgId));
  return row ? { state: row.state as BotState, qr: row.qr, phone: row.phone, request: row.request } : null;
}

/** An admin asks for the company's own number (the worker shows a QR to scan), or to disconnect it. Cancelling a
 * number that was never paired is done at once (the worker then stops its pairing); a paired one is logged out by it. */
export async function requestCompanyBot(who: SessionRow, request: BotRequest): Promise<void> {
  await asAdmin(who);
  if (request === "logout" && !(await companyBot(who.orgId))?.phone) {
    await dropCompanyBot(who.orgId);
    return;
  }
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

/** The worker: what the company's connection is doing now. When WhatsApp logs it out, its admins get one email. */
export async function setCompanyBotState(orgId: string, state: BotState, extra: { qr?: string | null; phone?: string | null } = {}): Promise<void> {
  const patch: Partial<typeof s.companyBots.$inferInsert> = { state, qr: extra.qr ?? null, updatedAt: sql`now()` as unknown as string };
  if (extra.phone !== undefined) patch.phone = extra.phone;
  const [before] = await database().select({ state: s.companyBots.state }).from(s.companyBots).where(eq(s.companyBots.orgId, orgId));
  await database().update(s.companyBots).set(patch).where(eq(s.companyBots.orgId, orgId));
  if (state === "logged_out" && before && before.state !== "logged_out") await tellAdminsItsDown(orgId);
}

/** Through the company's own email (if it has one): its number was logged out — how to connect it again. */
async function tellAdminsItsDown(orgId: string): Promise<void> {
  const company = await inScope({ orgId }, (tx) => loadCompany(tx, orgId));
  if (!company) return;
  const teamBotUrl = `${(process.env.APP_URL ?? "").replace(/\/$/, "")}/admin/integrations/team-bot`;
  for (const admin of company.db.people.filter((p) => p.active && p.panel === "admin" && p.email)) {
    await sendEmail(numberDownEmail({ to: admin.email, orgName: company.db.org.name, teamBotUrl }), { orgId });
  }
}

/** The worker, once it's logged out: the company has no number until its admins set one up again. */
export async function dropCompanyBot(orgId: string): Promise<void> {
  await database().delete(s.companyBots).where(eq(s.companyBots.orgId, orgId));
}

/** The worker, when it starts: the companies with their own number. */
export async function companyBotIds(): Promise<string[]> {
  return (await database().select({ orgId: s.companyBots.orgId }).from(s.companyBots)).map((r) => r.orgId);
}

/** Whether a company's own number is the one in use: it's paired (connected, or reconnecting with its session). */
export const ownInUse = (own: CompanyBot | null): own is CompanyBot => !!own?.phone && (own.state === "connected" || own.state === "connecting");

/** The number a company's teammates link to and hear from — its own, once it's paired; else none. */
export async function botFor(orgId: string): Promise<{ state: BotState; phone: string | null }> {
  const own = await companyBot(orgId);
  const state = own?.state ?? "off";
  return { state, phone: ownInUse(own) ? own.phone : null };
}
