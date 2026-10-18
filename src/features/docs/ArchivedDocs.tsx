"use client";

// Settings → Archived docs (admins only, like archiving itself): restore a page with its subpages in one click, or
// delete it for good after typing "Delete <title>" — which the server checks too.
import Link from "next/link";
import { useState } from "react";
import { ArchiveRestore, FileText, Trash2 } from "lucide-react";
import { deleteDocs, docDeletePhrase, restoreDocs, withSubpages } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Doc } from "@/domain/types";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { docPath } from "./tree";

export function ArchivedDocs({ productKey }: { productKey: string }) {
  const { db, can, act, href, personById, productByKey } = useMe();
  const product = productKey ? productByKey(productKey) : undefined;
  const [deleting, setDeleting] = useState<Doc | null>(null);
  if (!can("doc.archive", { product })) return null;
  const archived = db.docs.filter((d) => d.productKey === productKey && d.archivedAt);
  const archivedIds = new Set(archived.map((d) => d.id));
  // The pages archived on their own (a subpage archived with its parent goes back with it).
  const roots = archived.filter((d) => !d.parentId || !archivedIds.has(d.parentId) || db.docs.find((p) => p.id === d.parentId)?.archivedAt !== d.archivedAt)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
  const subpages = (d: Doc) => withSubpages(archived, [d.id]).size - 1;

  return (
    <section className="card admin-card archived-docs" aria-labelledby="archived-docs-title">
      <h2 id="archived-docs-title" className="section-title">Archived docs <span className="muted">{roots.length}</span></h2>
      <p className="muted">Archived pages are hidden from everyone else and read-only. Restore one, or delete it for good.</p>
      {roots.length === 0 ? <p className="archived-empty">Nothing archived. Archive a page from its ⋯ menu.</p> : (
        <ul>
          {roots.map((d) => (
            <li key={d.id}>
              <span aria-hidden>{d.icon ?? <FileText />}</span>
              <Link className="grow" href={href(docPath(d))}>{d.title}{subpages(d) > 0 && <span className="muted"> · {subpages(d)} subpage{subpages(d) > 1 ? "s" : ""}</span>}</Link>
              <span className="muted">{shortDate(d.archivedAt)}{personById(d.archivedBy) && ` · ${personById(d.archivedBy)!.name}`}</span>
              <button type="button" className="btn btn-secondary" aria-label={`Restore ${d.title}`}
                onClick={() => act((x, m) => restoreDocs(x, m, [d.id]), { success: `${d.title} is back` })}>
                <ArchiveRestore aria-hidden /> Restore
              </button>
              <button type="button" className="btn btn-tertiary is-danger" aria-label={`Delete ${d.title} forever`} data-tip="Delete forever" onClick={() => setDeleting(d)}>
                <Trash2 aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {deleting && <DeleteForever doc={deleting} subpages={subpages(deleting)} onClose={() => setDeleting(null)} />}
    </section>
  );
}

function DeleteForever({ doc, subpages, onClose }: { doc: Doc; subpages: number; onClose: () => void }) {
  const { act } = useMe();
  const [typed, setTyped] = useState("");
  const phrase = docDeletePhrase([doc.title]);
  const ready = typed.trim() === phrase;
  return (
    <ConfirmDialog
      title={`Delete ${doc.title} for good?`} confirmLabel="Delete forever" confirmDisabled={!ready} onCancel={onClose}
      onConfirm={() => { if (!ready) return; onClose(); act((x, m) => deleteDocs(x, m, [doc.id], typed), { success: `${doc.title} deleted for good` }); }}
      body={(
        <div className="delete-forever">
          <p>This deletes <strong>{doc.title}</strong>{subpages ? ` and its ${subpages} subpage${subpages > 1 ? "s" : ""}` : ""}, with every version. It can&apos;t be undone.</p>
          <label className="field">
            <span className="field-label">Type <strong>{phrase}</strong> to confirm</span>
            <span className="input"><input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={phrase} autoComplete="off" spellCheck={false} /></span>
          </label>
        </div>
      )}
    />
  );
}
