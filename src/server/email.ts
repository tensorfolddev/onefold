// Email. With RESEND_API_KEY set, messages go out through Resend (from EMAIL_FROM). Without it nothing leaves the
// machine: with EMAIL_OUTBOX_DIR set each message is written there as JSON (tests and e2e read them back), otherwise
// development prints it to the server log. Sending never throws — a failed email is logged and reported as false.
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

export interface Email { to: string; subject: string; text: string; html: string }

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10_000;

/** Whether emails really reach people (Resend), or at least an inbox tests can read. Gates "confirm your email". */
export const emailEnabled = () => !!process.env.RESEND_API_KEY || !!process.env.EMAIL_OUTBOX_DIR;

export async function sendEmail(msg: Email): Promise<boolean> {
  try {
    const key = process.env.RESEND_API_KEY;
    if (key) {
      const res = await fetch(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: process.env.EMAIL_FROM || "1Fold <onboarding@resend.dev>", to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Resend answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return true;
    }
    const dir = process.env.EMAIL_OUTBOX_DIR;
    if (dir) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${Date.now()}-${randomBytes(4).toString("hex")}.json`), JSON.stringify(msg));
      return true;
    }
    if (process.env.NEXT_PUBLIC_APP_ENV === "dev") console.info(`[email] (not sent — no RESEND_API_KEY) to ${msg.to}: ${msg.subject}\n${msg.text}`);
    else console.warn(`[email] not sent — RESEND_API_KEY is not set: "${msg.subject}" to ${msg.to}`);
    return false;
  } catch (e) {
    console.error(`[email] couldn't send "${msg.subject}" to ${msg.to}`, e);
    return false;
  }
}

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
