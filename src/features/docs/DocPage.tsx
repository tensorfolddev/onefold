"use client";

// One doc: cover, icon and title, who's here, and the editor. Autosaves as you type; someone else's newer save is
// never overwritten silently. Archived docs are read-only (admins can restore them here).
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Copy, Download, ImagePlus, Link2, MoreHorizontal, RefreshCw, Smile, Trash2, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { archiveDocs, restoreDocs, updateDoc } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import { relativeTime } from "@/domain/status";
import type { Doc } from "@/domain/types";
import { EmojiGrid } from "@/ui/EmojiGrid";
import { Popover } from "@/ui/Popover";
import { Avatar } from "@/ui/primitives";
import type { DocLinks, Heading } from "./editor/DocEditor";
import { ancestorsOf, COVERS, coverCss, docPath, downloadMarkdown, readingMinutes } from "./tree";
import { useDocBody } from "./useDocBody";

const DocEditor = dynamic(() => import("./editor/DocEditor"), { ssr: false, loading: () => <div className="doc-skeleton" aria-busy="true" /> });
const sameHeadings = (a: Heading[], b: Heading[]) => a.length === b.length && a.every((h, i) => h.text === b[i].text && h.level === b[i].level && h.pos === b[i].pos);

export function DocPage({ id }: { id: string }) {
  const { db, me } = useDb();
  const doc = db.docs.find((d) => d.id === id);
  if (!doc) return <div className="docs-home"><div className="docs-empty">This page doesn&apos;t exist, or isn&apos;t yours to see.</div></div>;
  return <DocView doc={doc} meId={me.id} />;
}

function DocView({ doc, meId }: { doc: Doc; meId: string }) {
  const { db, can, act, href, personById, productByKey, toast } = useDb();
  const router = useRouter();
  const product = doc.productKey ? productByKey(doc.productKey) : undefined;
  const editable = can("doc.edit", { product }) && !doc.archivedAt;
  const isAdmin = can("doc.archive", { product });
  const b = useDocBody(doc.id, meId, editable);
  const [latest, setLatest] = useState<string | null>(null); // the body as typed, for export and reading time
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [title, setTitle] = useState(doc.title);
  const [emojiQuery, setEmojiQuery] = useState("");
  const text = latest ?? b.body;
  // Who can be mentioned (whoever can see this doc), and what can be linked.
  const links: DocLinks = useMemo(() => ({
    people: db.people.filter((p) => p.active && p.panel && (!product || p.panel === "admin" || p.id === product.pmId || p.id === product.projectManagerId || product.memberIds.includes(p.id)))
      .map((p) => ({ id: p.id, name: p.name, role: p.role })),
    tickets: db.tickets.map((t) => ({ key: t.key, title: t.title })),
    docs: db.docs.filter((d) => !d.archivedAt && d.id !== doc.id).map((d) => ({ id: d.id, title: d.title, icon: d.icon })),
  }), [db.people, db.tickets, db.docs, product, doc.id]);

  const onChange = useCallback((md: string) => { setLatest(md); b.setDraft(md); }, [b]);
  const onHeadings = useCallback((h: Heading[]) => setHeadings((cur) => (sameHeadings(cur, h) ? cur : h)), []);
  const saveTitle = () => {
    const next = title.trim();
    if (!next) { setTitle(doc.title); return; }
    if (next !== doc.title && !act((d, m) => updateDoc(d, m, doc.id, { title: next }))) setTitle(doc.title);
  };
  const look = (patch: { icon?: string | null; cover?: string | null }) => act((d, m) => updateDoc(d, m, doc.id, patch));
  const copy = async (what: string, value: string) => {
    await navigator.clipboard.writeText(value).catch(() => {});
    toast(`${what} copied`, undefined, "success");
  };

  const others = b.presence.filter((p) => p.personId !== meId);
  const typing = others.filter((p) => p.editing).map((p) => personById(p.personId)?.name.split(" ")[0]).filter(Boolean);
  const editedBy = personById(doc.updatedBy ?? doc.authorId);
  const crumbs = ancestorsOf(db.docs, doc);
  const status = b.conflict ? { text: "Not saved", cls: "is-error" }
    : b.error ? { text: "Can't save — retrying", cls: "is-error" }
    : b.saving ? { text: "Saving…", cls: "is-busy" }
    : b.unsaved ? { text: "Editing", cls: "is-busy" }
    : b.savedAt ? { text: "Saved", cls: "" } : null;

  return (
    <article className={`doc-page${doc.cover ? " has-cover" : ""}`} aria-labelledby="doc-title">
      <nav className="doc-meta doc-crumbs" aria-label="Breadcrumb">
        <Link href={href(product ? `/products/${product.key}/docs` : "/docs")}>{product ? product.name : "Company docs"}</Link>
        {crumbs.map((c) => (<span key={c.id} style={{ display: "contents" }}><span aria-hidden>/</span><Link href={href(docPath(c))}>{c.icon ?? ""} {c.title}</Link></span>))}
      </nav>
      {doc.cover && <div className="doc-cover" style={{ "--cover": coverCss(doc.cover) } as React.CSSProperties} aria-hidden />}
      <header className="doc-head">

        {doc.icon && (
          editable ? (
            <Popover width={340} floating trigger={({ toggle }) => <button type="button" className="doc-icon-btn" aria-label="Change icon" onClick={toggle}>{doc.icon}</button>}>
              {(close) => <IconPicker query={emojiQuery} setQuery={setEmojiQuery} onPick={(icon) => { look({ icon }); close(); }} onRemove={() => { look({ icon: null }); close(); }} />}
            </Popover>
          ) : <span className="doc-icon-btn" aria-hidden>{doc.icon}</span>
        )}

        {editable && (
          <div className="doc-head-tools">
            {!doc.icon && (
              <Popover width={340} floating trigger={({ toggle }) => <button type="button" className="doc-head-tool" onClick={toggle}><Smile aria-hidden /> Add icon</button>}>
                {(close) => <IconPicker query={emojiQuery} setQuery={setEmojiQuery} onPick={(icon) => { look({ icon }); close(); }} />}
              </Popover>
            )}
            <Popover width={240} floating trigger={({ toggle }) => <button type="button" className="doc-head-tool" onClick={toggle}><ImagePlus aria-hidden /> {doc.cover ? "Change cover" : "Add cover"}</button>}>
              {(close) => (
                <>
                  <p className="menu-section-label">Cover</p>
                  <div className="cover-swatches">
                    {COVERS.map((c) => (
                      <button key={c.id} type="button" className={`cover-swatch${doc.cover === c.id ? " is-current" : ""}`} style={{ background: c.css }}
                        aria-label={c.label} title={c.label} onClick={() => { look({ cover: c.id }); close(); }} />
                    ))}
                  </div>
                  {doc.cover && <button type="button" className="menu-item" onClick={() => { look({ cover: null }); close(); }}><Trash2 aria-hidden /> Remove cover</button>}
                </>
              )}
            </Popover>
          </div>
        )}

        <h1 id="doc-title" style={{ margin: 0 }}>
          {editable ? (
            <textarea
              className="doc-title" rows={1} value={title} maxLength={200} aria-label="Title" placeholder="Untitled"
              onChange={(e) => { setTitle(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${e.target.scrollHeight}px`; }}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); document.querySelector<HTMLElement>(".doc-prose")?.focus(); } }}
            />
          ) : <span className="doc-title">{doc.title}</span>}
        </h1>

        <div className="doc-meta">
          {editedBy && <><Avatar personId={editedBy.id} size="sm" /> <span>Edited {relativeTime(doc.updatedAt ?? `${doc.updated}T00:00:00Z`)} ago by {editedBy.name.split(" ")[0]}</span></>}
          <span className="dot" aria-hidden />
          <span>{readingMinutes(text)} min read</span>
          {status && <><span className="dot" aria-hidden /><span className={`doc-saving ${status.cls}`} role="status">{status.text}</span></>}
          <span className="doc-presence">
            {others.length > 0 && (
              <span className="avatar-stack" title={others.map((p) => personById(p.personId)?.name).join(", ")} aria-label={`Also here: ${others.map((p) => personById(p.personId)?.name).join(", ")}`}>
                {others.slice(0, 4).map((p) => <Avatar key={p.personId} personId={p.personId} size="sm" />)}
              </span>
            )}
            <Popover width={230} align="right" floating trigger={({ toggle }) => (
              <button type="button" className="doc-head-tool" aria-label="Page actions" onClick={toggle}><MoreHorizontal aria-hidden /></button>
            )}>
              {(close) => (
                <>
                  <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); void copy("Link", `${location.origin}${href(`/d/${doc.id}`)}`); }}><Link2 aria-hidden /> Copy link</button>
                  <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); void copy("Markdown", `# ${doc.title}\n\n${text}`); }}><Copy aria-hidden /> Copy as Markdown</button>
                  <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); downloadMarkdown(doc.title, text); }}><Download aria-hidden /> Export as Markdown</button>
                  {isAdmin && !doc.archivedAt && (
                    <>
                      <div className="menu-divider" />
                      <button type="button" role="menuitem" className="menu-item is-danger" onClick={() => {
                        close();
                        if (act((d, m) => archiveDocs(d, m, [doc.id]))) {
                          toast(`${doc.title} archived — find it in Settings → Archived`, undefined, "success");
                          router.push(href(product ? `/products/${product.key}/docs` : "/docs"));
                        }
                      }}><Archive aria-hidden /> Archive page</button>
                    </>
                  )}
                </>
              )}
            </Popover>
          </span>
        </div>
      </header>

      {doc.archivedAt && (
        <div className="doc-banner is-warning" role="status">
          <Archive aria-hidden /> This page is archived, so it&apos;s read-only.
          <span className="spacer" />
          {isAdmin && <button type="button" className="btn btn-secondary" onClick={() => act((d, m) => restoreDocs(d, m, [doc.id]))}><ArchiveRestore aria-hidden /> Restore</button>}
        </div>
      )}
      {typing.length > 0 && !b.conflict && (
        <div className="doc-banner" role="status"><Users aria-hidden /> {typing.join(", ")} {typing.length > 1 ? "are" : "is"} editing — their changes appear when they pause.</div>
      )}
      {b.staleBy && !b.conflict && (
        <div className="doc-banner is-warning" role="status">
          <RefreshCw aria-hidden /> {personById(b.staleBy)?.name.split(" ")[0] ?? "Someone"} updated this page while you were typing.
          <span className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={() => void b.reload()}>Load theirs (copies yours)</button>
        </div>
      )}
      {b.conflict && (
        <div className="doc-banner is-warning" role="alert">
          <RefreshCw aria-hidden /> {personById(b.conflict.updatedBy ?? "")?.name.split(" ")[0] ?? "Someone"} saved a newer version while you were typing.
          <span className="spacer" />
          <button type="button" className="btn btn-secondary" onClick={() => void b.resolveConflict("theirs").then(() => toast("Your text is on the clipboard", undefined, "info"))}>Use theirs</button>
          <button type="button" className="btn btn-primary" onClick={() => void b.resolveConflict("mine")}>Keep mine</button>
        </div>
      )}

      <div className="doc-body">
        {b.status === "error" ? <div className="docs-empty">{b.error}</div>
          : b.status === "loading" ? <div className="doc-skeleton" aria-busy="true" />
          : <DocEditor key={b.reloadKey} body={b.body} editable={editable} onChange={onChange} onHeadings={onHeadings} links={links} />}
        {b.backlinks.length > 0 && (
          <footer className="doc-backlinks" aria-labelledby="backlinks-title">
            <h2 id="backlinks-title" className="doc-toc-title">Linked from</h2>
            <ul>
              {b.backlinks.map((l) => (
                <li key={l.id}><Link href={href(docPath(l))} className="doc-chip is-doc"><span aria-hidden>{l.icon ?? "📄"}</span><span className="doc-chip-title">{l.title}</span></Link></li>
              ))}
            </ul>
          </footer>
        )}
      </div>

      {headings.length > 2 && (
        <nav className="doc-toc" aria-label="On this page">
          <p className="doc-toc-title">On this page</p>
          {headings.map((h) => (
            <a key={`${h.pos}-${h.text}`} href={`#h-${h.pos}`} data-level={h.level} onClick={(e) => {
              e.preventDefault();
              void import("./editor/DocEditor").then((m) => m.scrollToBlock(h.pos));
            }}>{h.text || "Untitled heading"}</a>
          ))}
        </nav>
      )}
    </article>
  );
}

function IconPicker({ query, setQuery, onPick, onRemove }: { query: string; setQuery: (q: string) => void; onPick: (e: string) => void; onRemove?: () => void }) {
  return (
    <div className="icon-picker">
      <div className="icon-picker-search" style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <input type="search" className="input" placeholder="Search emoji" aria-label="Search emoji" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, height: 32, padding: "0 8px" }} />
        {onRemove && <button type="button" className="btn btn-tertiary" onClick={onRemove}>Remove</button>}
      </div>
      <EmojiGrid query={query} onPick={onPick} />
    </div>
  );
}
