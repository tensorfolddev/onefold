"use client";

// A space's front page: recently edited pages, the ones you started, and templates to start a new one.
import Link from "next/link";
import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useDb } from "@/data/StoreProvider";
import { relativeTime } from "@/domain/status";
import type { Doc } from "@/domain/types";
import { RequirementsTable } from "@/features/products/LiveWidgets";
import { Avatar } from "@/ui/primitives";
import { TemplateCards, useNewDoc } from "./NewDoc";
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
  const mine = useMemo(() => docs.filter((d) => d.authorId === me.id).slice(-RECENT).reverse(), [docs, me.id]);
  const canCreate = can("doc.create", { product });

  return (
    <div className="docs-home">
      <header className="docs-home-head">
        <div>
          <h1>{product ? `${product.name} docs` : "Company docs"}</h1>
          <p>{product ? "Briefs, designs and notes for this project — everyone on it can write here." : "Handbook, policies and how we work — for everyone at the company."}</p>
        </div>
        {canCreate && <button type="button" className="btn btn-primary" onClick={() => newDoc.open()}><Plus aria-hidden /> New page</button>}
      </header>

      {recent.length ? (
        <>
          <h2 className="docs-section-title">Recently edited</h2>
          <div className="doc-cards">{recent.map((d) => <DocCard key={d.id} doc={d} />)}</div>
        </>
      ) : (
        <div className="docs-empty">No pages yet. Start one from a template below — it&apos;s yours to change.</div>
      )}
      {mine.length > 0 && (
        <>
          <h2 className="docs-section-title">Started by you</h2>
          <div className="doc-cards">{mine.map((d) => <DocCard key={d.id} doc={d} />)}</div>
        </>
      )}
      {canCreate && (
        <>
          <h2 className="docs-section-title">Start from a template</h2>
          <TemplateCards space={productKey ? "project" : "company"} onPick={(t) => void newDoc.create(t)} />
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
  );
}
