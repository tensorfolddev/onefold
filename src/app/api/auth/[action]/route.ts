// Accounts: POST /api/auth/signup | signin | signout, GET /api/auth/slug?s=<short name>.
import type { NextRequest } from "next/server";
import { panelHome, SESSION_COOKIE } from "@/data/session";
import { slugError } from "@/domain/commands";
import { endSession, signIn, signUpCompany, slugTaken } from "@/server/accounts";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { clientIp, handle, ok, readBody, refuse, signedInCookies, signedOutCookies, str } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/auth/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action === "signup") {
      limit(`signup:${clientIp(req)}`, 10, 60 * MINUTE);
      const b = await readBody(req, 8 * 1024);
      const session = await signUpCompany({
        name: str(b.name, 100), email: str(b.email, 200), password: str(b.password, 300), company: str(b.company, 100), slug: str(b.slug, 40),
      });
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
