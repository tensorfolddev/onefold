// GET /api/files/<id>[?download=1] — an image on a ticket, or a file in a doc, that you can see. Ids never change;
// browsers keep each for an hour. Anything that isn't an image is only ever downloaded, never shown.
import type { NextRequest } from "next/server";
import { readImage } from "@/server/files";
import { handle, refuse, requireSession } from "@/server/http";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  return handle(req, async () => {
    const file = await readImage(await requireSession(req), id);
    if (!file) return refuse("Not found", 404);
    const disposition = file.download || req.nextUrl.searchParams.get("download") ? "attachment" : "inline";
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.download ? "application/octet-stream" : file.type,
        "Content-Length": String(file.bytes.length),
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, max-age=3600", // short enough that losing access to a product soon means losing its images
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  });
}
