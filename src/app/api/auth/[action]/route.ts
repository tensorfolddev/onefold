// Accounts:
//   POST /api/auth/signup | signin | signout
//   POST /api/auth/forgot { email }            — email a reset link (the answer never says whether the email exists)
//   POST /api/auth/reset  { token, password }  — set a new password from that link (without a password: just check it)
//   POST /api/auth/verify { token }            — confirm an email from its link
//   GET  /api/auth/slug?s=<short name>
import { after, type NextRequest } from "next/server";
import { panelHome, SESSION_COOKIE } from "@/data/session";
import { slugError } from "@/domain/commands";
import { confirmEmail, endSession, requestPasswordReset, resetLinkProblem, resetPassword, sendVerification, signIn, signUpCompany, slugTaken } from "@/server/accounts";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { appUrl, clientIp, handle, ok, readBody, refuse, signedInCookies, signedOutCookies, str } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/auth/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action === "signup") {
      limit(`signup:${clientIp(req)}`, 10, 60 * MINUTE);
      const b = await readBody(req, 8 * 1024);
      const session = await signUpCompany({
        name: str(b.name, 100), email: str(b.email, 200), password: str(b.password, 300), company: str(b.company, 100), slug: str(b.slug, 40),
      });
      const url = appUrl(req);
      after(() => sendVerification(session.userId, url).catch((e) => console.error("[signup] verification email", e)));
      return ok({ home: panelHome(session.panel) }, await signedInCookies(session));
    }
    if (action === "signin") {
      const b = await readBody(req, 8 * 1024);
      const email = str(b.email, 200).trim().toLowerCase();
      limit(`signin:ip:${clientIp(req)}`, 30, 15 * MINUTE);
      limit(`signin:email:${email}`, 10, 15 * MINUTE);
      const result = await signIn(email, str(b.password, 300), str(b.slug, 40) || undefined);
      if (result.kind === "choose") return ok({ choose: result.companies });
      return ok({ home: panelHome(result.session.panel) }, await signedInCookies(result.session));
    }
    if (action === "signout") {
      await endSession(req.cookies.get(SESSION_COOKIE)?.value);
      return ok({}, signedOutCookies());
    }
    if (action === "forgot") {
      const b = await readBody(req, 8 * 1024);
      const email = str(b.email, 200).trim().toLowerCase();
      limit(`forgot:ip:${clientIp(req)}`, 10, 15 * MINUTE);
      limit(`forgot:email:${email}`, 3, 15 * MINUTE);
      const url = appUrl(req);
      // After answering, so the response time can't reveal whether that email has a login.
      after(() => requestPasswordReset(email, url).catch((e) => console.error("[forgot] reset email", e)));
      return ok({});
    }
    if (action === "reset") {
      const b = await readBody(req, 8 * 1024);
      if (b.password === undefined) { // the page checking its link before asking for a password
        limit(`reset-check:${clientIp(req)}`, 60, 15 * MINUTE);
        return ok({ problem: await resetLinkProblem(str(b.token, 200)) });
      }
      limit(`reset:${clientIp(req)}`, 20, 15 * MINUTE);
      await resetPassword(str(b.token, 200), str(b.password, 300));
      return ok({}, signedOutCookies());
    }
    if (action === "verify") {
      limit(`verify:${clientIp(req)}`, 30, 15 * MINUTE);
      const b = await readBody(req, 8 * 1024);
      await confirmEmail(str(b.token, 200));
      return ok({});
    }
    return refuse("Not found", 404);
  });
}

export async function GET(req: NextRequest, ctx: RouteContext<"/api/auth/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action !== "slug") return refuse("Not found", 404);
    limit(`slug:${clientIp(req)}`, 120, MINUTE);
    const slug = str(req.nextUrl.searchParams.get("s"), 40);
    const problem = slugError(slug, () => false) ?? ((await slugTaken(slug)) ? "That address is taken — try another" : null);
    return ok({ problem });
  });
}
