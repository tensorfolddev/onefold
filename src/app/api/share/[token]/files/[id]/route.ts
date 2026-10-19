// GET /api/share/<token>/files/<id> — a file in a page a public link opens (signed out): only that page's files, or a
// page inside it. Gone the moment the link is. Images and PDFs open in the browser; anything else downloads.
import type { NextRequest } from "next/server";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { fileResponse } from "@/server/files";
import { clientIp, handle, refuse } from "@/server/http";
import { readPublicFile } from "@/server/publicLinks";

const FILES_PER_MINUTE = 300; // a page full of images, a few times over

export async function GET(req: NextRequest, ctx: RouteContext<"/api/share/[token]/files/[id]">) {
  const { token, id } = await ctx.params;
  return handle(req, async () => {
    limit(`share-file:${clientIp(req)}`, FILES_PER_MINUTE, MINUTE);
    limit(`share-file-link:${token.slice(0, 64)}`, FILES_PER_MINUTE * 4, MINUTE); // however many addresses ask
    const file = await readPublicFile(token, id);
    if (!file) return refuse("Not found", 404);
    return fileResponse(file, !!req.nextUrl.searchParams.get("download"), "no-store"); // a link turned off stops at once
  });
}
