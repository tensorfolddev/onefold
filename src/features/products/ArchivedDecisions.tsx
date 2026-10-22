"use client";

// Settings → Archived decisions: every archived decision you may manage (whoever records a project's decisions), newest
// first — search, and bring one or several back as they were. There's no deleting: a decision log keeps its record.
import Link from "next/link";
import { useState } from "react";
import { ArchiveRestore, Scale, Search } from "lucide-react";
import { restoreDecisions } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Decision } from "@/domain/types";
import { ArchiveBucket } from "@/ui/ArchiveBucket";
import { BulkHead, usePicked } from "@/ui/BulkSelect";

function useArchivedDecisions() {
  const { db, can, productByKey } = useMe();
  return db.decisions
    .filter((d) => d.archivedAt && can("decision.add", { product: productByKey(d.productKey) }))
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? ""));
}

export function ArchivedDecisionsBucket() {
  const archived = useArchivedDecisions();
  return (
    <ArchiveBucket icon={Scale} title="Archived decisions" count={archived.length} latest={archived[0] && { name: archived[0].title, at: archived[0].archivedAt }}>
      {() => <ArchivedDecisions />}
    </ArchiveBucket>
  );
}

function ArchivedDecisions() {
  const { act, href, personById, productByKey } = useMe();
  const all = useArchivedDecisions();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((d) => `${d.title} ${productByKey(d.productKey)?.name ?? ""}`.toLowerCase().includes(q)) : all;
  const { selected, pick, clear } = usePicked(shown.map((d) => d.id));
  const picked = shown.filter((d) => selected.includes(d.id));
  const restore = (decisions: Decision[]) => {
    const ids = decisions.map((d) => d.id);
    const what = decisions.length > 1 ? `${decisions.length} decisions are back` : `“${decisions[0].title}” is back`;
    if (act((x, m) => restoreDecisions(x, m, ids), { success: what })) pick(ids, false);
  };

  return (
    <section className="archived-docs" aria-label="Archived decisions">
      <div className="archived-head">
        {all.length > 0 && (
          <label className="input archived-search">
            <Search aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search archived decisions" aria-label="Search archived decisions" autoFocus />
          </label>
        )}
      </div>
      <p className="muted">Archived decisions are hidden from their project&apos;s log, and kept whole. Restore one to put it back.</p>
      {all.length === 0 ? <p className="archived-empty">Nothing archived. Right-click a decision to archive it.</p>
        : shown.length === 0 ? <p className="archived-empty">No archived decision matches “{query}”.</p> : (
          <>
            <BulkHead total={shown.length} picked={picked.length} noun="archived decisions" onAll={(on) => pick(shown.map((d) => d.id), on)} onClear={clear}>
              <button type="button" className="btn btn-secondary" onClick={() => restore(picked)}><ArchiveRestore aria-hidden /> Restore</button>
            </BulkHead>
            <ul>
              {shown.map((d) => {
                const product = productByKey(d.productKey);
                return (
                  <li key={d.id} className={selected.includes(d.id) ? "is-selected" : undefined}>
                    <input type="checkbox" className="checkbox" checked={selected.includes(d.id)} aria-label={`Select ${d.title}`}
                      onChange={(e) => pick([d.id], e.target.checked)} />
                    <span aria-hidden><Scale /></span>
                    <span className="grow">
                      {d.title}
                      {product && <> · <Link href={href(`/products/${product.key}/decisions`)} className="muted">{product.name}</Link></>}
                    </span>
                    <span className="muted">{shortDate(d.archivedAt)}{personById(d.archivedBy) && ` · ${personById(d.archivedBy)!.name}`}</span>
                    <button type="button" className="btn btn-secondary" aria-label={`Restore ${d.title}`} onClick={() => restore([d])}>
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
