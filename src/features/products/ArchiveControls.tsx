"use client";

// Archiving a product: one click to archive or restore (each with Undo), and — admins only, archived products only —
// deleting for good, after typing "Delete <name>" and agreeing. The server checks the same words, whoever asks.
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { archiveProduct, deletePhrase, deleteProduct, restoreProduct } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Product } from "@/domain/types";
import { ConfirmDialog } from "@/ui/ConfirmDialog";

export function useArchive() {
  const { act } = useMe();
  return {
    archive: (p: Product) => act((d, m) => archiveProduct(d, m, p.key), { success: `${p.name} archived — it's under Archived`, undoable: true }),
    restore: (p: Product) => act((d, m) => restoreProduct(d, m, p.key), { success: `${p.name} restored`, undoable: true }),
  };
}

export function DeleteProductDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { db, act, href } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const [typed, setTyped] = useState("");
  const [agreed, setAgreed] = useState(false);
  const phrase = deletePhrase(product);
  const tickets = db.tickets.filter((t) => t.productKey === product.key).length;
  const ready = typed.trim() === phrase && agreed;

  const remove = () => {
    if (!ready) return;
    onClose();
    // Off its pages first, so they never show "not found" while it goes.
    if (pathname.startsWith(href(`/products/${product.key}`))) router.push(href("/products"));
    act((d, m) => deleteProduct(d, m, product.key, typed), { success: `${product.name} deleted` });
  };

  return (
    <ConfirmDialog
      title={`Delete ${product.name} for good?`}
      confirmLabel="Delete forever" confirmDisabled={!ready} onConfirm={remove} onCancel={onClose}
      body={(
        <div className="delete-product">
          <p>
            This deletes <strong>{product.name}</strong> and everything in it — {tickets} ticket{tickets === 1 ? "" : "s"},
            {" "}their comments, files and history. It can&apos;t be undone.
          </p>
          <label className="field">
            <span className="field-label">Type <strong>{phrase}</strong> to confirm</span>
            <span className="input">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={phrase} autoComplete="off" spellCheck={false} />
            </span>
          </label>
          <label className="delete-product-agree">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            I understand this can&apos;t be undone
          </label>
        </div>
      )}
    />
  );
}

/** At the top of an archived product's pages: what happened, and the way back. */
export function ArchivedBanner({ product }: { product: Product }) {
  const { can, personById } = useMe();
  const { restore } = useArchive();
  const [deleting, setDeleting] = useState(false);
  const by = personById(product.archivedBy)?.name;
  return (
    <div className="archived-banner" role="status">
      <Archive aria-hidden />
      <p>
        <strong>Archived</strong>{product.archivedAt && ` on ${shortDate(product.archivedAt)}`}{by && ` by ${by}`}.
        {" "}It&apos;s read-only, and developers can&apos;t see it.
      </p>
      {can("product.archive", { product }) && (
        <button type="button" className="btn btn-primary" onClick={() => restore(product)}><ArchiveRestore aria-hidden /> Restore</button>
      )}
      {can("product.delete", { product }) && (
        <button type="button" className="btn btn-tertiary is-danger" onClick={() => setDeleting(true)}><Trash2 aria-hidden /> Delete forever…</button>
      )}
      {deleting && <DeleteProductDialog product={product} onClose={() => setDeleting(false)} />}
    </div>
  );
}
