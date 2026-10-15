// Cookies, shared by proxy.ts (before a page renders) and the server.
// - onefold_session: an opaque random token (httpOnly). Every API call checks it against the database — it IS the login.
// - onefold_route: "org:person:panel" + an HMAC signature, so proxy.ts can send you to your panel without a database
//   call. It can't be forged, and it grants nothing on its own: the API never trusts it.
import type { Panel } from "../domain/types.ts";

export const SESSION_COOKIE = "onefold_session";
export const ROUTE_COOKIE = "onefold_route";
export const SESSION_MAX_AGE_S = 30 * 86400;
export const PANEL_SLUG = { admin: "admin", manager: "manager", developer: "dev" } as const satisfies Record<Panel, string>;
export type PanelSlug = (typeof PANEL_SLUG)[Panel];
export interface Session { org: string; personId: string; panel: Panel }

export const panelFromSlug = (slug: string): Panel | null =>
  (Object.keys(PANEL_SLUG) as Panel[]).find((p) => PANEL_SLUG[p] === slug) ?? null;
export const panelHome = (panel: Panel) => `/${PANEL_SLUG[panel]}`;

const SLUG_RE = /^[a-z0-9-]{3,32}$/;
function parseRoute(v: string): Session | null {
  const [org, personId, panel, ...rest] = v.split(":");
  return org && SLUG_RE.test(org) && personId && panel && !rest.length && panel in PANEL_SLUG
    ? { org, personId, panel: panel as Panel } : null;
}

const enc = new TextEncoder();
const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const toB64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function signRoute(s: Session, secret: string): Promise<string> {
  const body = `${s.org}:${s.personId}:${s.panel}`;
  return `${body}.${toB64url(await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body)))}`;
}

/** The route in a cookie, or null if it's missing, malformed or not signed with `secret`. */
export async function readRoute(value: string | undefined, secret: string | undefined): Promise<Session | null> {
  if (!value || !secret) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 1) return null;
  const body = value.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(value.slice(dot + 1)), enc.encode(body));
    return ok ? parseRoute(body) : null;
  } catch {
    return null;
  }
}

/** Only same-panel paths survive a ?next= redirect; everything else (other panels, //evil.com) goes home. */
export function safeNext(next: string | null, panel: Panel) {
  const home = panelHome(panel);
  return next && (next === home || next.startsWith(`${home}/`)) ? next : home;
}

/** Pages anyone can open without signing in (plus the emailed links below). */
export const PUBLIC_PATHS = ["/signin", "/signup", "/forgot"];
const LINK_PAGES = ["/invite/", "/reset/", "/verify/"];
export const isPublicPath = (p: string) => PUBLIC_PATHS.includes(p) || LINK_PAGES.some((prefix) => p.startsWith(prefix));
