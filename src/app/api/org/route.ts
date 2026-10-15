// GET /api/org — the signed-in person's view of their company (and a fresh route cookie, in case their panel changed).
import type { NextRequest } from "next/server";
import { viewFor } from "@/server/changes";
import { handle, ok, requireSession, routeCookie } from "@/server/http";

export async function GET(req: NextRequest) {
  return handle(req, async () => {
    const view = await viewFor(await requireSession(req));
    return ok(view, { "Set-Cookie": await routeCookie(view.orgSlug, view.meId, view.panel) });
  });
}
