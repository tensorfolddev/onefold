// GET /api/health — for Docker and deploys: is this copy running, can it reach its database, and which commit is it?
import { sql } from "drizzle-orm";
import { database } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    await database().execute(sql`select 1`);
    return Response.json({ ok: true, commit: process.env.GIT_SHA ?? "dev" }, { headers });
  } catch (e) {
    console.error("[health] database unreachable", e);
    return Response.json({ ok: false }, { status: 503, headers });
  }
}
