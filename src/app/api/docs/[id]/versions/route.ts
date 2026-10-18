// GET /api/docs/:id/versions — the doc's versions, newest first (who, when, how long)
import type { NextRequest } from "next/server";
import { listVersions } from "@/server/docs";
import { handle, ok, requireSession } from "@/server/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/docs/[id]/versions">) {
  const { id } = await ctx.params;
  return handle(req, async () => ok(await listVersions(await requireSession(req), id)));
}
