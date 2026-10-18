// The connected bits of a doc, each with a Markdown form that reads well anywhere:
//   mention   [@Hina Raza](mention:<personId>)      — notifies the person (phase 2)
//   ref       [EN-12](ticket:EN-12) · [Spec](doc:<id>) — a live chip for a ticket or a doc
//   linkCard  <https://example.com>  (alone on a line) — a preview card for a web page
// The browser draws them with React node views (Chips.tsx); here they're plain, so Markdown works without a DOM.
import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import { safeHref } from "./links.ts";

const MENTION = /^\[@([^\]\n]*)\]\(mention:([^)\s]+)\)/;
const REF = /^\[([^\]\n]+)\]\((ticket|doc):([^)\s]+)\)/;
const CARD = /^<(https?:\/\/[^>\s]+)>[ \t]*(?:\n|$)/;
const label = (s: unknown) => String(s ?? "").replace(/[[\]\n]/g, "").trim();

export const Mention = Node.create({
  name: "mention",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { id: { default: "" }, label: { default: "" } };
  },
  parseHTML() { return [{ tag: "span[data-mention]", getAttrs: (el) => ({ id: (el as HTMLElement).dataset.mention, label: (el as HTMLElement).textContent?.replace(/^@/, "") }) }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-mention": node.attrs.id, class: "doc-mention" }), `@${node.attrs.label}`];
  },
  renderText: ({ node }) => `@${node.attrs.label}`,
  markdownTokenizer: {
    name: "mention",
    level: "inline",
    start: (src: string) => src.search(/\[@[^\]\n]*\]\(mention:/),
    tokenize(src) {
      const m = MENTION.exec(src);
      return m ? { type: "mention", raw: m[0], label: m[1], id: m[2] } : undefined;
    },
  },
  parseMarkdown: (token, h) => h.createNode("mention", { id: token.id, label: token.label }),
  renderMarkdown: (node: JSONContent) => `[@${label(node.attrs?.label)}](mention:${node.attrs?.id})`,
});

export const Ref = Node.create({
  name: "ref",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return { kind: { default: "ticket" }, id: { default: "" }, label: { default: "" } };
  },
  parseHTML() { return [{ tag: "span[data-ref]", getAttrs: (el) => ({ kind: (el as HTMLElement).dataset.kind, id: (el as HTMLElement).dataset.ref, label: (el as HTMLElement).textContent }) }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-ref": node.attrs.id, "data-kind": node.attrs.kind, class: "doc-ref" }), node.attrs.label];
  },
  renderText: ({ node }) => node.attrs.label,
  markdownTokenizer: {
    name: "ref",
    level: "inline",
    start: (src: string) => src.search(/\[[^\]\n]+\]\((ticket|doc):/),
    tokenize(src) {
      const m = REF.exec(src);
      return m ? { type: "ref", raw: m[0], label: m[1], kind: m[2], id: m[3] } : undefined;
    },
  },
  parseMarkdown: (token, h) => h.createNode("ref", { kind: token.kind, id: token.id, label: token.label }),
  renderMarkdown: (node: JSONContent) => `[${label(node.attrs?.label) || node.attrs?.id}](${node.attrs?.kind}:${node.attrs?.id})`,
});

export const LinkCard = Node.create({
  name: "linkCard",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { url: { default: "" } };
  },
  parseHTML() { return [{ tag: "div[data-link-card]", getAttrs: (el) => ({ url: (el as HTMLElement).dataset.linkCard }) }]; },
  renderHTML({ node }) {
    const url = safeHref(String(node.attrs.url)) ?? "";
    return ["div", { "data-link-card": url, class: "doc-link-card" }, ["a", { href: url, target: "_blank", rel: "noopener noreferrer nofollow" }, url]];
  },
  markdownTokenizer: {
    name: "linkCard",
    level: "block",
    start: (src: string) => src.search(/^<https?:\/\/[^>\s]+>[ \t]*(?:\n|$)/m),
    tokenize(src) {
      const m = CARD.exec(src);
      return m && safeHref(m[1]) ? { type: "linkCard", raw: m[0], url: m[1] } : undefined;
    },
  },
  parseMarkdown: (token, h) => h.createNode("linkCard", { url: token.url }),
  renderMarkdown: (node: JSONContent) => `<${node.attrs?.url}>`,
});

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
