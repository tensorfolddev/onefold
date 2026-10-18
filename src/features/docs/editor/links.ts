// Where a link in a doc may point. Anything else (javascript:, data:, vbscript:, …) is dropped, never rendered.
const SCHEMES = /^(https?:|mailto:)/i;
const IN_APP = /^(mention|ticket|doc):[^\s]+$/;

/** The link if a doc may hold it, else null. Relative app paths are only file links (/api/files/<id>). */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (!h) return null;
  if (SCHEMES.test(h) || IN_APP.test(h) || /^\/api\/files\/[A-Za-z0-9_-]+$/.test(h)) return h;
  return null;
}
