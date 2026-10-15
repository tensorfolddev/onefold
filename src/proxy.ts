import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, PANEL_SLUG, panelHome, parseSession, SESSION_COOKIE } from "./data/session";

const SLUGS = new Set<string>(Object.values(PANEL_SLUG));
/** Public pages a signed-in person has no reason to see (invite links stay open: the page explains). */
const SIGNED_OUT_ONLY = new Set(["/signin", "/signup", "/forgot"]);

/** Runs before every page: signed-out → /signin, wrong panel → own panel, panel-less links (/t/AP-12) → own panel. */
export function proxy(req: NextRequest) {
  const session = parseSession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = req.nextUrl;
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));

  if (isPublicPath(pathname)) return session && SIGNED_OUT_ONLY.has(pathname) ? to(panelHome(session.panel)) : NextResponse.next();
  if (!session) return to(pathname === "/" ? "/signin" : `/signin?next=${encodeURIComponent(pathname + search)}`);

  const home = panelHome(session.panel);
  const first = pathname.split("/")[1];
  if (SLUGS.has(first)) return `/${first}` === home ? NextResponse.next() : to(home);
  return to(pathname === "/" ? home : `${home}${pathname}${search}`);
}

export const config = {
  // Pages only: skip Next internals and any file with an extension (favicon, images, fonts).
  matcher: ["/((?!_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
