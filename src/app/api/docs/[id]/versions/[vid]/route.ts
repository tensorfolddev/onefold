// GET  /api/docs/:id/versions/:vid — one version's text
// POST /api/docs/:id/versions/:vid — make it the current text (what it replaces is kept as a version)
import type { NextRequest } from "next/server";
import { getVersion, restoreVersion } from "@/server/docs";
import { handle, ok, requireSession } from "@/server/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/docs/[id]/versions/[vid]">) {
  const { id, vid } = await ctx.params;
  return handle(req, async () => ok(await getVersion(await requireSession(req), id, vid)));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/docs/[id]/versions/[vid]">) {
  const { id, vid } = await ctx.params;
  return handle(req, async () => ok(await restoreVersion(await requireSession(req), id, vid)));
}
