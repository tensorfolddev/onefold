// Client Space — a client person's routes (a client session opens nothing else):
//   POST /api/client/link    { email }        — email me a sign-in link (the answer never says whether the email is a client's)
//   POST /api/client/check   { token }        — which company a link opens, or why it can't (doesn't use it up)
//   POST /api/client/signin  { token }        — "Continue": use the link once, start a client session
//   POST /api/client/act     { name, args }   — one client action (domain/commands/clientActions.ts)
//   POST /api/client/signout
//   POST /api/client/file?subject=…&name=…    body: any file (25 MB) — a line in a chat they can see (in an open request's, it answers it)
//   GET  /api/client/file?id=…[&download=1]   — a file in a chat they can see
//   GET  /api/client/view                     — what this client sees (domain/clientView.ts)
//   GET  /api/client/events                   — live updates: the company's version moved, refetch the view
import { after, type NextRequest } from "next/server";
import { CLIENT_HOME, SESSION_COOKIE } from "@/data/session";
import { endSession } from "@/server/accounts";
import { limit, MINUTE } from "@/server/auth/rateLimit";
import { checkClientUpload, clientLinkCheck, clientView, readClientFile, requestClientLink, runClientAction, signInWithClientLink, uploadClientFile } from "@/server/clientSpace";
import { fileResponse, MAX_DOC_FILE_BYTES, readUpTo } from "@/server/files";
import { subscribe } from "@/server/events";
import { appUrl, clientIp, handle, ok, readBody, refuse, requireClientSession, signedInCookies, signedOutCookies, str } from "@/server/http";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/client/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    if (action === "link") {
      const b = await readBody(req, 4 * 1024);
      const email = str(b.email, 200).trim().toLowerCase();
      limit(`client-link:ip:${clientIp(req)}`, 10, 15 * MINUTE);
      limit(`client-link:email:${email}`, 3, 15 * MINUTE);
      const url = appUrl(req);
      // After answering, so the response time can't reveal whether that email is a client's.
      after(() => requestClientLink(email, url).catch((e) => console.error("[client] sign-in link", e)));
      return ok({});
    }
    if (action === "check") {
      limit(`client-check:${clientIp(req)}`, 60, 15 * MINUTE);
      const b = await readBody(req, 4 * 1024);
      return ok(await clientLinkCheck(str(b.token, 200)));
    }
    if (action === "signin") {
      limit(`client-signin:${clientIp(req)}`, 20, 15 * MINUTE);
      const b = await readBody(req, 4 * 1024);
      return ok({ home: CLIENT_HOME }, await signedInCookies(await signInWithClientLink(str(b.token, 200))));
    }
    if (action === "act") {
      const who = await requireClientSession(req);
      limit(`client-act:${who.userId}`, 60, MINUTE);
      const b = await readBody(req, 64 * 1024);
      return ok(await runClientAction(who, b.name, b.args));
    }
    if (action === "file") {
      const who = await requireClientSession(req);
      limit(`client-file:${who.userId}`, 10, MINUTE);
      const subject = str(req.nextUrl.searchParams.get("subject"), 120);
      await checkClientUpload(who, subject); // before reading (and storing) anyone's 25 MB
      return ok(await uploadClientFile(who, subject, { name: str(req.nextUrl.searchParams.get("name"), 300) }, await readUpTo(req, MAX_DOC_FILE_BYTES, "Files")));
    }
    if (action === "signout") {
      await endSession(req.cookies.get(SESSION_COOKIE)?.value);
      return ok({}, signedOutCookies());
    }
    return refuse("Not found", 404);
  });
}

const PING_MS = 25_000;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/client/[action]">) {
  const { action } = await ctx.params;
  return handle(req, async () => {
    const who = await requireClientSession(req);
    if (action === "view") return ok(await clientView(who));
    if (action === "file") {
      limit(`client-file-get:${who.userId}`, 120, MINUTE);
      const file = await readClientFile(who, str(req.nextUrl.searchParams.get("id"), 100));
      return file ? fileResponse(file, !!req.nextUrl.searchParams.get("download")) : refuse("Not found", 404);
    }
    if (action !== "events") return refuse("Not found", 404);
    const encoder = new TextEncoder();
    let stop = () => {};
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (text: string) => {
          try { controller.enqueue(encoder.encode(text)); } catch { stop(); } // the browser went away
        };
        send("retry: 5000\n\n");
        // Only that the company changed (never what): the browser refetches its own view.
        const unsubscribe = await subscribe(who.orgId, (e) => { if (e.type === "version") send(`event: version\ndata: ${e.version}\n\n`); });
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
