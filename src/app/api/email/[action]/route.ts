// Email, for a company's admins (Integrations → Email):
//   GET  /api/email/status — how it's set up here: the company's own Resend (its From address and the key's last 4),
//                            the server's, a test inbox, or nothing. Never a key.
//   POST /api/email/test   — a test email to the admin who asks (a few an hour). With { key?, from? } it goes through
//                            what they've typed, before saving it; a blank field falls back to what's saved.
//   POST /api/email/save   — { key?, from }: sends that test email first, and saves only when Resend takes it — so a
//                            key or From address that can't send never replaces a working one. A blank key keeps
//                            the saved one.
//   POST /api/email/remove — forgets it: emails go through the server's Resend again, if it has one.
// A failed send answers with Resend's reason ("The acme.com domain is not verified…").
import type { NextRequest } from "next/server";
import { personFor } from "@/server/accounts";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { mustLoad } from "@/server/changes";
import { inScope } from "@/server/db/client";
import { deliverEmail, emailStatus, removeCompanyResend, saveCompanyResend, testEmail, typedResend } from "@/server/email";
import { appUrl, handle, ok, readBody, refuse, requireSession } from "@/server/http";
import { asAdmin } from "@/server/whatsapp/settings";

const TESTS_PER_HOUR = 10; // a save sends one too

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
    const typed = await typedResend(who.orgId, { key: b.key, from: b.from });
    if (action === "save" && !typed) return refuse("Paste your Resend API key and the From address", 400);
    limit(`email-test:${who.userId}`, TESTS_PER_HOUR, 60 * MINUTE);
    const { to, orgName } = await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
      const loaded = await mustLoad(tx, who);
      return { to: personFor(loaded, who.userId).email, orgName: loaded.db.org.name };
    });
    const sent = await deliverEmail(testEmail({ to, orgName, integrationsUrl: `${appUrl(req)}/integrations/email` }), { orgId: who.orgId, via: typed ?? undefined });
    if (!sent.ok) return refuse(action === "save" ? `Not saved. ${sent.reason}` : sent.reason, 502);
    if (action === "save") await saveCompanyResend(who.orgId, meId, typed!);
    return ok({ ...(await emailStatus(who.orgId)), to });
  });
}
