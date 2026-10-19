// GET /api/files/<id>[?download=1] — an image on a ticket, or a file in a doc, that you can see. Ids never change;
// browsers keep each for an hour. Images and PDFs open in the browser; anything else is only ever downloaded.
import type { NextRequest } from "next/server";
import { fileResponse, readImage } from "@/server/files";
import { handle, refuse, requireSession } from "@/server/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  return handle(req, async () => {
    const file = await readImage(await requireSession(req), id);
    if (!file) return refuse("Not found", 404);
    return fileResponse(file, !!req.nextUrl.searchParams.get("download"));
  });
}
