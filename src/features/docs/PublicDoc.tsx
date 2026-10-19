"use client";

// A page a public link opens, for anyone — signed out and read-only: its cover, title and text, the way back to its top
// page, and the pages inside it. No app around it, and nothing else of the company.
import { EditorContent, useEditor } from "@tiptap/react";
import { ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import type { PublicPage } from "@/server/publicLinks";
import { docExtensions } from "./editor/extensions";
import { isClaudeArtifact } from "./editor/links";
import { toDocJson } from "./editor/markdown";
import { coverCss, coverOf } from "./tree";

export function PublicDoc({ token, page }: { token: string; page: PublicPage }) {
  const editor = useEditor({
    extensions: docExtensions({ editable: false }), content: toDocJson(page.body), editable: false, immediatelyRender: false,
    editorProps: { attributes: { class: "doc-prose", "aria-label": "Document" } },
  });
  const cover = coverOf(page);
  const at = (id?: string) => (id ? `/share/${token}?page=${encodeURIComponent(id)}` : `/share/${token}`);

  return (
    <main className="public-doc">
      {cover && <div className="public-doc-cover" style={{ "--cover": coverCss(cover) } as React.CSSProperties} aria-hidden />}
      <article className="public-doc-page" aria-labelledby="public-doc-title">
        {page.crumbs.length > 0 && (
          <nav className="public-doc-crumbs" aria-label="Breadcrumb">
            {page.crumbs.map((c, i) => (
              <Link key={c.id} href={at(i === 0 ? undefined : c.id)}>{c.icon && <span aria-hidden>{c.icon} </span>}{c.title}</Link>
            ))}
          </nav>
        )}
        <span className="public-doc-icon" aria-hidden>{page.icon ?? "📄"}</span>
        <h1 id="public-doc-title">{page.title}</h1>
        {page.link && isClaudeArtifact(page.link) && (
          <a className="btn btn-secondary public-doc-open" href={page.link} target="_blank" rel="noopener noreferrer"><ExternalLink aria-hidden /> Open the artifact</a>
        )}
        {editor ? <EditorContent editor={editor} /> : <div className="doc-skeleton" aria-busy="true" />}
        {page.pages.length > 0 && (
          <nav className="public-doc-pages" aria-label="Pages inside">
            {page.pages.map((p) => (
              <Link key={p.id} href={at(p.id)}><span aria-hidden>{p.icon ?? <FileText />}</span>{p.title}</Link>
            ))}
          </nav>
        )}
      </article>
      <footer className="public-doc-foot">Shared with <Link href="/">1Fold</Link></footer>
    </main>
  );
}
