// Email, through Resend: a company's own account (its admins set it in Integrations → Email — the key encrypted), or
// else the server's (RESEND_API_KEY, from EMAIL_FROM). With EMAIL_OUTBOX_DIR set nothing leaves the machine: each
// message is written there as JSON (tests and e2e read them back). With no Resend, development prints it to the
// server log. Sending never throws — a failed email is logged and reported, with Resend's reason.
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { ValidationError } from "../domain/commands/index.ts";
import { seal, unseal } from "./auth/secrets.ts";
import { inScope } from "./db/client.ts";
import * as s from "./db/schema.ts";

export interface Email { to: string; subject: string; text: string; html: string }
/** A Resend account to send through: its API key, and the address emails come from. */
export interface Resend { key: string; from: string }

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;
const DEFAULT_FROM = "1Fold <onboarding@resend.dev>";
const KEY_RE = /^re_[A-Za-z0-9_-]{8,200}$/;
const ADDRESS = "[^\\s<>@]+@[^\\s<>@]+\\.[^\\s<>@]+";
const FROM_RE = new RegExp(`^(?:[^<>\\n]{1,80}<${ADDRESS}>|${ADDRESS})$`);

/** Whether the server itself can send (RESEND_API_KEY), or at least has an inbox tests can read. */
export const emailEnabled = () => !!process.env.RESEND_API_KEY || !!process.env.EMAIL_OUTBOX_DIR;

/** The server's own Resend (RESEND_API_KEY / EMAIL_FROM), if it has one. */
const serverResend = (): Resend | null => (process.env.RESEND_API_KEY ? { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM || DEFAULT_FROM } : null);

// ---------- a company's own Resend (Integrations → Email) ----------

/** The company's own Resend, its key decrypted — or null (none set, or it can't be read any more). */
export async function companyResend(orgId: string): Promise<(Resend & { hint: string }) | null> {
  const [row] = await inScope({ orgId }, (tx) => tx.select().from(s.companyEmail).where(eq(s.companyEmail.orgId, orgId)));
  if (!row) return null;
  try {
    return { key: unseal(row.apiKey), from: row.fromAddress, hint: row.keyHint };
  } catch (e) {
    console.error(`[email] ${orgId}'s Resend key can't be read (SESSION_SECRET changed?) — it needs entering again`, e);
    return null;
  }
}

/** A key and From address as typed, checked. */
export function checkResend(input: { key?: unknown; from?: unknown }): { key?: string; from?: string } {
  const out: { key?: string; from?: string } = {};
  if (input.key !== undefined && input.key !== "") {
    const key = String(input.key).trim();
    if (!KEY_RE.test(key)) throw new ValidationError("That doesn't look like a Resend API key — they start with re_");
    out.key = key;
  }
  if (input.from !== undefined && input.from !== "") {
    const from = String(input.from).trim().replace(/\s+</, " <");
    if (from.length > 200 || !FROM_RE.test(from)) throw new ValidationError("Write the From address like: Acme <hello@acme.com>");
    out.from = from;
  }
  return out;
}

/** What an admin typed, with a blank field filled in from the company's saved Resend; null when nothing was typed. */
export async function typedResend(orgId: string, input: { key?: unknown; from?: unknown }): Promise<Resend | null> {
  const typed = checkResend(input);
  if (!typed.key && !typed.from) return null;
  const saved = await companyResend(orgId);
  const key = typed.key ?? saved?.key;
  const from = typed.from ?? saved?.from;
  if (!key) throw new ValidationError("Paste your Resend API key");
  if (!from) throw new ValidationError("Add the From address — like: Acme <hello@acme.com>");
  return { key, from };
}

/** Saves the company's own Resend (checked first: the route only saves one that just sent a test email). */
export async function saveCompanyResend(orgId: string, memberId: string, resend: Resend): Promise<void> {
  const row = { apiKey: seal(resend.key), keyHint: resend.key.slice(-4), fromAddress: resend.from, updatedBy: memberId, updatedAt: sql`now()` };
  await inScope({ orgId }, (tx) => tx.insert(s.companyEmail).values({ orgId, ...row }).onConflictDoUpdate({ target: s.companyEmail.orgId, set: row }));
}

/** Forgets the company's own Resend: its emails go through the server's again (if it has one). */
export async function removeCompanyResend(orgId: string): Promise<void> {
  await inScope({ orgId }, (tx) => tx.delete(s.companyEmail).where(eq(s.companyEmail.orgId, orgId)));
}

/** Which Resend a company's emails go through: its own, else the server's; null when neither is set. */
export async function resendFor(orgId?: string): Promise<Resend | null> {
  return (orgId ? await companyResend(orgId).catch(() => null) : null) ?? serverResend();
}

/** Whether this company's emails reach people (its Resend or the server's), or a test inbox. Gates "confirm your email". */
export async function emailOn(orgId?: string): Promise<boolean> {
  return !!process.env.EMAIL_OUTBOX_DIR || !!(await resendFor(orgId));
}

export interface EmailStatus { mode: "own" | "server" | "outbox" | "off"; from: string; hint: string | null }
/** How email is set up for a company, for Integrations → Email — never its key, only the key's last 4. */
export async function emailStatus(orgId?: string): Promise<EmailStatus> {
  const own = orgId ? await companyResend(orgId).catch(() => null) : null;
  if (own) return { mode: "own", from: own.from, hint: own.hint };
  const server = serverResend();
  return { mode: server ? "server" : process.env.EMAIL_OUTBOX_DIR ? "outbox" : "off", from: server?.from ?? DEFAULT_FROM, hint: null };
}

export type Sent = { ok: true } | { ok: false; reason: string };

/**
 * Sends one email, and says why when it didn't go (in Resend's own words, like "The acme.com domain is not verified").
 * A test inbox (EMAIL_OUTBOX_DIR) takes everything, so tests never send real email; otherwise it goes through `via`,
 * or the company's Resend, or the server's — or, with none, only to the log.
 */
export async function deliverEmail(msg: Email, opts: { orgId?: string; via?: Resend } = {}): Promise<Sent> {
  try {
    const dir = process.env.EMAIL_OUTBOX_DIR;
    if (dir) {
      await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
      await writeFile(/*turbopackIgnore: true*/ join(dir, `${Date.now()}-${randomBytes(4).toString("hex")}.json`), JSON.stringify(msg));
      return { ok: true };
    }
    const resend = opts.via ?? (await resendFor(opts.orgId));
    if (!resend) {
      if (process.env.NEXT_PUBLIC_APP_ENV === "dev") console.info(`[email] (not sent — no Resend set up) to ${msg.to}: ${msg.subject}\n${msg.text}`);
      else console.warn(`[email] not sent — no Resend set up (Integrations → Email, or RESEND_API_KEY): "${msg.subject}" to ${msg.to}`);
      return { ok: false, reason: "Email isn't set up yet — add a Resend API key in Integrations → Email" };
    }
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${resend.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: resend.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) return { ok: true };
    const body = (await res.text()).slice(0, 500);
    console.error(`[email] Resend refused "${msg.subject}" to ${msg.to} (${res.status}): ${body}`);
    return { ok: false, reason: `Resend refused it: ${resendMessage(body) ?? `error ${res.status}`}` };
  } catch (e) {
    console.error(`[email] couldn't send "${msg.subject}" to ${msg.to}`, e);
    return { ok: false, reason: "Couldn't reach Resend — try again in a minute" };
  }
}

/** Resend's error message, from its JSON answer. */
function resendMessage(body: string): string | null {
  try {
    const m = (JSON.parse(body) as { message?: unknown }).message;
    return typeof m === "string" && m ? m.slice(0, 300) : null;
  } catch {
    return null;
  }
}

/** Sends one email; false (and logged) when it didn't go. */
export const sendEmail = async (msg: Email, opts: { orgId?: string; via?: Resend } = {}): Promise<boolean> => (await deliverEmail(msg, opts)).ok;

// ---------- the messages ----------

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
/** Names and company names are typed by people: everything put into HTML is escaped. */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** One plain, readable layout: a heading, a few lines, a button, and the link spelled out for when buttons don't work. */
function message(to: string, subject: string, lines: string[], action: { label: string; url: string }, footer: string): Email {
  const text = [...lines, "", `${action.label}: ${action.url}`, "", footer].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#323338">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:12px;padding:32px">
<tr><td style="font-size:20px;font-weight:700;padding-bottom:16px">1Fold</td></tr>
${lines.map((l) => `<tr><td style="font-size:15px;line-height:22px;padding-bottom:12px">${escapeHtml(l)}</td></tr>`).join("\n")}
<tr><td style="padding:12px 0 20px"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#0073ea;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px">${escapeHtml(action.label)}</a></td></tr>
<tr><td style="font-size:13px;line-height:20px;color:#676879;padding-bottom:12px">Or open this link: <a href="${escapeHtml(action.url)}" style="color:#0073ea;word-break:break-all">${escapeHtml(action.url)}</a></td></tr>
<tr><td style="font-size:12px;line-height:18px;color:#676879;border-top:1px solid #e6e9ef;padding-top:16px">${escapeHtml(footer)}</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject, text, html };
}

export const inviteEmail = (p: { to: string; orgName: string; inviterName: string; link: string; days: number }) => message(
  p.to, `${p.inviterName} invited you to ${p.orgName} on 1Fold`,
  [`${p.inviterName} invited you to join ${p.orgName} on 1Fold, where the team plans products and works tickets.`,
    `Open the link to choose your name and password. It works once, for ${p.to}, for ${p.days} days.`],
  { label: `Join ${p.orgName}`, url: p.link },
  "Not expecting this? You can ignore this email — nothing happens unless you open the link.",
);

export const resetEmail = (p: { to: string; link: string; minutes: number }) => message(
  p.to, "Reset your 1Fold password",
  ["Someone (hopefully you) asked to reset the password for this 1Fold login.",
    `Choose a new password with the link below. It works once, for ${p.minutes} minutes.`],
  { label: "Choose a new password", url: p.link },
  "Didn't ask for this? Ignore this email — your password stays the same.",
);

export const verifyEmail = (p: { to: string; link: string }) => message(
  p.to, "Confirm your email for 1Fold",
  ["Confirm this is your email address, so you can invite your team and get updates from 1Fold."],
  { label: "Confirm my email", url: p.link },
  "Didn't create a 1Fold account? Ignore this email.",
);

/** The daily brief, when WhatsApp can't take it. `lines` is the WhatsApp text, kept as plain lines. */
export const briefEmail = (p: { to: string; orgName: string; text: string; myWorkUrl: string }) => message(
  p.to, `Your tasks today at ${p.orgName}`,
  p.text.split("\n").filter((l) => l.trim() && !/^[━\s]+$/.test(l) && !/^Reply |🤍/.test(l)).map((l) => l.replace(/[*_]/g, "").trim()),
  { label: "Open My Work", url: p.myWorkUrl },
  "WhatsApp couldn't be reached this morning, so your 1Fold brief came by email instead.",
);

export const botDownEmail = (p: { to: string; settingsUrl: string }) => message(
  p.to, "1Fold's WhatsApp bot was disconnected",
  ["The WhatsApp number 1Fold sends daily briefs from was logged out (or WhatsApp stopped it).",
    "Until it's connected again, briefs go out by email. To reconnect: Settings → WhatsApp → Connect the bot, then scan the code from the bot's phone (Linked devices → Link a device)."],
  { label: "Open Settings", url: p.settingsUrl },
  "You get this because you can manage 1Fold's WhatsApp bot (PLATFORM_ADMIN_EMAILS).",
);

/** Integrations → Email: a test, to the admin who asked for it. */
export const testEmail = (p: { to: string; orgName: string; integrationsUrl: string }) => message(
  p.to, "1Fold can send you email",
  [`This is a test from Integrations → Email at ${p.orgName}.`,
    "Invites, password resets, email confirmations, and the daily brief when WhatsApp is down all go out this way."],
  { label: "Open Integrations", url: p.integrationsUrl },
  "You get this because you asked for a test email in 1Fold.",
);
