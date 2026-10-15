import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath, PANEL_SLUG, panelHome, readRoute, ROUTE_COOKIE } from "./data/session";

const SLUGS = new Set<string>(Object.values(PANEL_SLUG));
/** Public pages a signed-in person has no reason to see (invite links stay open: the page explains). */
const SIGNED_OUT_ONLY = new Set(["/signin", "/signup", "/forgot"]);

/**
 * Runs before every page: signed-out → /signin, wrong panel → own panel, panel-less links (/t/AP-12) → own panel.
 * It reads only the signed route cookie, so routing needs no database. The API checks the real session on every call.
 */
export async function proxy(req: NextRequest) {
  const session = await readRoute(req.cookies.get(ROUTE_COOKIE)?.value, process.env.SESSION_SECRET);
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
  // Pages only: skip the API (it checks sessions itself), Next internals and any file with an extension.
  matcher: ["/((?!api/|_next/|.*\\.[a-zA-Z0-9]+$).*)"],
};
