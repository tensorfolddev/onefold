// GET /api/docs/linked?ticket=EN-12  — the docs you can see that link to a ticket
import type { NextRequest } from "next/server";
import { docsLinkingTicket } from "@/server/docs";
import { handle, ok, requireSession } from "@/server/http";

export async function GET(req: NextRequest) {
  return handle(req, async () => ok(await docsLinkingTicket(await requireSession(req), (req.nextUrl.searchParams.get("ticket") ?? "").slice(0, 40))));
}
