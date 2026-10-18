"use client";

// A space's front page: start a page (blank, or from a template), then what was edited lately and what you started.
import Link from "next/link";
import { LayoutTemplate, Plus } from "lucide-react";
import { useMemo } from "react";
import { useDb } from "@/data/StoreProvider";
import { relativeTime } from "@/domain/status";
import type { Doc } from "@/domain/types";
import { RequirementsTable } from "@/features/products/LiveWidgets";
import { Avatar } from "@/ui/primitives";
import { DocsTopBar } from "./DocsSpace";
import { useNewDoc } from "./NewDoc";
import { coverCss, docPath, spaceDocs } from "./tree";

const RECENT = 8;
const edited = (d: Doc) => d.updatedAt ?? `${d.updated}T00:00:00Z`;

function DocCard({ doc }: { doc: Doc }) {
  const { href, personById } = useDb();
  const by = personById(doc.updatedBy ?? doc.authorId);
  return (
    <Link href={href(docPath(doc))} className="doc-card" style={{ "--cover": coverCss(doc.cover) } as React.CSSProperties}>
      <span className="doc-card-cover" aria-hidden />
      <span className="doc-card-icon" aria-hidden>{doc.icon ?? "📄"}</span>
      <span className="doc-card-body">
        <span className="doc-card-title">{doc.title}</span>
        <span className="doc-card-meta"><Avatar personId={by?.id} size="sm" /> {relativeTime(edited(doc))} ago</span>
      </span>
    </Link>
  );
}

export function DocsHome({ productKey }: { productKey: string }) {
  const { db, me, can, productByKey } = useDb();
  const product = productKey ? productByKey(productKey) : undefined;
  const newDoc = useNewDoc(productKey);
  const docs = useMemo(() => spaceDocs(db.docs, productKey), [db.docs, productKey]);
  const recent = useMemo(() => [...docs].sort((a, b) => edited(b).localeCompare(edited(a))).slice(0, RECENT), [docs]);
  const mine = useMemo(() => docs.filter((d) => d.authorId === me.id && !recent.slice(0, 4).includes(d)).slice(-RECENT).reverse(), [docs, me.id, recent]);
  const canCreate = can("doc.create", { product });
  const title = product ? `${product.name} docs` : "Company docs";

  return (
    <>
      <DocsTopBar crumbs={[{ label: title }]} />
      <div className="docs-home">
        <header className="docs-home-head">
          <div>
            <h1>{title}</h1>
            <p>{product ? "Briefs, designs and notes for this project — everyone on it can write here." : "Handbook, policies and how we work — for everyone at the company."}</p>
          </div>
          {canCreate && (
            <div className="docs-home-actions">
              <button type="button" className="btn btn-secondary" onClick={() => newDoc.open()}><LayoutTemplate aria-hidden /> From a template</button>
              <button type="button" className="btn btn-primary" onClick={() => void newDoc.blank()}><Plus aria-hidden /> New page</button>
            </div>
          )}
        </header>

        {recent.length ? (
          <>
            <h2 className="docs-section-title">Recently edited</h2>
            <div className="doc-cards">{recent.map((d) => <DocCard key={d.id} doc={d} />)}</div>
          </>
        ) : (
          <div className="docs-empty">
            <p className="docs-empty-title">No pages here yet</p>
            <p>Write the first one — start blank, or pick a template and change it freely.</p>
            {canCreate && (
              <div className="docs-home-actions" style={{ justifyContent: "center" }}>
                <button type="button" className="btn btn-secondary" onClick={() => newDoc.open()}><LayoutTemplate aria-hidden /> From a template</button>
                <button type="button" className="btn btn-primary" onClick={() => void newDoc.blank()}><Plus aria-hidden /> New page</button>
              </div>
            )}
          </div>
        )}
        {mine.length > 0 && (
          <>
            <h2 className="docs-section-title">Started by you</h2>
            <div className="doc-cards">{mine.map((d) => <DocCard key={d.id} doc={d} />)}</div>
          </>
        )}
        {productKey && (
          <>
            <h2 className="docs-section-title">Requirements</h2>
            <RequirementsTable productKey={productKey} />
          </>
        )}
        {newDoc.picker}
      </div>
    </>
  );
}
