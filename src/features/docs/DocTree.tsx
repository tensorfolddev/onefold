"use client";

// A space's pages as a tree. Drag a page onto another to put it inside, or onto its top or bottom edge to put it
// before or after. Each row: open/close, "+" for a subpage, and ⋯ (rename, copy link, export, archive for admins).
import Link from "next/link";
import { ChevronRight, FileText, Link2, MoreHorizontal, Pencil, Plus, Download, Archive } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { archiveDocs, moveDoc, updateDoc } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import type { Doc } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { IconButton } from "@/ui/primitives";
import { getDoc } from "./api";
import { ancestorsOf, childrenOf, docPath, downloadMarkdown, spaceDocs, topLevel } from "./tree";

type Zone = "before" | "inside" | "after";
const openKey = (space: string) => `onefold.docs.open.${space || "company"}`;

function readOpen(space: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(openKey(space)) ?? "[]") as string[]); } catch { return new Set(); }
}

export function DocTree({ productKey, activeId, onNewPage }: { productKey: string; activeId?: string; onNewPage: (parentId?: string) => void }) {
  const { db, can, act, href, productByKey, toast } = useDb();
  const product = productKey ? productByKey(productKey) : undefined;
  const docs = useMemo(() => spaceDocs(db.docs, productKey), [db.docs, productKey]);
  const canEdit = can("doc.edit", { product });
  const canArchive = can("doc.archive", { product });
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; zone: Zone } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  // Remember what's open per space, and always show the way to the open page.
  useEffect(() => {
    const saved = readOpen(productKey);
    const active = docs.find((d) => d.id === activeId);
    if (active) for (const a of ancestorsOf(docs, active)) saved.add(a.id);
    setOpen(saved); // eslint-disable-line react-hooks/set-state-in-effect -- restores the person's own tree from this browser
  }, [productKey, activeId, docs]);
  const toggle = (id: string) => setOpen((cur) => {
    const next = new Set(cur);
    if (!next.delete(id)) next.add(id);
    try { localStorage.setItem(openKey(productKey), JSON.stringify([...next])); } catch { /* per-browser convenience only */ }
    return next;
  });

  const zoneOf = (e: React.DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (e.clientY - r.top) / r.height;
    return y < 0.28 ? "before" : y > 0.72 ? "after" : "inside";
  };
  const onDrop = (target: Doc, zone: Zone) => {
    const id = dragId;
    setDragId(null);
    setDrop(null);
    if (!id || id === target.id) return;
    const siblings = target.parentId ? childrenOf(docs, target.parentId) : topLevel(docs);
    const next = siblings[siblings.findIndex((d) => d.id === target.id) + 1];
    const to = zone === "inside" ? { parentId: target.id }
      : zone === "before" ? { parentId: target.parentId ?? null, beforeId: target.id }
      : { parentId: target.parentId ?? null, beforeId: next?.id };
    if (act((d, m) => moveDoc(d, m, id, to)) && zone === "inside") setOpen((cur) => new Set(cur).add(target.id));
  };

  const rename = (doc: Doc, title: string) => {
    setRenaming(null);
    if (title.trim() && title.trim() !== doc.title) act((d, m) => updateDoc(d, m, doc.id, { title }));
  };
  const copyLink = async (doc: Doc) => {
    await navigator.clipboard.writeText(`${location.origin}${href(`/d/${doc.id}`)}`).catch(() => {});
    toast("Link copied", undefined, "success");
  };
  const exportMd = async (doc: Doc) => {
    try { downloadMarkdown(doc.title, (await getDoc(doc.id)).body); } catch { toast("Couldn't export that doc — try again", undefined, "error"); }
  };

  const rows = (list: Doc[], depth: number): React.ReactNode => (
    <ul role={depth ? "group" : "tree"} aria-label={depth ? undefined : "Pages"}>
      {list.map((doc) => {
        const kids = childrenOf(docs, doc.id);
        const isOpen = open.has(doc.id);
        const dz = drop?.id === doc.id ? drop.zone : null;
        return (
          <li key={doc.id} role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={doc.id === activeId}>
            <div
              className={`doc-row${doc.id === activeId ? " is-active" : ""}${dz ? ` is-drop-${dz}` : ""}`}
              style={{ paddingLeft: 4 + depth * 14 }}
              draggable={canEdit && renaming !== doc.id}
              onDragStart={(e) => { setDragId(doc.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", doc.title); }}
              onDragEnd={() => { setDragId(null); setDrop(null); }}
              onDragOver={(e) => { if (!dragId || dragId === doc.id) return; e.preventDefault(); setDrop({ id: doc.id, zone: zoneOf(e) }); }}
              onDragLeave={() => setDrop((d) => (d?.id === doc.id ? null : d))}
              onDrop={(e) => { e.preventDefault(); onDrop(doc, zoneOf(e)); }}
            >
              <button type="button" className={`doc-row-toggle${kids.length ? "" : " is-leaf"}`} aria-label={`${isOpen ? "Close" : "Open"} ${doc.title}`}
                aria-expanded={isOpen} tabIndex={kids.length ? 0 : -1} onClick={() => toggle(doc.id)}>
                <ChevronRight aria-hidden />
              </button>
              {renaming === doc.id ? (
                <input
                  autoFocus className="doc-row-rename" defaultValue={doc.title} aria-label="Page title" maxLength={200}
                  onBlur={(e) => rename(doc, e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") rename(doc, e.currentTarget.value); if (e.key === "Escape") setRenaming(null); }}
                />
              ) : (
                <Link href={href(docPath(doc))} className="doc-row-link" aria-current={doc.id === activeId ? "page" : undefined}>
                  <span className="doc-row-icon" aria-hidden>{doc.icon ?? <FileText />}</span>
                  <span className="doc-row-title">{doc.title}</span>
                </Link>
              )}
              <span className="doc-row-actions">
                {canEdit && <IconButton label={`New page inside ${doc.title}`} onClick={() => onNewPage(doc.id)}><Plus /></IconButton>}
                <Popover
                  width={210} align="right" floating
                  trigger={({ open: o, toggle: t }) => (
                    <IconButton label={`More for ${doc.title}`} onClick={t} active={o}><MoreHorizontal /></IconButton>
                  )}
                >
                  {(close) => (
                    <>
                      {canEdit && <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); setRenaming(doc.id); }}><Pencil aria-hidden /> Rename</button>}
                      <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); void copyLink(doc); }}><Link2 aria-hidden /> Copy link</button>
                      <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); void exportMd(doc); }}><Download aria-hidden /> Export as Markdown</button>
                      {canArchive && (
                        <>
                          <div className="menu-divider" />
                          <button type="button" role="menuitem" className="menu-item is-danger" onClick={() => {
                            close();
                            if (act((d, m) => archiveDocs(d, m, [doc.id]))) toast(`${doc.title} archived — find it in Settings → Archived`, undefined, "success");
                          }}><Archive aria-hidden /> Archive</button>
                        </>
                      )}
                    </>
                  )}
                </Popover>
              </span>
            </div>
            {kids.length > 0 && isOpen && rows(kids, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <nav className="doc-tree" aria-label="Pages">
      {docs.length ? rows(topLevel(docs), 0) : <p className="doc-tree-empty">No pages yet.</p>}
      {canEdit && (
        <button type="button" className="doc-tree-new" onClick={() => onNewPage()}>
          <Plus aria-hidden /> New page
        </button>
      )}
    </nav>
  );
}
