// WhatsApp, for the signed-in person:
//   GET  /api/whatsapp/status          — their link, and their company's own number (botInfo: its state and number)
//   POST /api/whatsapp/connect         — a one-time code, and a wa.me link that sends it to the bot
//   POST /api/whatsapp/unlink          — forget their number
//   GET  /api/whatsapp/company         — the company's admins: its settings, who's linked, what went out
//   POST /api/whatsapp/company { settings } — the company's admins: change the brief, the reply words, the messages
//   POST /api/whatsapp/company-bot { request: "pair" | "logout" } — the company's admins: connect its own number, or
//                                         disconnect it (then the company has no WhatsApp until it connects one)
import type { NextRequest } from "next/server";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { handle, ok, readBody, refuse, requireSession } from "@/server/http";
import { createLinkCode, myWhatsApp, unlinkWhatsApp } from "@/server/whatsapp/bot";
import { botFor, requestCompanyBot } from "@/server/whatsapp/companyBot";
import { companyWhatsApp, saveSettings, setTimeZone } from "@/server/whatsapp/settings";

export async function GET(req: NextRequest, ctx: RouteContext<"/api/whatsapp/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action === "company") return ok(await companyWhatsApp(await requireSession(req)));
    if (action !== "status") return refuse("Not found", 404);
    const who = await requireSession(req);
    const [me, botInfo] = await Promise.all([myWhatsApp(who), botFor(who.orgId)]);
    return ok({ me, botInfo });
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
    if (action === "timezone") return ok({ timeZone: await setTimeZone(who, (await readBody(req, 1024)).timeZone) });
    if (action === "company-bot") {
      const request = (await readBody(req, 1024)).request;
      if (request !== "pair" && request !== "logout") return refuse("Ask to connect or to disconnect", 400);
      limit(`company-bot:${who.orgId}`, 20, 60 * MINUTE);
      await requestCompanyBot(who, request);
      return ok({});
    }
    return refuse("Not found", 404);
  });
}
