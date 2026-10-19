// Where a link in a doc may point. Anything else (javascript:, data:, vbscript:, …) is dropped, never rendered.
const SCHEMES = /^(https?:|mailto:)/i;
const IN_APP = /^(mention|ticket|doc):[^\s]+$/;

/** The link if a doc may hold it, else null. Relative app paths are only file links: /api/files/<id>, or the same file
 * through a public link (/api/share/<token>/files/<id>). */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (!h) return null;
  if (SCHEMES.test(h) || IN_APP.test(h) || /^\/api\/(?:share\/[A-Za-z0-9_-]{43}\/)?files\/[A-Za-z0-9_-]+$/.test(h)) return h;
  return null;
}

const MAX_LINK = 2048;
// A body's first block, when it's only a link: a link card <url>, a lone [text](url), or a bare URL (after any
// alignment comment).
const TOP_LINK = /^\s*(?:<!--[^\n]*-->\s*)*(?:<(https?:\/\/[^>\s]+)>|\[[^\]\n]*\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s<>]+))[ \t]*(?:\n|$)/i;

/** The web link a doc opens with (its first block is just that link), or undefined. */
export function topLink(markdown: string): string | undefined {
  const m = TOP_LINK.exec(markdown);
  const url = m ? (m[1] ?? m[2] ?? m[3]) : undefined;
  return url && url.length <= MAX_LINK ? url : undefined;
}

/** A link to a Claude artifact (claude.ai/artifact/…, claude.ai/public/artifacts/…, or claude.site/artifacts/…). */
export function isClaudeArtifact(url?: string): boolean {
  if (!url) return false;
  try {
    const { hostname, pathname, protocol } = new URL(url);
    if (protocol !== "https:") return false;
    if (hostname === "claude.ai" || hostname.endsWith(".claude.ai")) return /^\/(?:public\/)?artifacts?\/[\w-]+/.test(pathname);
    return hostname === "claude.site" && /^\/artifacts\/[\w-]+/.test(pathname);
  } catch {
    return false;
  }
}

/** People, tickets and docs a body points at (outside code), for the link index and mention notifications; `urgent`:
 * the people @@mentioned. */
export function refsIn(markdown: string): { people: string[]; tickets: string[]; docs: string[]; urgent: string[] } {
  const text = markdown.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  const all = (re: RegExp) => [...new Set([...text.matchAll(re)].map((m) => m[1]))];
  return {
    people: all(/\]\(mention:([^)\s]+)\)/g),
    tickets: all(/\]\(ticket:([^)\s]+)\)/g),
    docs: all(/\]\(doc:([^)\s]+)\)/g),
    urgent: all(/\[@@[^\]\n]*\]\(mention:([^)\s]+)\)/g),
  };
}

/**
 * For a block-level Markdown tokenizer's `start`: marked asks with the paragraph minus its first character, so a block
 * may only begin right after a line break — never mid-line (which would split "![img](…)" at its "[").
 */
export function lineStart(src: string, afterNewline: RegExp): number {
  const i = src.search(afterNewline);
  return i < 0 ? -1 : i + 1;
}
