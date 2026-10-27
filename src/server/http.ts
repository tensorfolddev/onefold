// What every API route shares: one JSON shape ({ ok, data } / { ok, error }), body size limits, refusing cross-site
// changes, the session cookies, and errors that tell the person what happened without leaking internals.
import type { NextRequest } from "next/server";
import { AccessError, ValidationError } from "../domain/commands/index.ts";
import { ROUTE_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_S, signRoute, type RoutePanel } from "../data/session.ts";
import { readSession, type SessionRow, type SignedIn } from "./accounts.ts";

export class NotSignedIn extends Error {}
export class TooMany extends Error {}

/** Copies headers (keeping every Set-Cookie) and forbids caching: API answers are per person. */
const noStore = (headers: HeadersInit) => {
  const h = new Headers(headers);
  h.set("Cache-Control", "no-store");
  return h;
};
export const ok = <T>(data: T, headers: HeadersInit = {}) => Response.json({ ok: true, data }, { headers: noStore(headers) });
export const refuse = (error: string, status: number, headers: HeadersInit = {}) =>
  Response.json({ ok: false, error }, { status, headers: noStore(headers) });

/** A JSON object body, at most `maxBytes`. Anything else is a ValidationError. */
export async function readBody(req: Request, maxBytes = 256 * 1024): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (text.length > maxBytes) throw new ValidationError("That request is too large");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new ValidationError("Couldn't read that request"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Couldn't read that request");
  return value as Record<string, unknown>;
}
export const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");

/** Changes must come from our own pages: the browser's Origin must match the host it's talking to. */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === req.headers.get("host"); } catch { return false; }
}

/**
 * Where people open 1Fold — links in emails are built from it. Production must set APP_URL: the request's own Host
 * can be forged, and a reset link pointing at someone else's site would hand them the token.
 */
export function appUrl(req: NextRequest): string {
  const url = process.env.APP_URL;
  if (!url && process.env.NODE_ENV === "production") throw new Error("APP_URL must be set (e.g. https://1fold.tensorfold.ai)");
  return (url ?? req.nextUrl.origin).replace(/\/$/, "");
}

/** The person's real IP. Behind Caddy, the last X-Forwarded-For entry is the one Caddy added. */
export const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() || "local";

/** A teammate's session. A client's opens only the client space's routes (/api/client/…). */
export async function requireSession(req: NextRequest): Promise<SessionRow> {
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) throw new NotSignedIn();
  if (session.kind !== "team") throw new AccessError();
  return session;
}

/** A client's session (Client Space) — never a teammate's. */
export async function requireClientSession(req: NextRequest): Promise<SessionRow> {
  const session = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) throw new NotSignedIn();
  if (session.kind !== "client") throw new AccessError();
  return session;
}

/** Runs a route: same-origin check for changes, and every error mapped to a plain answer. */
export async function handle(req: NextRequest, fn: () => Promise<Response>): Promise<Response> {
  try {
    if (req.method !== "GET" && !sameOrigin(req)) return refuse("That request came from another site", 403);
    return await fn();
  } catch (e) {
    if (e instanceof ValidationError) return refuse(e.message, 400);
    if (e instanceof AccessError) return refuse(e.message, 403);
    if (e instanceof NotSignedIn) return refuse("Please sign in again", 401, signedOutCookies());
    if (e instanceof TooMany) return refuse("Too many tries — wait a few minutes and try again", 429);
    console.error(`[api] ${req.method} ${req.nextUrl.pathname.replace(/\/share\/[^/]+/, "/share/…")}`, e); // a public link's token never goes in a log
    return refuse("Something went wrong — please try again", 500);
  }
}

// ---------- cookies ----------

const secure = () => process.env.NODE_ENV === "production";
const attrs = (maxAge: number) => `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure() ? "; Secure" : ""}`;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ random characters)");
  return secret;
}

/** The route cookie proxy.ts uses to send people to their panel (signed; grants nothing by itself). */
export const routeCookie = async (orgSlug: string, personId: string, panel: RoutePanel) =>
  `${ROUTE_COOKIE}=${await signRoute({ org: orgSlug, personId, panel }, sessionSecret())}; ${attrs(SESSION_MAX_AGE_S)}`;

export async function signedInCookies(s: Pick<SignedIn, "token" | "orgSlug" | "personId"> & { panel: RoutePanel }): Promise<Headers> {
  const h = new Headers();
  h.append("Set-Cookie", `${SESSION_COOKIE}=${s.token}; ${attrs(SESSION_MAX_AGE_S)}`);
  h.append("Set-Cookie", await routeCookie(s.orgSlug, s.personId, s.panel));
  return h;
}

export function signedOutCookies(): Headers {
  const h = new Headers();
  for (const name of [SESSION_COOKIE, ROUTE_COOKIE]) h.append("Set-Cookie", `${name}=; ${attrs(0)}`);
  return h;
}
