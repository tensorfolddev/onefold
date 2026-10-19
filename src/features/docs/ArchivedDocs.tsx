"use client";

// Settings → Archived docs (admins only, like archiving itself): restore a page with its subpages in one click, or
// delete it for good after typing "Delete <title>" (or "Delete 3 docs") — which the server checks too. Several at once:
// tick them (or Select all), then Restore or Delete forever.
import Link from "next/link";
import { useState } from "react";
import { ArchiveRestore, FileText, Trash2 } from "lucide-react";
import { deleteDocs, docDeletePhrase, restoreDocs, withSubpages } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Doc } from "@/domain/types";
import { BulkHead, usePicked } from "@/ui/BulkSelect";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { docPath } from "./tree";

export function ArchivedDocs({ productKey }: { productKey: string }) {
  const { db, can, act, href, personById, productByKey } = useMe();
  const product = productKey ? productByKey(productKey) : undefined;
  const [deleting, setDeleting] = useState<Doc[] | null>(null);
  const archived = db.docs.filter((d) => d.productKey === productKey && d.archivedAt);
  const archivedIds = new Set(archived.map((d) => d.id));
  // The pages archived on their own (a subpage archived with its parent goes back with it).
  const roots = archived.filter((d) => !d.parentId || !archivedIds.has(d.parentId) || db.docs.find((p) => p.id === d.parentId)?.archivedAt !== d.archivedAt)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const subpages = (d: Doc) => withSubpages(archived, [d.id]).size - 1;
  const { selected, pick, clear } = usePicked(roots.map((d) => d.id));
  if (!can("doc.archive", { product })) return null;
  const picked = roots.filter((d) => selected.includes(d.id));
  const restore = (docs: Doc[]) => {
    const ids = docs.map((d) => d.id);
    if (act((x, m) => restoreDocs(x, m, ids), { success: docs.length > 1 ? `${docs.length} docs are back` : `${docs[0].title} is back` })) pick(ids, false);
  };

  return (
    <section className="card admin-card archived-docs" aria-labelledby="archived-docs-title">
      <h2 id="archived-docs-title" className="section-title">Archived docs <span className="muted">{roots.length}</span></h2>
      <p className="muted">Archived pages are hidden from everyone else and read-only. Restore one, or delete it for good.</p>
      {roots.length === 0 ? <p className="archived-empty">Nothing archived. Archive a page from its ⋯ menu.</p> : (
        <>
        <BulkHead total={roots.length} picked={picked.length} noun="archived docs" onAll={(on) => pick(roots.map((d) => d.id), on)} onClear={clear}>
          <button type="button" className="btn btn-secondary" onClick={() => restore(picked)}><ArchiveRestore aria-hidden /> Restore</button>
          <button type="button" className="btn btn-tertiary is-danger" onClick={() => setDeleting(picked)}><Trash2 aria-hidden /> Delete forever</button>
        </BulkHead>
        <ul>
          {roots.map((d) => (
            <li key={d.id} className={selected.includes(d.id) ? "is-selected" : undefined}>
              <input type="checkbox" className="checkbox" checked={selected.includes(d.id)} aria-label={`Select ${d.title}`}
                onChange={(e) => pick([d.id], e.target.checked)} />
              <span aria-hidden>{d.icon ?? <FileText />}</span>
              <Link className="grow" href={href(docPath(d))}>{d.title}{subpages(d) > 0 && <span className="muted"> · {subpages(d)} subpage{subpages(d) > 1 ? "s" : ""}</span>}</Link>
              <span className="muted">{shortDate(d.archivedAt)}{personById(d.archivedBy) && ` · ${personById(d.archivedBy)!.name}`}</span>
              <button type="button" className="btn btn-secondary" aria-label={`Restore ${d.title}`}
                onClick={() => restore([d])}>
                <ArchiveRestore aria-hidden /> Restore
              </button>
              <button type="button" className="btn btn-tertiary is-danger" aria-label={`Delete ${d.title} forever`} data-tip="Delete forever" onClick={() => setDeleting([d])}>
                <Trash2 aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        </>
      )}
      {deleting && (
        <DeleteForever docs={deleting} subpages={deleting.reduce((n, d) => n + subpages(d), 0)}
          onDone={() => pick(deleting.map((d) => d.id), false)} onClose={() => setDeleting(null)} />
      )}
    </section>
  );
}

const LISTED = 5;

function DeleteForever({ docs, subpages, onDone, onClose }: { docs: Doc[]; subpages: number; onDone: () => void; onClose: () => void }) {
  const { act } = useMe();
  const [typed, setTyped] = useState("");
  const titles = docs.map((d) => d.title);
  const name = docs.length === 1 ? titles[0] : `${docs.length} docs`;
  const phrase = docDeletePhrase(titles);
  const ready = typed.trim() === phrase;
  const remove = () => {
    if (!ready) return;
    onClose();
    if (act((x, m) => deleteDocs(x, m, docs.map((d) => d.id), typed), { success: `${name} deleted for good` })) onDone();
  };
  const listed = titles.length > LISTED ? `${titles.slice(0, LISTED).join(", ")} and ${titles.length - LISTED} more` : titles.join(", ");
  return (
    <ConfirmDialog
      title={`Delete ${name} for good?`} confirmLabel="Delete forever" confirmDisabled={!ready} onCancel={onClose} onConfirm={remove}
      body={(
        <div className="delete-forever">
          <p>This deletes <strong>{listed}</strong>{subpages ? ` and ${docs.length === 1 ? "its" : "their"} ${subpages} subpage${subpages > 1 ? "s" : ""}` : ""}, with every version. It can&apos;t be undone.</p>
          <label className="field">
            <span className="field-label">Type <strong>{phrase}</strong> to confirm</span>
            <span className="input"><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={phrase} autoComplete="off" spellCheck={false} /></span>
          </label>
        </div>
      )}
    />
  );
}
