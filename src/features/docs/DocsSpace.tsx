"use client";

// A docs space: its tree (with search and Markdown import by drag-and-drop) on the left, the home or a page on the right.
import Link from "next/link";
import { BookOpen, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useDb } from "@/data/StoreProvider";
import { IconButton } from "@/ui/primitives";
import { searchDocs, type DocHit } from "./api";
import { DocTree } from "./DocTree";
import { useNewDoc } from "./NewDoc";
import { docPath } from "./tree";

const SEARCH_DELAY_MS = 200;

/** "Plan «Postgres» search" → text with the matched words marked (never HTML from the server). */
function Snippet({ text }: { text: string }) {
  return <>{text.split(/(«[^»]*»)/).map((part, i) => (part.startsWith("«") ? <mark key={i}>{part.slice(1, -1)}</mark> : part))}</>;
}

export function DocsSpace({ productKey, activeId, children }: { productKey: string; activeId?: string; children: React.ReactNode }) {
  const { href, productByKey, can } = useDb();
  const product = productKey ? productByKey(productKey) : undefined;
  const newDoc = useNewDoc(productKey);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<DocHit[] | null>(null);
  const [over, setOver] = useState(false);
  const canCreate = can("doc.create", { product });

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
    <div className="docs-space">
      <aside
        className={`docs-side docs-dropzone${over ? " is-over" : ""}`} aria-label={product ? `${product.name} docs` : "Company docs"}
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setOver(true); } }}
        onDragLeave={() => setOver(false)} onDrop={onDrop}
      >
        <div className="docs-side-head">
          <Link href={href(productKey ? `/products/${productKey}/docs` : "/docs")} className="docs-side-title">
            {product ? "Project docs" : "Company docs"}
          </Link>
          {canCreate && <IconButton label="New page" onClick={() => newDoc.open()}><Plus /></IconButton>}
        </div>
        <label className="docs-search">
          <Search aria-hidden />
          <input type="search" placeholder="Search docs" aria-label="Search docs" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {hits && (
          <div className="docs-hits" role="list" aria-label="Search results">
            {hits.length ? hits.map((h) => (
              <Link key={h.id} href={href(docPath(h))} className="docs-hit" role="listitem" onClick={() => setQ("")}>
                <span className="docs-hit-title">{h.icon ? `${h.icon} ` : ""}{h.title}</span>
                {h.snippet && <span className="docs-hit-snippet"><Snippet text={h.snippet} /></span>}
              </Link>
            )) : <p className="doc-tree-empty">Nothing found for “{q}”</p>}
          </div>
        )}
        <DocTree productKey={productKey} activeId={activeId} onNewPage={(parentId) => newDoc.open(parentId)} />
        {canCreate && <p className="doc-tree-empty"><BookOpen aria-hidden style={{ width: 14, height: 14, verticalAlign: -2 }} /> Drop a .md file here to import it</p>}
      </aside>
      <div className="docs-main">{children}</div>
      {newDoc.picker}
    </div>
  );
}
