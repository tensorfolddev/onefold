// GET /api/docs/search?q=  — titles and bodies of the docs you may see
import type { NextRequest } from "next/server";
import { searchDocs } from "@/server/docs";
import { handle, ok, requireSession } from "@/server/http";

export async function GET(req: NextRequest) {
  return handle(req, async () => ok(await searchDocs(await requireSession(req), (req.nextUrl.searchParams.get("q") ?? "").slice(0, 200))));
}
