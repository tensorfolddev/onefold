// /api/mcp — the MCP server (Streamable HTTP). Authorised by a personal API token, not the browser's session.
import type { NextRequest } from "next/server";
import { appUrl } from "@/server/http";
import { handleMcp } from "@/server/mcp/server";

export const dynamic = "force-dynamic";

async function serve(req: NextRequest): Promise<Response> {
  try {
    return await handleMcp(req, appUrl(req));
  } catch (e) {
    console.error("[mcp] request failed", e);
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: "Something went wrong — please try again" }, id: null }, { status: 500 });
  }
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
