// Email, for a company's admins (Integrations → Email):
//   GET  /api/email/status — how it's set up here: through Resend (and from which address), a test inbox, or not at
//                            all. Never the API key: that's in the server's environment (RESEND_API_KEY), not here.
//   POST /api/email/test   — a test email to the admin who asks (a few an hour).
import type { NextRequest } from "next/server";
import { personFor } from "@/server/accounts";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { mustLoad } from "@/server/changes";
import { inScope } from "@/server/db/client";
import { emailStatus, sendEmail, testEmail } from "@/server/email";
import { appUrl, handle, ok, refuse, requireSession } from "@/server/http";
import { asAdmin } from "@/server/whatsapp/settings";

const TESTS_PER_HOUR = 5;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/email/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action !== "status") return refuse("Not found", 404);
    await asAdmin(await requireSession(req));
    return ok(emailStatus());
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/email/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action !== "test") return refuse("Not found", 404);
    const who = await requireSession(req);
    await asAdmin(who);
    limit(`email-test:${who.userId}`, TESTS_PER_HOUR, 60 * MINUTE);
    const { to, orgName } = await inScope({ orgId: who.orgId, userId: who.userId }, async (tx) => {
      const loaded = await mustLoad(tx, who);
      return { to: personFor(loaded, who.userId).email, orgName: loaded.db.org.name };
    });
    const sent = await sendEmail(testEmail({ to, orgName, integrationsUrl: `${appUrl(req)}/integrations/email` }));
    if (!sent) return refuse(emailStatus().mode === "off" ? "Email isn't set up here yet — see How it works" : "Resend didn't take it — check the API key and the sending domain", 502);
    return ok({ to });
  });
}
