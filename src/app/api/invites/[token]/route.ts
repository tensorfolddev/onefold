// Invite links (no sign-in needed): GET /api/invites/<token> shows the invite, POST { name, password } accepts it.
import type { NextRequest } from "next/server";
import { panelHome } from "@/data/session";
import { acceptInvitation, lookupInvite } from "@/server/accounts";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { clientIp, handle, ok, readBody, signedInCookies, str } from "@/server/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/invites/[token]">) {
  const { token } = await ctx.params;
  return handle(req, async () => {
    limit(`invite:${clientIp(req)}`, 60, 15 * MINUTE);
    return ok(await lookupInvite(str(token, 100)));
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/invites/[token]">) {
  const { token } = await ctx.params;
  return handle(req, async () => {
    limit(`invite:${clientIp(req)}`, 60, 15 * MINUTE);
    const b = await readBody(req, 8 * 1024);
    const session = await acceptInvitation(str(token, 100), { name: str(b.name, 100), password: str(b.password, 300) });
    return ok({ home: panelHome(session.panel) }, await signedInCookies(session));
  });
}
