// GET  /api/docs/:id                      — the doc, its body (Markdown), revision and who has it open
// POST /api/docs/:id  { body, baseRev, force? } — autosave; 409 { latest } when someone saved since baseRev
import type { NextRequest } from "next/server";
import { DocConflict, MAX_BODY_CHARS, readDoc, saveBody } from "@/server/docs";
import { handle, ok, readBody, requireSession } from "@/server/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/docs/[id]">) {
  const { id } = await ctx.params;
  return handle(req, async () => ok(await readDoc(await requireSession(req), id)));
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/docs/[id]">) {
  const { id } = await ctx.params;
  return handle(req, async () => {
    const who = await requireSession(req);
    const b = await readBody(req, MAX_BODY_CHARS * 4);
    try {
      return ok(await saveBody(who, id, { body: b.body as string, baseRev: Number(b.baseRev), force: b.force === true }));
    } catch (e) {
      if (!(e instanceof DocConflict)) throw e;
      return Response.json({ ok: false, error: e.message, data: { latest: e.latest } }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }
  });
}
