// Email, for a company's admins (Integrations → Email):
//   GET  /api/email/status — how it's set up here: the company's own Resend (its From address and the key's last 4),
//                            the server's, a test inbox, or nothing. Never a key.
//   POST /api/email/test   — a test email to the admin who asks (a few an hour). With { key?, from? } it goes through
//                            what they've typed, before saving it; a blank field falls back to what's saved.
//   POST /api/email/save   — { key?, from }: the company's own Resend (a blank key keeps the saved one).
//   POST /api/email/remove — forgets it: emails go through the server's Resend again, if it has one.
import type { NextRequest } from "next/server";
import { personFor } from "@/server/accounts";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { mustLoad } from "@/server/changes";
import { inScope } from "@/server/db/client";
import { checkResend, emailStatus, removeCompanyResend, resendFor, saveCompanyResend, sendEmail, testEmail, type Resend } from "@/server/email";
import { appUrl, handle, ok, readBody, refuse, requireSession } from "@/server/http";
import { asAdmin } from "@/server/whatsapp/settings";

const TESTS_PER_HOUR = 5;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/email/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action !== "status") return refuse("Not found", 404);
    const who = await requireSession(req);
    await asAdmin(who);
    return ok(await emailStatus(who.orgId));
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/email/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action !== "test" && action !== "save" && action !== "remove") return refuse("Not found", 404);
    const who = await requireSession(req);
    const meId = await asAdmin(who);
    if (action === "remove") {
      await removeCompanyResend(who.orgId);
      return ok(await emailStatus(who.orgId));
    }
    const b = await readBody(req, 4 * 1024);
    if (action === "save") {
      await saveCompanyResend(who.orgId, meId, { key: b.key, from: b.from });
      return ok(await emailStatus(who.orgId));
    }
    limit(`email-test:${who.userId}`, TESTS_PER_HOUR, 60 * MINUTE);
    const typed = checkResend({ key: b.key, from: b.from });
    const saved = await resendFor(who.orgId);
    const via: Resend | undefined = typed.key || typed.from
      ? { key: typed.key ?? saved?.key ?? "", from: typed.from ?? saved?.from ?? "" }
      : undefined;
    if (via && (!via.key || !via.from)) return refuse(via.key ? "Add the From address too" : "Paste your Resend API key too", 400);
    const { to, orgName } = await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
      const loaded = await mustLoad(tx, who);
      return { to: personFor(loaded, who.userId).email, orgName: loaded.db.org.name };
    });
    const sent = await sendEmail(testEmail({ to, orgName, integrationsUrl: `${appUrl(req)}/integrations/email` }), { orgId: who.orgId, via });
    if (!sent) return refuse(via || saved ? "Resend didn't take it — check the API key and that the From address's domain is verified in Resend" : "Email isn't set up yet — add your Resend API key", 502);
    return ok({ to });
  });
}
