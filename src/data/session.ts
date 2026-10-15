// The session cookie, shared by proxy.ts (server, before render) and the client store.
// ponytail: trusted as-is in the browser build; the backend issues a signed, httpOnly session instead.
import type { Panel } from "../domain/types.ts";

export const SESSION_COOKIE = "onefold_session";
export const SESSION_MAX_AGE_S = 7 * 86400;
export const PANEL_SLUG = { admin: "admin", manager: "manager", developer: "dev" } as const satisfies Record<Panel, string>;
export type PanelSlug = (typeof PANEL_SLUG)[Panel];
export interface Session { org: string; personId: string; panel: Panel }

export const panelFromSlug = (slug: string): Panel | null =>
  (Object.keys(PANEL_SLUG) as Panel[]).find((p) => PANEL_SLUG[p] === slug) ?? null;
export const panelHome = (panel: Panel) => `/${PANEL_SLUG[panel]}`;

const SLUG_RE = /^[a-z0-9-]{3,32}$/;
export function parseSession(v?: string): Session | null {
  const [org, personId, panel, ...rest] = decodeURIComponent(v ?? "").split(":");
  return org && SLUG_RE.test(org) && personId && panel && !rest.length && panel in PANEL_SLUG
    ? { org, personId, panel: panel as Panel } : null;
}
export const formatSession = (s: Session) => `${s.org}:${s.personId}:${s.panel}`;

/** Only same-panel paths survive a ?next= redirect; everything else (other panels, //evil.com) goes home. */
export function safeNext(next: string | null, panel: Panel) {
  const home = panelHome(panel);
  return next && (next === home || next.startsWith(`${home}/`)) ? next : home;
}

/** Pages anyone can open without signing in. */
export const PUBLIC_PATHS = ["/signin", "/signup", "/forgot"];
export const isPublicPath = (p: string) => PUBLIC_PATHS.includes(p) || p.startsWith("/invite/");
