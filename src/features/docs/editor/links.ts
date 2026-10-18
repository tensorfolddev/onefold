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

/** People, tickets and docs a body points at (outside code), for the link index and mention notifications. */
export function refsIn(markdown: string): { people: string[]; tickets: string[]; docs: string[] } {
  const text = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const all = (re: RegExp) => [...new Set([...text.matchAll(re)].map((m) => m[1]))];
  return {
    people: all(/\]\(mention:([^)\s]+)\)/g),
    tickets: all(/\]\(ticket:([^)\s]+)\)/g),
    docs: all(/\]\(doc:([^)\s]+)\)/g),
  };
}
