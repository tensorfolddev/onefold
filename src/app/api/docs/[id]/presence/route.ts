// POST /api/docs/:id/presence  { editing, open? }  — "I'm here (typing)", or open:false "I left"; returns who's here
import type { NextRequest } from "next/server";
import { setPresence } from "@/server/docs";
import { handle, ok, readBody, requireSession } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/docs/[id]/presence">) {
  const { id } = await ctx.params;
  return handle(req, async () => {
    const who = await requireSession(req);
    const b = await readBody(req, 1024);
    return ok({ presence: await setPresence(who, id, { editing: b.editing === true, open: b.open !== false }) });
  });
}
