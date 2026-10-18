// POST /api/files?ticket=<key>&name=<file name>   body: the image's bytes — adds it to that ticket.
// POST /api/files?doc=<id>&name=<file name>       body: any file's bytes (25 MB) — adds it to that doc.
import type { NextRequest } from "next/server";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { checkDocUpload, checkUpload, MAX_DOC_FILE_BYTES, MAX_UPLOAD_BYTES, readUpTo, uploadDocFile, uploadImage } from "@/server/files";
import { handle, ok, requireSession, str } from "@/server/http";

export async function POST(req: NextRequest) {
  return handle(req, async () => {
    const who = await requireSession(req);
    limit(`upload:${who.userId}`, 60, MINUTE);
    const p = req.nextUrl.searchParams;
    const name = str(p.get("name"), 300);
    const docId = str(p.get("doc"), 100);
    if (docId) {
      await checkDocUpload(who, docId); // before reading (and storing) anyone's 25 MB
      return ok(await uploadDocFile(who, { docId, name }, await readUpTo(req, MAX_DOC_FILE_BYTES, "Files")));
    }
    const input = { ticketKey: str(p.get("ticket"), 40), name };
    await checkUpload(who, input.ticketKey); // before reading (and storing) anyone's 10 MB
    return ok(await uploadImage(who, input, await readUpTo(req, MAX_UPLOAD_BYTES)));
  });
}
