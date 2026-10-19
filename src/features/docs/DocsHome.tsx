"use client";

// A space's front page, monday.com style: every page, by group — each group a coloured table (page, created by, last
// edited) with subpages indented under their parent. One "New page" button (blank, or any template). A page that opens
// with a link (a Claude artifact's, say) can be opened straight from its card; artifacts can be shown on their own.
import Link from "next/link";
import { ChevronDown, ExternalLink, FileText, LayoutGrid, Plus, Sparkles, Table2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDb } from "@/data/StoreProvider";
import { relativeTime } from "@/domain/status";
import type { Doc } from "@/domain/types";
import { RequirementsTable } from "@/features/products/LiveWidgets";
import { Avatar } from "@/ui/primitives";
import { ArchivedDocs } from "./ArchivedDocs";
import { DocsTopBar, spaceName } from "./DocsSpace";
import { useNewDoc } from "./NewDoc";
import { isClaudeArtifact } from "./editor/links";
import { childrenOf, coverCss, coverOf, docPath, MY_DOCS, spaceDocs, topLevel } from "./tree";

/** monday.com's group colours, in order. */
const GROUP_COLORS = ["#579bfc", "#00c875", "#fdab3d", "#a25ddc", "#e2445c", "#ffcb00", "#ff158a", "#0086c0"];
const edited = (d: Doc) => d.updatedAt ?? `${d.updated}T00:00:00Z`;

/** A page and its subpages, depth-first, each with its depth. */
function flatten(docs: Doc[], list: Doc[], depth = 0): { doc: Doc; depth: number }[] {
  return list.flatMap((d) => [{ doc: d, depth }, ...flatten(docs, childrenOf(docs, d.id), depth + 1)]);
}

type View = "table" | "cards";
const VIEW_KEY = "onefold.docs.view";
type Kind = "all" | "pages" | "artifacts";

const ArtifactBadge = () => <span className="doc-kind is-artifact"><Sparkles aria-hidden /> Claude artifact</span>;

function DocCard({ doc }: { doc: Doc }) {
  const { href, personById } = useDb();
  const by = personById(doc.updatedBy ?? doc.authorId);
  const artifact = isClaudeArtifact(doc.link);
  return (
    <div className="doc-card-wrap">
      <Link href={href(docPath(doc))} className="doc-card" style={{ "--cover": coverCss(coverOf(doc)) } as React.CSSProperties}>
        <span className="doc-card-cover" aria-hidden />
        <span className="doc-card-icon" aria-hidden>{doc.icon ?? "📄"}</span>
        <span className="doc-card-body">
          <span className="doc-card-title">{doc.title}</span>
          {artifact && <ArtifactBadge />}
          <span className="doc-card-meta"><Avatar personId={by?.id} size="sm" /> {relativeTime(edited(doc))} ago</span>
        </span>
      </Link>
      {doc.link && ( // beside the card, not in it: a link can't hold another
        <a href={doc.link} target="_blank" rel="noopener noreferrer" className="doc-card-open" data-tip={doc.link}
          aria-label={`Open ${artifact ? "the artifact" : "the link"} in ${doc.title}, in a new tab`}>
          <ExternalLink aria-hidden /> Open
        </a>
      )}
    </div>
  );
}

function GroupTable({ name, color, pages, docs, view, shown }: {
  name: string; color: string; pages: Doc[]; docs: Doc[]; view: View; shown?: (d: Doc) => boolean;
}) {
  const { href, personById } = useDb();
  const [open, setOpen] = useState(true);
  const rows = flatten(docs, pages).filter((r) => !shown || shown(r.doc));
  if (shown && !rows.length) return null; // filtered: only the groups with something to show
  return (
    <section className="docs-board-group" style={{ "--group": color } as React.CSSProperties} aria-label={name}>
      <button type="button" className="docs-board-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <ChevronDown aria-hidden className={open ? undefined : "is-collapsed"} />
        <span className="docs-board-name">{name}</span>
        <span className="docs-board-count">{rows.length} {rows.length === 1 ? "page" : "pages"}</span>
      </button>
      {open && view === "cards" && (
        rows.length ? <div className="doc-cards docs-board-cards">{rows.map(({ doc }) => <DocCard key={doc.id} doc={doc} />)}</div>
          : <p className="docs-board-none">No pages in this group yet</p>
      )}
      {open && view === "table" && (
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
                  {isClaudeArtifact(doc.link) && <ArtifactBadge />}
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
  const { db, can, productByKey, me } = useDb();
  const personal = productKey === MY_DOCS;
  const product = productKey && !personal ? productByKey(productKey) : undefined;
  const newDoc = useNewDoc(productKey);
  const docs = useMemo(() => spaceDocs(db.docs, productKey), [db.docs, productKey]);
  const groups = useMemo(() => db.docGroups.filter((g) => g.productKey === productKey), [db.docGroups, productKey]);
  const tops = topLevel(docs);
  const ungrouped = tops.filter((d) => !d.groupId || !groups.some((g) => g.id === d.groupId));
  const canCreate = personal ? me.active : can("doc.create", { product });
  const title = spaceName(productKey, product?.name);
  const mine = tops.filter((d) => d.ownerId === me.id);
  const sharedWithMe = tops.filter((d) => d.ownerId !== me.id);
  const [view, setViewState] = useState<View>("table");
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === "cards") setViewState("cards"); } catch { /* per-browser convenience only */ } // eslint-disable-line react-hooks/set-state-in-effect -- this browser's choice
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* per-browser convenience only */ }
  };
  const [kindPicked, setKind] = useState<Kind>("all");
  const artifacts = docs.filter((d) => isClaudeArtifact(d.link)).length;
  const kind: Kind = artifacts ? kindPicked : "all";
  const shown = kind === "all" ? undefined : (d: Doc) => (kind === "artifacts") === isClaudeArtifact(d.link);

  return (
    <>
      <DocsTopBar crumbs={[{ label: title }]} />
      <div className="docs-home">
        <header className="docs-home-head">
          <div>
            <h1>{title}</h1>
            <p>{personal ? `Yours alone until you share a page — with a few people, or everyone at ${db.org.name}.`
              : product ? "Briefs, designs and notes for this project — everyone on it can write here." : "Handbook, policies and how we work — for everyone at the company."}</p>
          </div>
          <div className="docs-home-actions">
            {artifacts > 0 && (
              <div className="docs-view-switch" role="group" aria-label="Show">
                {([["all", "All"], ["pages", "Pages"], ["artifacts", `Claude artifacts · ${artifacts}`]] as const).map(([k, label]) => (
                  <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "artifacts" && <Sparkles aria-hidden />}{label}</button>
                ))}
              </div>
            )}
            <div className="docs-view-switch" role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={view === "table"} onClick={() => setView("table")}><Table2 aria-hidden /> Table</button>
              <button type="button" role="tab" aria-selected={view === "cards"} onClick={() => setView("cards")}><LayoutGrid aria-hidden /> Cards</button>
            </div>
            {canCreate && <button type="button" className="btn btn-primary" onClick={() => newDoc.open()}><Plus aria-hidden /> New page</button>}
          </div>
        </header>

        {docs.length === 0 ? (
          <div className="docs-empty">
            <p className="docs-empty-title">{personal ? "Nothing in My docs yet" : "No pages here yet"}</p>
            <p>{personal ? "Notes, drafts, anything — only you can see them until you share them." : "Write the first one — start blank, or pick a template and change it freely."}</p>
          </div>
        ) : personal ? (
          <div className="docs-board">
            {shown && !docs.some(shown) && <p className="docs-board-none">{kind === "pages" ? "Every page here is a Claude artifact" : "No Claude artifacts here"}</p>}
            <GroupTable view={view} shown={shown} name="My pages" color="#676879" docs={docs} pages={mine} />
            {sharedWithMe.length > 0 && <GroupTable view={view} shown={shown} name="Shared with me" color="#579bfc" docs={docs} pages={sharedWithMe} />}
          </div>
        ) : (
          <div className="docs-board">
            {shown && !docs.some(shown) && <p className="docs-board-none">{kind === "pages" ? "Every page here is a Claude artifact" : "No Claude artifacts here"}</p>}
            {groups.map((g, i) => <GroupTable key={g.id} view={view} shown={shown} name={g.name} color={GROUP_COLORS[i % GROUP_COLORS.length]} docs={docs} pages={tops.filter((d) => d.groupId === g.id)} />)}
            {(ungrouped.length > 0 || !groups.length) && <GroupTable view={view} shown={shown} name={groups.length ? "Other pages" : "Pages"} color="#676879" docs={docs} pages={ungrouped} />}
          </div>
        )}
        {personal && <ArchivedDocs productKey={MY_DOCS} />}
        {product && (
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
