"use client";

// A space's pages in the sidebar: in groups (collapsible, with counts, like project groups), then the ungrouped
// "Pages". Each page opens and closes to show its subpages. Drag a page onto another to put it inside, onto its top or
// bottom edge to put it before or after, or onto a group's name to move it into that group. Each row: "+" for a
// subpage, and ⋯ (rename, move to a group, copy link, export, archive for admins). My docs has no groups: your own
// pages, then the ones shared with you — what each lets you do is the page's own (docAccess.ts).
import Link from "next/link";
import {
  Archive, ChevronDown, ChevronRight, Download, FileText, FolderInput, Link2, MoreHorizontal, Pencil, Plus, Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addDocGroup, archiveDocs, deleteDocGroup, moveDoc, renameDocGroup, setDocGroup, updateDoc } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import { canDoc } from "@/domain/docAccess";
import type { Doc, DocGroup } from "@/domain/types";
import { InlineName } from "@/features/shell/ProductsSidebar";
import { Popover } from "@/ui/Popover";
import { getDoc } from "./api";
import { ancestorsOf, childrenOf, docPath, downloadMarkdown, MY_DOCS, spaceDocs, topLevel } from "./tree";
import { rem } from "@/ui/primitives";

type Zone = "before" | "inside" | "after";
const storeKey = (space: string, what: string) => `onefold.docs.${what}.${space || "company"}`;

function readSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]); } catch { return new Set(); }
}
function writeSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* per-browser convenience only */ }
}

export function DocTree({ productKey, activeId, onNewPage }: { productKey: string; activeId?: string; onNewPage: (opts?: { parentId?: string; groupId?: string }) => void }) {
  const { db, can, act, href, productByKey, toast, me } = useDb();
  const personal = productKey === MY_DOCS;
  const product = productKey && !personal ? productByKey(productKey) : undefined;
  const docs = useMemo(() => spaceDocs(db.docs, productKey), [db.docs, productKey]);
  const groups = useMemo(() => (personal ? [] : db.docGroups.filter((g) => g.productKey === productKey)), [db.docGroups, productKey, personal]);
  const canEdit = personal || can("doc.edit", { product }); // in My docs: each page says (below)
  const editable = (doc: Doc) => (personal ? canDoc(db.docs, me, "doc.edit", doc) : canEdit);
  const archivable = (doc: Doc) => (personal ? canDoc(db.docs, me, "doc.archive", doc) : can("doc.archive", { product }));
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [shut, setShut] = useState<Set<string>>(() => new Set()); // collapsed groups
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; zone: Zone } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);

  // Remember what's open per space, and always show the way to the open page.
  useEffect(() => {
    const saved = readSet(storeKey(productKey, "open"));
    const active = docs.find((d) => d.id === activeId);
    if (active) for (const a of ancestorsOf(docs, active)) saved.add(a.id);
    setOpen(saved); // eslint-disable-line react-hooks/set-state-in-effect -- restores the person's own tree from this browser
    setShut(readSet(storeKey(productKey, "shut")));
  }, [productKey, activeId, docs]);
  const flip = (set: Set<string>, id: string) => { const next = new Set(set); if (!next.delete(id)) next.add(id); return next; };
  const toggle = (id: string) => setOpen((cur) => { const next = flip(cur, id); writeSet(storeKey(productKey, "open"), next); return next; });
  const toggleGroup = (id: string) => setShut((cur) => { const next = flip(cur, id); writeSet(storeKey(productKey, "shut"), next); return next; });

  const tops = topLevel(docs);
  const SHARED = "shared-with-me";
  const inGroup = (gid: string | null) => (personal
    ? tops.filter((d) => (gid === SHARED) === (d.ownerId !== me.id)) // mine, or shared with me
    : tops.filter((d) => (gid ? d.groupId === gid : !d.groupId || !groups.some((g) => g.id === d.groupId))));

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
    const siblings = target.parentId ? childrenOf(docs, target.parentId) : inGroup(target.groupId ?? null);
    const next = siblings[siblings.findIndex((d) => d.id === target.id) + 1];
    act((d, m) => {
      if (zone === "inside") return moveDoc(d, m, id, { parentId: target.id });
      const placed = moveDoc(d, m, id, { parentId: target.parentId ?? null, beforeId: zone === "before" ? target.id : next?.id });
      return target.parentId ? placed : setDocGroup(placed, m, id, target.groupId ?? null); // same group as where it landed
    });
    if (zone === "inside") setOpen((cur) => new Set(cur).add(target.id));
  };
  const dropOnGroup = (gid: string | null) => {
    const id = dragId;
    setDragId(null);
    setDrop(null);
    if (id && !(personal && gid === SHARED)) act((d, m) => setDocGroup(d, m, id, personal ? null : gid)); // My docs: to the top
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

  const rowMenu = (doc: Doc) => (
    <Popover
      width={220} align="right" floating
      trigger={({ open: o, toggle: t }) => (
        <button type="button" className={`doc-row-btn${o ? " is-open" : ""}`} aria-label={`More for ${doc.title}`} data-tip="More actions" aria-expanded={o} onClick={t}><MoreHorizontal aria-hidden /></button>
      )}
    >
      {(close) => (
        <>
          {editable(doc) && <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); setRenaming(doc.id); }}><Pencil aria-hidden /> Rename</button>}
          {canEdit && !personal && !doc.parentId && (
            <>
              <p className="menu-section-label"><FolderInput aria-hidden style={{ width: rem(13), height: rem(13), verticalAlign: rem(-2) }} /> Move to group</p>
              {groups.filter((g) => g.id !== doc.groupId).map((g) => (
                <button key={g.id} type="button" role="menuitem" className="menu-item" onClick={() => { close(); act((d, m) => setDocGroup(d, m, doc.id, g.id)); }}>{g.name}</button>
              ))}
              {doc.groupId && <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); act((d, m) => setDocGroup(d, m, doc.id, null)); }}>No group</button>}
              {!groups.length && <p className="menu-section-label" style={{ textTransform: "none" }}>No groups yet</p>}
              <div className="menu-divider" />
            </>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); void copyLink(doc); }}><Link2 aria-hidden /> Copy link</button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); void exportMd(doc); }}><Download aria-hidden /> Export as Markdown</button>
          {archivable(doc) && (
            <>
              <div className="menu-divider" />
              <button type="button" role="menuitem" className="menu-item is-danger" onClick={() => {
                close();
                const where = personal ? "under Archived in My docs" : "in Settings → Archived";
                if (act((d, m) => archiveDocs(d, m, [doc.id]))) toast(`${doc.title} archived — find it ${where}`, undefined, "success");
              }}><Archive aria-hidden /> Archive</button>
            </>
          )}
        </>
      )}
    </Popover>
  );

  const rows = (list: Doc[], depth: number): React.ReactNode => (
    <ul role="group">
      {list.map((doc) => {
        const kids = childrenOf(docs, doc.id);
        const isOpen = open.has(doc.id);
        const dz = drop?.id === doc.id ? drop.zone : null;
        return (
          <li key={doc.id} role="treeitem" aria-expanded={kids.length ? isOpen : undefined} aria-selected={doc.id === activeId}>
            <div
              className={`doc-row${doc.id === activeId ? " is-active" : ""}${dz ? ` is-drop-${dz}` : ""}`}
              style={{ paddingLeft: 6 + depth * 16 }}
              draggable={editable(doc) && renaming !== doc.id}
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
                {rowMenu(doc)}
                {editable(doc) && <button type="button" className="doc-row-btn" aria-label={`New page inside ${doc.title}`} data-tip="Add a page inside" onClick={() => onNewPage({ parentId: doc.id })}><Plus aria-hidden /></button>}
              </span>
            </div>
            {kids.length > 0 && isOpen && rows(kids, depth + 1)}
          </li>
        );
      })}
    </ul>
  );

  const section = (g: DocGroup | null) => {
    const list = inGroup(g?.id ?? null);
    const key = g?.id ?? "ungrouped";
    const closed = shut.has(key);
    const name = g?.name ?? (personal ? "My pages" : groups.length ? "Other pages" : "Pages");
    const sharedWithMe = personal && g?.id === SHARED;
    if (sharedWithMe && !list.length) return null;
    return (
      <div key={key} className="sidebar-group doc-group">
        {renaming === `g:${key}` && g ? (
          <InlineName label="Group name" initial={g.name} onCancel={() => setRenaming(null)}
            onSave={(n) => act((d, m) => renameDocGroup(d, m, g.id, n), { success: "Group renamed" })} />
        ) : (
          <div
            className={`sidebar-group-head${dragId && drop?.id === `g:${key}` ? " is-drop" : ""}`}
            onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setDrop({ id: `g:${key}`, zone: "inside" }); }}
            onDragLeave={() => setDrop((d) => (d?.id === `g:${key}` ? null : d))}
            onDrop={(e) => { e.preventDefault(); dropOnGroup(g?.id ?? null); }}
          >
            <button type="button" className="sidebar-section sidebar-group-toggle" onClick={() => toggleGroup(key)} aria-expanded={!closed}>
              <ChevronDown aria-hidden className={closed ? "is-collapsed" : undefined} />
              <span className="sidebar-group-name">{name}</span>
              <span className="sidebar-group-count">{list.length}</span>
            </button>
            {canEdit && !sharedWithMe && (
              <span className="doc-group-actions">
                <button type="button" className="doc-row-btn" aria-label={`New page in ${name}`} data-tip="Add a page" onClick={() => onNewPage({ groupId: g?.id })}><Plus aria-hidden /></button>
                {g && !personal && (
                  <Popover align="right" width={200} floating trigger={({ open: o, toggle: t }) => (
                    <button type="button" className={`doc-row-btn${o ? " is-open" : ""}`} aria-label={`${name} group options`} data-tip="Group options" aria-expanded={o} onClick={t}><MoreHorizontal aria-hidden /></button>
                  )}>
                    {(close) => (
                      <>
                        <button type="button" className="menu-item" onClick={() => { close(); setRenaming(`g:${key}`); }}><Pencil aria-hidden /> Rename group</button>
                        <button type="button" className="menu-item is-danger" onClick={() => { close(); act((d, m) => deleteDocGroup(d, m, g.id), { success: `${name} deleted — its pages are kept`, undoable: true }); }}>
                          <Trash2 aria-hidden /> Delete group
                        </button>
                      </>
                    )}
                  </Popover>
                )}
              </span>
            )}
          </div>
        )}
        {!closed && (list.length ? rows(list, 0)
          : <p className="sidebar-empty">{g ? "Drag pages here, or add one with +" : personal ? "Only you can see these until you share them" : "No pages yet"}</p>)}
      </div>
    );
  };

  return (
    <nav className="doc-tree" aria-label="Pages">
      <div role="tree" aria-label="Pages">
        {groups.map((g) => section(g))}
        {section(null)}
        {personal && section({ id: SHARED, productKey, name: "Shared with me" })}
      </div>
      {canEdit && !personal && (addingGroup ? (
        <InlineName label="Group name" onCancel={() => setAddingGroup(false)}
          onSave={(n) => act((d, m) => addDocGroup(d, m, productKey, n, `dg-${crypto.randomUUID().slice(0, 8)}`), { success: "Group added" })} />
      ) : (
        <button type="button" className="sidebar-add-group" onClick={() => setAddingGroup(true)}><Plus aria-hidden /> New group</button>
      ))}
    </nav>
  );
}
