"use client";

// A docs space: its sidebar (groups and pages, search, Markdown import by drag-and-drop) on the left, the home or a
// page on the right. The page stays put; the sidebar and the doc scroll on their own. The sidebar folds away (and
// remembers that in this browser); a doc's top bar brings it back.
import Link from "next/link";
import { BookOpen, ChevronRight, ChevronsLeft, ChevronsRight, FileText, Lock, Plus, Search } from "lucide-react";
import { createContext, useContext, useEffect, useState } from "react";
import { useDb } from "@/data/StoreProvider";
import { searchDocs, type DocHit } from "./api";
import { DocTree } from "./DocTree";
import { useNewDoc } from "./NewDoc";
import { docPath, MY_DOCS, spacePath } from "./tree";

const SEARCH_DELAY_MS = 200;
const FOLDED_KEY = "onefold.docs.sidebar-folded";

const Space = createContext<{ folded: boolean; setFolded: (f: boolean) => void; productKey: string }>({ folded: false, setFolded: () => {}, productKey: "" });

/** "Plan «Postgres» search" → text with the matched words marked (never HTML from the server). */
function Snippet({ text }: { text: string }) {
  return <>{text.split(/(«[^»]*»)/).map((part, i) => (part.startsWith("«") ? <mark key={i}>{part.slice(1, -1)}</mark> : part))}</>;
}

export interface Crumb { label: string; href?: string; icon?: React.ReactNode }

/** The bar over a docs page: unfold the sidebar, where you are, and (right) whatever the page adds. */
export function DocsTopBar({ crumbs, children }: { crumbs: Crumb[]; children?: React.ReactNode }) {
  const { folded, setFolded } = useContext(Space);
  return (
    <div className="docs-topbar">
      {folded && (
        <button type="button" className="docs-topbar-btn" aria-label="Show the sidebar" data-tip="Show sidebar" onClick={() => setFolded(false)}>
          <ChevronsRight aria-hidden />
        </button>
      )}
      <nav className="docs-crumbs" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${i}`} className="docs-crumb-wrap">
            {i > 0 && <ChevronRight aria-hidden className="docs-crumb-sep" />}
            {c.href ? <Link href={c.href} className="docs-crumb">{c.icon}<span>{c.label}</span></Link>
              : <span className="docs-crumb is-current" aria-current="page">{c.icon}<span>{c.label}</span></span>}
          </span>
        ))}
      </nav>
      <span className="docs-topbar-end">{children}</span>
    </div>
  );
}

/** The name of a docs space. */
export const spaceName = (productKey: string, productName?: string) => (productKey === MY_DOCS ? "My docs" : productName ? `${productName} docs` : "Company docs");

export function DocsSpace({ productKey, activeId, children }: { productKey: string; activeId?: string; children: React.ReactNode }) {
  const { href, productByKey, can, me } = useDb();
  const personal = productKey === MY_DOCS;
  const product = productKey && !personal ? productByKey(productKey) : undefined;
  const name = spaceName(productKey, product?.name);
  const newDoc = useNewDoc(productKey);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DocHit[] | null>(null);
  const [over, setOver] = useState(false);
  const [folded, setFoldedState] = useState(false);
  const canCreate = personal ? me.active : can("doc.create", { product });

  useEffect(() => {
    try { setFoldedState(localStorage.getItem(FOLDED_KEY) === "1"); } catch { /* per-browser convenience only */ } // eslint-disable-line react-hooks/set-state-in-effect -- this browser's choice
  }, []);
  const setFolded = (f: boolean) => {
    setFoldedState(f);
    try { localStorage.setItem(FOLDED_KEY, f ? "1" : "0"); } catch { /* per-browser convenience only */ }
  };

  useEffect(() => {
    if (!q.trim()) { setHits(null); return; } // eslint-disable-line react-hooks/set-state-in-effect -- clearing the search
    const t = setTimeout(() => { searchDocs(q).then(setHits).catch(() => setHits([])); }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [q]);

  const onDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.files.length) return; // a page being moved in the tree, not a file
    e.preventDefault();
    setOver(false);
    if (canCreate) void newDoc.importFiles(e.dataTransfer.files);
  };

  return (
    <Space.Provider value={{ folded, setFolded, productKey }}>
      <div className={`docs-space${folded ? " is-folded" : ""}`}>
        {!folded && (
          <aside
            className={`docs-side docs-dropzone${over ? " is-over" : ""}`} aria-label={name}
            onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
            onDragLeave={() => setOver(false)} onDrop={onDrop}
          >
            <div className="docs-side-head">
              <Link href={href(spacePath(productKey))} className="docs-side-title">
                <span className={`docs-side-mark${personal ? " is-mine" : ""}`} aria-hidden>{personal ? <Lock /> : <FileText />}</span>
                {name}
              </Link>
              <button type="button" className="doc-row-btn" aria-label="Hide the sidebar" data-tip="Hide sidebar" onClick={() => setFolded(true)}><ChevronsLeft aria-hidden /></button>
            </div>
            {!product && ( // the company's pages, or your own
              <nav className="docs-spaces" aria-label="Docs spaces">
                <Link href={href("/docs")} aria-current={personal ? undefined : "page"}><BookOpen aria-hidden /> Company</Link>
                <Link href={href(spacePath(MY_DOCS))} aria-current={personal ? "page" : undefined}><Lock aria-hidden /> My docs</Link>
              </nav>
            )}
            <label className="docs-search">
              <Search aria-hidden />
              <input type="search" placeholder="Search docs" aria-label="Search docs" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            {canCreate && (
              <button type="button" className="docs-new" onClick={() => newDoc.open()}>
                <Plus aria-hidden /> New page
              </button>
            )}
            {hits && (
              <div className="docs-hits" role="list" aria-label="Search results">
                {hits.length ? hits.map((h) => (
                  <Link key={h.id} href={href(docPath(h))} className="docs-hit" role="listitem" onClick={() => setQ("")}>
                    <span className="docs-hit-title">{h.icon ? `${h.icon} ` : ""}{h.title}</span>
                    {h.snippet && <span className="docs-hit-snippet"><Snippet text={h.snippet} /></span>}
                  </Link>
                )) : <p className="sidebar-empty">Nothing found for “{q}”</p>}
              </div>
            )}
            <DocTree productKey={productKey} activeId={activeId} onNewPage={(where) => newDoc.open(where)} />
            {canCreate && <p className="docs-side-hint">Tip: drop a .md file here to import it</p>}
          </aside>
        )}
        <div className="docs-main">{children}</div>
        {newDoc.picker}
      </div>
    </Space.Provider>
  );
}
