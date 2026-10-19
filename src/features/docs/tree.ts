// Small helpers over the docs list: a space's live pages, the tree, paths, reading time, Markdown files.
import type { Doc } from "@/domain/types";
import { isClaudeArtifact } from "./editor/links";

export const COVERS = [
  { id: "dawn", label: "Dawn", css: "linear-gradient(120deg, #fde68a 0%, #fca5a5 50%, #c4b5fd 100%)" },
  { id: "ocean", label: "Ocean", css: "linear-gradient(120deg, #a5f3fc 0%, #93c5fd 55%, #a5b4fc 100%)" },
  { id: "forest", label: "Forest", css: "linear-gradient(120deg, #bbf7d0 0%, #86efac 45%, #5eead4 100%)" },
  { id: "dusk", label: "Dusk", css: "linear-gradient(120deg, #312e81 0%, #7c3aed 55%, #db2777 100%)" },
  { id: "ember", label: "Ember", css: "linear-gradient(120deg, #fed7aa 0%, #fb923c 50%, #f43f5e 100%)" },
  { id: "slate", label: "Slate", css: "linear-gradient(120deg, #e2e8f0 0%, #cbd5e1 50%, #94a3b8 100%)" },
] as const;
/** The cover gallery: illustrations served from /covers. */
export const COVER_IMAGES = [
  { id: "mountains-dawn", label: "Mountains at dawn" }, { id: "mountains-mint", label: "Green hills" }, { id: "mountains-night", label: "Mountains at night" },
  { id: "waves-ocean", label: "Ocean waves" }, { id: "waves-sunset", label: "Sunset waves" }, { id: "dunes", label: "Dunes" },
  { id: "sunset", label: "Retro sunset" }, { id: "aurora", label: "Aurora" }, { id: "pastel", label: "Pastel" },
  { id: "contours", label: "Contours" }, { id: "contours-night", label: "Night contours" }, { id: "dots", label: "Dots" },
  { id: "confetti", label: "Confetti" },
].map((c) => ({ ...c, src: `/covers/${c.id}.svg` }));
/** A cover's CSS background: an image (from the gallery or uploaded) or a colour gradient. */
export const coverCss = (cover?: string) =>
  cover?.startsWith("/") ? `url("${cover}") center / cover no-repeat` : COVERS.find((c) => c.id === cover)?.css;

/** What a Claude artifact's doc wears until someone picks a cover. */
export const ARTIFACT_COVER = "/covers/claude-artifact.svg";
/** The cover a doc shows: its own, else the artifact cover for a Claude artifact, else none. */
export const coverOf = (doc: Pick<Doc, "cover" | "link">) => doc.cover ?? (isClaudeArtifact(doc.link) ? ARTIFACT_COVER : undefined);

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

/**
 * Saves the open doc as a PDF through the browser's own print ("Save as PDF"): real text, links kept, and print styles
 * that never split a code block, image, callout, quote or table row across two pages (docs.css, body.print-doc).
 */
export function printDoc(title: string) {
  const before = document.title;
  document.title = title; // the PDF's file name
  document.body.classList.add("print-doc");
  const done = () => {
    document.body.classList.remove("print-doc");
    document.title = before;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}
