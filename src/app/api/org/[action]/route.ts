// The signed-in company's actions:
//   POST /api/org/changes   { steps: [{ name, args }], undoable? }   — replay the browser's steps on the real data
//   POST /api/org/undo                                                — put back your last undoable change
//   POST /api/org/password  { personId, password }                    — your password, or (admins) a teammate's
//   POST /api/org/invites   { invites: [{ email, panel, role? }] }    — make invite links (emailed, and shown once)
//   POST /api/org/verify-email                                        — email me a new "confirm your email" link
//   GET  /api/org/events                                              — live updates (server-sent events): versions, doc saves, doc presence
import type { NextRequest } from "next/server";
import type { InviteInput } from "@/domain/commands";
import { sendVerification, setPassword } from "@/server/accounts";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { applySteps, createInvites, undoLast, viewFor, type Step } from "@/server/changes";
import { subscribe } from "@/server/events";
import { appUrl, handle, ok, readBody, refuse, requireSession, str } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/org/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    const who = await requireSession(req);
    if (action === "changes") {
      const b = await readBody(req);
      return ok(await applySteps(who, b.steps as Step[], { undoable: b.undoable === true }));
    }
    if (action === "undo") return ok(await undoLast(who));
    if (action === "password") {
      const b = await readBody(req, 8 * 1024);
      await setPassword(who, str(b.personId, 100), str(b.password, 300));
      return ok({});
    }
    if (action === "invites") {
      const b = await readBody(req, 64 * 1024);
      return ok(await createInvites(who, b.invites as InviteInput[], appUrl(req)));
    }
    if (action === "verify-email") {
      limit(`verify-email:${who.userId}`, 3, 15 * MINUTE);
      if (!(await sendVerification(who.userId, appUrl(req)))) return refuse("Couldn't send the email — please try again later", 503);
      return ok({});
    }
    return refuse("Not found", 404);
  });
}

const PING_MS = 25_000;
const KEYS_TTL_MS = 30_000; // how long a stream trusts its list of visible projects

export async function GET(req: NextRequest, ctx: RouteContext<"/api/org/[action]">) {
  const { action } = await ctx.params;
  if (action !== "events") return refuse("Not found", 404);
  return handle(req, async () => {
    const who = await requireSession(req);
    const encoder = new TextEncoder();
    let stop = () => {};
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (text: string) => {
          try { controller.enqueue(encoder.encode(text)); } catch { stop(); } // the browser went away
        };
        send("retry: 5000\n\n");
        // Doc events only go to people who can see that project ("" = the company's docs, everyone's).
        let keys: { set: Set<string>; at: number } | null = null;
        const canSee = async (productKey: string) => {
          if (!productKey) return true;
          if (!keys || Date.now() - keys.at > KEYS_TTL_MS) keys = { set: new Set((await viewFor(who)).db.products.map((p) => p.key)), at: Date.now() };
          return keys.set.has(productKey);
        };
        const unsubscribe = await subscribe(who.orgId, (e) => {
          if (e.type === "version") return send(`event: version\ndata: ${e.version}\n\n`);
          canSee(e.productKey).then((yes) => yes && send(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)).catch(() => {});
        });
        const ping = setInterval(() => send(": ping\n\n"), PING_MS);
        stop = () => { clearInterval(ping); unsubscribe(); };
        req.signal.addEventListener("abort", () => { stop(); try { controller.close(); } catch { /* already closed */ } });
      },
      cancel() { stop(); },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" },
    });
  });
}
