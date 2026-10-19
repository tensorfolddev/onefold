// WhatsApp, for the signed-in person:
//   GET  /api/whatsapp/status          — their link and whether the bot is there; platform admins also get the bot
//                                         itself (state, its number, and the QR code while it's pairing)
//   POST /api/whatsapp/connect         — a one-time code, and a wa.me link that sends it to the bot
//   POST /api/whatsapp/unlink          — forget their number
//   POST /api/whatsapp/pair | logout   — platform admins: pair the bot (a QR appears in status) or log it out
//   GET  /api/whatsapp/company         — the company's admins: its settings, who's linked, what went out
//   POST /api/whatsapp/company { settings } — the company's admins: change the brief, the reply words, the messages
import type { NextRequest } from "next/server";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { handle, ok, readBody, refuse, requireSession } from "@/server/http";
import { botStatus, createLinkCode, isPlatformAdmin, myWhatsApp, requestBot, unlinkWhatsApp } from "@/server/whatsapp/bot";
import { companyWhatsApp, saveSettings } from "@/server/whatsapp/settings";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/whatsapp/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action === "company") return ok(await companyWhatsApp(await requireSession(req)));
    if (action !== "status") return refuse("Not found", 404);
    const who = await requireSession(req);
    const me = await myWhatsApp(who);
    return ok({ me, bot: (await isPlatformAdmin(who)) ? await botStatus() : null });
  });
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/whatsapp/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    const who = await requireSession(req);
    if (action === "connect") {
      limit(`whatsapp-code:${who.userId}`, 10, 60 * MINUTE);
      return ok(await createLinkCode(who));
    }
    if (action === "unlink") { await unlinkWhatsApp(who); return ok({}); }
    if (action === "company") return ok(await saveSettings(who, (await readBody(req, 32 * 1024)).settings));
    if (action === "pair" || action === "logout") { await requestBot(who, action); return ok({}); }
    return refuse("Not found", 404);
  });
}
