"use client";

// A space's front page, monday.com style: every page, by group — each group a coloured table (page, created by, last
// edited) with subpages indented under their parent. One "New page" button (blank, or any template).
import Link from "next/link";
import { ChevronDown, FileText, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useDb } from "@/data/StoreProvider";
import { relativeTime } from "@/domain/status";
import type { Doc } from "@/domain/types";
import { RequirementsTable } from "@/features/products/LiveWidgets";
import { Avatar } from "@/ui/primitives";
import { DocsTopBar } from "./DocsSpace";
import { useNewDoc } from "./NewDoc";
import { childrenOf, docPath, spaceDocs, topLevel } from "./tree";

/** monday.com's group colours, in order. */
const GROUP_COLORS = ["#579bfc", "#00c875", "#fdab3d", "#a25ddc", "#e2445c", "#ffcb00", "#ff158a", "#0086c0"];
const edited = (d: Doc) => d.updatedAt ?? `${d.updated}T00:00:00Z`;

/** A page and its subpages, depth-first, each with its depth. */
function flatten(docs: Doc[], list: Doc[], depth = 0): { doc: Doc; depth: number }[] {
  return list.flatMap((d) => [{ doc: d, depth }, ...flatten(docs, childrenOf(docs, d.id), depth + 1)]);
}

function GroupTable({ name, color, pages, docs }: { name: string; color: string; pages: Doc[]; docs: Doc[] }) {
  const { href, personById } = useDb();
  const [open, setOpen] = useState(true);
  const rows = flatten(docs, pages);
  return (
    <section className="docs-board-group" style={{ "--group": color } as React.CSSProperties} aria-label={name}>
      <button type="button" className="docs-board-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown aria-hidden className={open ? undefined : "is-collapsed"} />
        <span className="docs-board-name">{name}</span>
        <span className="docs-board-count">{rows.length} {rows.length === 1 ? "page" : "pages"}</span>
      </button>
      {open && (
        <div className="docs-board-table" role="table" aria-label={`${name} pages`}>
          <div className="docs-board-row is-head" role="row">
            <span role="columnheader">Page</span><span role="columnheader">Created by</span><span role="columnheader">Last edited</span>
          </div>
          {rows.length === 0 && <div className="docs-board-row is-empty" role="row"><span role="cell">No pages in this group yet</span></div>}
          {rows.map(({ doc, depth }) => {
            const by = personById(doc.authorId);
            const editor = personById(doc.updatedBy ?? doc.authorId);
            return (
              <Link key={doc.id} href={href(docPath(doc))} className="docs-board-row" role="row">
                <span role="cell" className="docs-board-page" style={{ paddingLeft: 14 + depth * 22 }}>
                  <span className="docs-board-icon" aria-hidden>{doc.icon ?? <FileText />}</span>
                  <span className="docs-board-title">{doc.title}</span>
                </span>
                <span role="cell" className="docs-board-person">{by && <><Avatar personId={by.id} size="sm" /> {by.name}</>}</span>
                <span role="cell" className="docs-board-when">{relativeTime(edited(doc))} ago{editor ? ` · ${editor.name.split(" ")[0]}` : ""}</span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function DocsHome({ productKey }: { productKey: string }) {
  const { db, can, productByKey } = useDb();
  const product = productKey ? productByKey(productKey) : undefined;
  const newDoc = useNewDoc(productKey);
  const docs = useMemo(() => spaceDocs(db.docs, productKey), [db.docs, productKey]);
  const groups = useMemo(() => db.docGroups.filter((g) => g.productKey === productKey), [db.docGroups, productKey]);
  const tops = topLevel(docs);
  const ungrouped = tops.filter((d) => !d.groupId || !groups.some((g) => g.id === d.groupId));
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
          {canCreate && <button type="button" className="btn btn-primary" onClick={() => newDoc.open()}><Plus aria-hidden /> New page</button>}
        </header>

        {docs.length === 0 ? (
          <div className="docs-empty">
            <p className="docs-empty-title">No pages here yet</p>
            <p>Write the first one — start blank, or pick a template and change it freely.</p>
          </div>
        ) : (
          <div className="docs-board">
            {groups.map((g, i) => <GroupTable key={g.id} name={g.name} color={GROUP_COLORS[i % GROUP_COLORS.length]} docs={docs} pages={tops.filter((d) => d.groupId === g.id)} />)}
            {(ungrouped.length > 0 || !groups.length) && <GroupTable name={groups.length ? "Other pages" : "Pages"} color="#676879" docs={docs} pages={ungrouped} />}
          </div>
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
