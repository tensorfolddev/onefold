"use client";

// Archiving a product: one click to archive or restore (each with Undo), and — admins only, archived products only —
// deleting for good, after typing "Delete <name>" and agreeing. The server checks the same words, whoever asks.
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Archive, ArchiveRestore, FolderArchive, Search, Trash2 } from "lucide-react";
import { archivedProducts } from "@/domain/permissions";
import { ArchiveBucket } from "@/ui/ArchiveBucket";
import { ProductTile } from "@/ui/primitives";
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

/** Settings → Archived: the company's archived products as a bucket — open it to restore one, or (admins) delete it for good. */
export function ArchivedProductsBucket() {
  const { me, db } = useMe();
  const archived = archivedProducts(me, db.products).filter((p) => !p.ownerId)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")); // most recently archived first
  return (
    <ArchiveBucket icon={FolderArchive} title="Archived products" count={archived.length} latest={archived[0] && { name: archived[0].name, at: archived[0].archivedAt }}>
      {(close) => <ArchivedProductList products={archived} onOpen={close} />}
    </ArchiveBucket>
  );
}

function ArchivedProductList({ products, onOpen }: { products: Product[]; onOpen: () => void }) {
  const { href, can, personById } = useMe();
  const { restore } = useArchive();
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Product | null>(null);
  const q = query.trim().toLowerCase();
  const shown = q ? products.filter((p) => `${p.key} ${p.name}`.toLowerCase().includes(q)) : products;
  return (
    <section className="archived-products" aria-label="Archived products">
      {products.length > 0 && (
        <div className="archived-head">
          <label className="input archived-search">
            <Search aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search archived products" aria-label="Search archived products" autoFocus />
          </label>
        </div>
      )}
      <p className="muted">Archived products are read-only and out of everyone&apos;s lists. Restoring one brings it back with all its tickets and docs.</p>
      {products.length === 0 ? <p className="archived-empty">Nothing archived. Archive a product from its ⋯ menu in the sidebar.</p> : (
        <ul className="archived-list">
          {shown.map((p) => (
            <li key={p.key} className="archived-row">
              <Link className="archived-open" href={href(`/products/${p.key}`)} onClick={onOpen}>
                <ProductTile product={p} /><span className="key">{p.key}</span><span className="archived-title">{p.name}</span>
              </Link>
              <span className="archived-meta">{shortDate(p.archivedAt)}{personById(p.archivedBy) && ` · ${personById(p.archivedBy)!.name}`}</span>
              {can("product.archive", { product: p }) && (
                <button type="button" className="btn btn-secondary" aria-label={`Restore ${p.name}`} onClick={() => restore(p)}><ArchiveRestore aria-hidden /> Restore</button>
              )}
              {can("product.delete", { product: p }) && (
                <button type="button" className="btn btn-tertiary is-danger archived-delete" aria-label={`Delete ${p.name} forever`} title="Delete forever" onClick={() => setDeleting(p)}>
                  <Trash2 aria-hidden />
                </button>
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="archived-row archived-empty">No archived product matches “{query}”.</li>}
        </ul>
      )}
      {deleting && <DeleteProductDialog product={deleting} onClose={() => setDeleting(null)} />}
    </section>
  );
}
