// A company's own Google Drive, for its admins (Integrations → Google Drive):
//   GET  /api/drive/connect    — off to Google's sign-in (asking only for the files 1Fold makes)
//   GET  /api/drive/callback   — Google's answer: connected; back to the Drive page either way
//   GET  /api/drive/status     — connected to which account and the last backup; ?backups=1 also lists them (asks Google)
//   POST /api/drive/backup     — back up now (a few an hour)
//   POST /api/drive/disconnect — forget it (the backups stay in that Drive)
import type { NextRequest } from "next/server";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { backUpCompany, connectUrl, disconnectDrive, driveStatus, finishConnect } from "@/server/backup/drive";
import { appUrl, handle, ok, refuse, requireSession } from "@/server/http";
import { asAdmin } from "@/server/whatsapp/settings";

const BACKUPS_PER_HOUR = 3;
const PAGE = "/admin/integrations/drive";

/** Back to the Drive page, saying how it went (the page shows it). */
const back = (req: NextRequest, result: string, why = "") =>
  Response.redirect(`${appUrl(req)}${PAGE}?drive=${result}${why ? `&why=${encodeURIComponent(why.slice(0, 200))}` : ""}`, 303);

export async function GET(req: NextRequest, ctx: RouteContext<"/api/drive/[action]">) {
  const { action } = await ctx.params;
  if (action === "connect" || action === "callback") {
    try {
      const who = await requireSession(req);
      if (action === "connect") return Response.redirect(await connectUrl(who, appUrl(req)), 303);
      const q = req.nextUrl.searchParams;
      if (q.get("error")) return back(req, "cancelled"); // they said no on Google's page
      await finishConnect(who, { code: q.get("code") ?? "", state: q.get("state") ?? "" }, appUrl(req));
      return back(req, "connected");
    } catch (e) {
      console.error(`[drive] ${action} failed`, e);
      return back(req, "failed", e instanceof Error ? e.message : "");
    }
  }
  return handle(req, async () => {
    if (action !== "status") return refuse("Not found", 404);
    return ok(await driveStatus(await requireSession(req), req.nextUrl.searchParams.get("backups") === "1"));
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/drive/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    const who = await requireSession(req);
    if (action === "disconnect") {
      await disconnectDrive(who);
      return ok(await driveStatus(who, true));
    }
    if (action !== "backup") return refuse("Not found", 404);
    await asAdmin(who);
    limit(`drive-backup:${who.orgId}`, BACKUPS_PER_HOUR, 60 * MINUTE);
    const done = await backUpCompany(who.orgId);
    if (!done.ok) return refuse(done.reason, 502);
    return ok(await driveStatus(who, true));
  });
}
