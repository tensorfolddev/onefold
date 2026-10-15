// POST /api/files?ticket=<key>&name=<file name>   body: the image's bytes — adds it to that ticket.
import type { NextRequest } from "next/server";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { checkUpload, MAX_UPLOAD_BYTES, readUpTo, uploadImage } from "@/server/files";
import { handle, ok, requireSession, str } from "@/server/http";

export async function POST(req: NextRequest) {
  return handle(req, async () => {
    const who = await requireSession(req);
    limit(`upload:${who.userId}`, 60, MINUTE);
    const p = req.nextUrl.searchParams;
    const input = { ticketKey: str(p.get("ticket"), 40), name: str(p.get("name"), 300) };
    await checkUpload(who, input.ticketKey); // before reading (and storing) anyone's 10 MB
    return ok(await uploadImage(who, input, await readUpTo(req, MAX_UPLOAD_BYTES)));
  });
}
