// GET /api/docs/unfurl?url=https://…  — a web page's preview (title, description, image, icon) for a doc link card
import type { NextRequest } from "next/server";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { handle, ok, requireSession } from "@/server/http";
import { unfurl } from "@/server/unfurl";

const PER_MINUTE = 30;

export async function GET(req: NextRequest) {
  return handle(req, async () => {
    const who = await requireSession(req);
    limit(`unfurl:${who.userId}`, PER_MINUTE, MINUTE);
    return ok(await unfurl(req.nextUrl.searchParams.get("url") ?? ""));
  });
}
