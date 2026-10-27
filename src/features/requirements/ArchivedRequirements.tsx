"use client";

// Settings → Archived requirements (admins: they archive and restore them): company-wide, or one project's, newest
// first — search, and bring one or several back onto both boards as they were, chat and all.
import Link from "next/link";
import { useState } from "react";
import { ArchiveRestore, ClipboardCheck, Search } from "lucide-react";
import { unarchiveRequirements } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Requirement } from "@/domain/types";
import { ArchiveBucket } from "@/ui/ArchiveBucket";
import { BulkHead, usePicked } from "@/ui/BulkSelect";

function useArchivedRequirements(productKey?: string) {
  const { db, can, productByKey } = useMe();
  return db.requirements
    .filter((r) => r.archivedAt && (!productKey || r.productKey === productKey) && can("requirement.archive", { product: productByKey(r.productKey) }))
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
}

export function ArchivedRequirementsBucket({ productKey }: { productKey?: string }) {
  const { can, productByKey } = useMe();
  const archived = useArchivedRequirements(productKey);
  if (!can("requirement.archive", { product: productKey ? productByKey(productKey) : undefined })) return null; // admins only
  return (
    <ArchiveBucket icon={ClipboardCheck} title="Archived requirements" count={archived.length} latest={archived[0] && { name: `${archived[0].code} · ${archived[0].title}`, at: archived[0].archivedAt }}>
      {() => <ArchivedRequirements productKey={productKey} />}
    </ArchiveBucket>
  );
}

function ArchivedRequirements({ productKey }: { productKey?: string }) {
  const { act, href, personById, productByKey } = useMe();
  const all = useArchivedRequirements(productKey);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((r) => `${r.code} ${r.title} ${productByKey(r.productKey)?.name ?? ""}`.toLowerCase().includes(q)) : all;
  const { selected, pick, clear } = usePicked(shown.map((r) => r.id));
  const picked = shown.filter((r) => selected.includes(r.id));
  const restore = (reqs: Requirement[]) => {
    const ids = reqs.map((r) => r.id);
    const what = reqs.length > 1 ? `${reqs.length} requirements are back` : `${reqs[0].code} is back`;
    if (act((x, m) => unarchiveRequirements(x, m, ids), { success: what })) pick(ids, false);
  };

  return (
    <section className="archived-docs" aria-label="Archived requirements">
      <div className="archived-head">
        {all.length > 0 && (
          <label className="input archived-search">
            <Search aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search archived requirements" aria-label="Search archived requirements" autoFocus />
          </label>
        )}
      </div>
      <p className="muted">Archived requirements are off the team&apos;s board and the client&apos;s, kept whole — chat and all. Restore one to put it back.</p>
      {all.length === 0 ? <p className="archived-empty">Nothing archived. Open a requirement and choose Archive.</p>
        : shown.length === 0 ? <p className="archived-empty">No archived requirement matches “{query}”.</p> : (
          <>
            <BulkHead total={shown.length} picked={picked.length} noun="archived requirements" onAll={(on) => pick(shown.map((r) => r.id), on)} onClear={clear}>
              <button type="button" className="btn btn-secondary" onClick={() => restore(picked)}><ArchiveRestore aria-hidden /> Restore</button>
            </BulkHead>
            <ul>
              {shown.map((r) => {
                const product = productByKey(r.productKey);
                return (
                  <li key={r.id} className={selected.includes(r.id) ? "is-selected" : undefined}>
                    <input type="checkbox" className="checkbox" checked={selected.includes(r.id)} aria-label={`Select ${r.code}`}
                      onChange={(e) => pick([r.id], e.target.checked)} />
                    <span aria-hidden><ClipboardCheck /></span>
                    <span className="grow">
                      <b>{r.code}</b> {r.title}
                      {product && !productKey && <> · <Link href={href(`/products/${product.key}/requirements`)} className="muted">{product.name}</Link></>}
                    </span>
                    <span className="muted">{shortDate(r.archivedAt)}{personById(r.archivedBy) && ` · ${personById(r.archivedBy)!.name}`}</span>
                    <button type="button" className="btn btn-secondary" aria-label={`Restore ${r.code}`} onClick={() => restore([r])}>
                      <ArchiveRestore aria-hidden /> Restore
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
    </section>
  );
}
