// Small helpers over the docs list: a space's live pages, the tree, paths, reading time, Markdown files.
import type { Doc } from "@/domain/types";

export const COVERS = [
  { id: "dawn", label: "Dawn", css: "linear-gradient(120deg, #fde68a 0%, #fca5a5 50%, #c4b5fd 100%)" },
  { id: "ocean", label: "Ocean", css: "linear-gradient(120deg, #a5f3fc 0%, #93c5fd 55%, #a5b4fc 100%)" },
  { id: "forest", label: "Forest", css: "linear-gradient(120deg, #bbf7d0 0%, #86efac 45%, #5eead4 100%)" },
  { id: "dusk", label: "Dusk", css: "linear-gradient(120deg, #312e81 0%, #7c3aed 55%, #db2777 100%)" },
  { id: "ember", label: "Ember", css: "linear-gradient(120deg, #fed7aa 0%, #fb923c 50%, #f43f5e 100%)" },
  { id: "slate", label: "Slate", css: "linear-gradient(120deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)" },
] as const;
export const coverCss = (id?: string) => COVERS.find((c) => c.id === id)?.css;

/** A space's pages that aren't archived ("" = the company's own space). */
export const spaceDocs = (docs: Doc[], productKey: string) => docs.filter((d) => d.productKey === productKey && !d.archivedAt);

/** Top-level pages: no parent, or a parent that isn't in the list (archived, or not theirs to see). */
export function topLevel(docs: Doc[]): Doc[] {
  const ids = new Set(docs.map((d) => d.id));
  return docs.filter((d) => !d.parentId || !ids.has(d.parentId));
}
export const childrenOf = (docs: Doc[], parentId: string) => docs.filter((d) => d.parentId === parentId);

/** The pages above this one, top first. */
export function ancestorsOf(docs: Doc[], doc: Doc): Doc[] {
  const out: Doc[] = [];
  const seen = new Set<string>();
  for (let p = docs.find((d) => d.id === doc.parentId); p && !seen.has(p.id); p = docs.find((d) => d.id === p!.parentId)) {
    seen.add(p.id);
    out.unshift(p);
  }
  return out;
}

/** Where a doc opens, inside the panel ("/docs/…" for the company's, "/products/AP/docs/…" for a project's). */
export const docPath = (doc: Pick<Doc, "id" | "productKey">) => (doc.productKey ? `/products/${doc.productKey}/docs/${doc.id}` : `/docs/${doc.id}`);

export const readingMinutes = (markdown: string) => Math.max(1, Math.round(markdown.split(/\s+/).filter(Boolean).length / 220));

/** A dropped .md file's title: its first "# " heading, else the file name. The heading is then taken out of the body. */
export function fromMarkdownFile(name: string, text: string): { title: string; body: string } {
  const m = /^#\s+(.+)\n*/.exec(text.trimStart());
  if (m) return { title: m[1].trim().slice(0, 200), body: text.trimStart().slice(m[0].length) };
  return { title: name.replace(/\.(md|markdown|txt)$/i, "").slice(0, 200) || "Imported", body: text };
}

/** Saves a doc as a .md file on the person's computer. */
export function downloadMarkdown(title: string, body: string) {
  const blob = new Blob([`# ${title}\n\n${body}\n`], { type: "text/markdown;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${title.replace(/[\\/:*?"<>|]+/g, "-").trim() || "doc"}.md` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
