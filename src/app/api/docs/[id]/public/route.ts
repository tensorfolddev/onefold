// GET  /api/docs/:id/public            — the page's public link (its path), or null — for its owner only
// POST /api/docs/:id/public { on }     — turns the link on (anyone with it reads the page, signed out) or off (at once)
import type { NextRequest } from "next/server";
import { handle, ok, readBody, requireSession } from "@/server/http";
import { publicLinkOf, setPublicLink } from "@/server/publicLinks";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/docs/[id]/public">) {
  const { id } = await ctx.params;
  return handle(req, async () => ok({ path: await publicLinkOf(await requireSession(req), id) }));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/docs/[id]/public">) {
  const { id } = await ctx.params;
  return handle(req, async () => {
    const who = await requireSession(req);
    const b = await readBody(req, 1024);
    return ok({ path: await setPublicLink(who, id, b.on === true) });
  });
}
