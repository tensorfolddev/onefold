// Personal API tokens for MCP clients, for the signed-in person:
//   GET  /api/tokens/list                — their tokens (never the tokens themselves)
//   POST /api/tokens/create { name }     — a new token, shown in this answer only
//   POST /api/tokens/revoke { id }       — it stops working at once
import type { NextRequest } from "next/server";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { handle, ok, readBody, refuse, requireSession, str } from "@/server/http";
import { createApiToken, listApiTokens, revokeApiToken } from "@/server/mcp/tokens";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/tokens/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action !== "list") return refuse("Not found", 404);
    return ok({ tokens: await listApiTokens(await requireSession(req)) });
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/tokens/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    const who = await requireSession(req);
    const b = await readBody(req, 2048);
    if (action === "create") {
      limit(`tokens:${who.userId}`, 10, 60 * MINUTE);
      return ok(await createApiToken(who, str(b.name, 200)));
    }
    if (action === "revoke") { await revokeApiToken(who, str(b.id, 100)); return ok({}); }
    return refuse("Not found", 404);
  });
}
