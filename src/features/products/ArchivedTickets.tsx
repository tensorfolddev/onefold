"use client";

// Product Settings → Archived: the tickets and epics taken off the board. Anyone who may archive restores in one click;
// only an admin deletes for good — after typing "Delete <key>" (or "Delete 3 tickets"), which the server checks too.
// Several at once: tick them (or Select all), then Restore or Delete forever.
import { useState } from "react";
import { Archive, ArchiveRestore, Search, Trash2 } from "lucide-react";
import { deleteTickets, restoreTickets, ticketDeletePhrase } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Product, Ticket } from "@/domain/types";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { useAppState } from "@/features/shell/state";
import { visibleProducts } from "@/domain/permissions";
import { ArchiveBucket } from "@/ui/ArchiveBucket";
import { BulkHead, usePicked } from "@/ui/BulkSelect";
import { ConfirmDialog } from "@/ui/ConfirmDialog";

/** Archived tickets in a project (`product`), or in every live project (company Settings). */
function useArchivedIn(product?: Product): Ticket[] {
  const { archivedTickets, me, db } = useMe();
  const keys = new Set(product ? [product.key] : visibleProducts(me, db.products).map((p) => p.key));
  return archivedTickets.filter((t) => keys.has(t.productKey));
}

/** Settings → Archived: the archived tickets as a bucket that opens into the full list. */
export function ArchivedTicketsBucket({ product }: { product?: Product }) {
  const mine = useArchivedIn(product);
  const latest = mine.reduce<Ticket | undefined>((a, t) => (!a || (t.archivedAt ?? "") > (a.archivedAt ?? "") ? t : a), undefined);
  return (
    <ArchiveBucket icon={Archive} title="Archived tickets" count={mine.length} latest={latest && { name: `${latest.key} ${latest.title}`, at: latest.archivedAt }}>
      {(close) => <ArchivedTickets product={product} bare onOpen={close} />}
    </ArchiveBucket>
  );
}

/** The archived tickets to bring back or delete for good. `bare`: just the list, in a bucket's window (`onOpen` closes it). */
export function ArchivedTickets({ product, bare = false, onOpen }: { product?: Product; bare?: boolean; onOpen?: () => void }) {
  const { personById, productByKey, can, act } = useMe();
  const { openTicket } = useAppState();
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Ticket[] | null>(null);
  const all = [...useArchivedIn(product)].sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")); // most recently archived first
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((t) => `${t.key} ${t.title}`.toLowerCase().includes(q)) : all;
  // Whether you may do it to every one of them (company-wide, they're in several projects).
  const mayAll = (action: "ticket.archive" | "ticket.delete") => (product ? can(action, { product }) : all.every((t) => can(action, { product: productByKey(t.productKey) })));
  const canRestore = mayAll("ticket.archive");
  const canDelete = mayAll("ticket.delete");
  const { selected, pick, clear } = usePicked(shown.map((t) => t.key));
  const picked = shown.filter((t) => selected.includes(t.key));
  const restore = (ts: Ticket[]) => {
    const keys = ts.map((t) => t.key);
    const success = ts.length > 1 ? `${ts.length} tickets are back on the board`
      : ts[0].type === "epic" ? `${keys[0]} and its tickets are back on the board` : `${keys[0]} is back on the board`;
    if (act((d, m) => restoreTickets(d, m, keys), { success, undoable: true })) pick(keys, false);
  };

  return (
    <section className={`${bare ? "" : "card admin-card "}archived-tickets`} aria-label={bare ? "Archived tickets" : undefined} aria-labelledby={bare ? undefined : "archived-title"}>
      <div className="archived-head">
        {!bare && <h2 id="archived-title" className="section-title"><Archive aria-hidden /> Archived <span className="muted">{all.length}</span></h2>}
        {all.length > 0 && (
          <label className="input archived-search">
            <Search aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search archived tickets" aria-label="Search archived tickets" autoFocus={bare} />
          </label>
        )}
      </div>
      <p className="muted">
        Tickets and epics taken off the board stay here, read-only, until they&apos;re restored.
        {canDelete ? " Only admins can delete them for good." : ""}
      </p>
      {all.length === 0 ? (
        <p className="archived-empty">Nothing archived. Archive a ticket from its ⋯ menu, or several at once from the table.</p>
      ) : (
        <>
        {(canRestore || canDelete) && shown.length > 0 && (
          <BulkHead total={shown.length} picked={picked.length} noun="archived tickets" onAll={(on) => pick(shown.map((t) => t.key), on)} onClear={clear}>
            {canRestore && <button type="button" className="btn btn-secondary" onClick={() => restore(picked)}><ArchiveRestore aria-hidden /> Restore</button>}
            {canDelete && <button type="button" className="btn btn-tertiary is-danger" onClick={() => setDeleting(picked)}><Trash2 aria-hidden /> Delete forever</button>}
          </BulkHead>
        )}
        <ul className="archived-list">
          {shown.map((t) => (
            <li key={t.key} className={`archived-row${selected.includes(t.key) ? " is-selected" : ""}`}>
              {(canRestore || canDelete) && (
                <input type="checkbox" className="checkbox" checked={selected.includes(t.key)} aria-label={`Select ${t.key}`}
                  onChange={(e) => pick([t.key], e.target.checked)} />
              )}
              <button type="button" className="archived-open" onClick={() => { onOpen?.(); openTicket(t.key); }} title={`Open ${t.key}`}>
                <TypeIcon type={t.type} /><span className="key">{t.key}</span><span className="archived-title">{t.title}</span>
              </button>
              <span className="archived-meta">
                {shortDate(t.archivedAt)}{personById(t.archivedBy) && ` · ${personById(t.archivedBy)!.name}`}
              </span>
              {canRestore && (
                <button type="button" className="btn btn-secondary" onClick={() => restore([t])} aria-label={`Restore ${t.key}`}>
                  <ArchiveRestore aria-hidden /> Restore
                </button>
              )}
              {canDelete && (
                <button type="button" className="btn btn-tertiary is-danger archived-delete" onClick={() => setDeleting([t])} aria-label={`Delete ${t.key} forever`} title="Delete forever">
                  <Trash2 aria-hidden />
                </button>
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="archived-row archived-empty">No archived ticket matches “{query}”.</li>}
        </ul>
        </>
      )}
      {deleting && <DeleteForever tickets={deleting} onDone={() => pick(deleting.map((t) => t.key), false)} onClose={() => setDeleting(null)} />}
    </section>
  );
}

const LISTED = 5;

function DeleteForever({ tickets, onDone, onClose }: { tickets: Ticket[]; onDone: () => void; onClose: () => void }) {
  const { act } = useMe();
  const [typed, setTyped] = useState("");
  const keys = tickets.map((t) => t.key);
  const one = tickets.length === 1 ? tickets[0] : null;
  const phrase = ticketDeletePhrase(keys);
  const ready = typed.trim() === phrase;
  const remove = () => {
    if (!ready) return;
    onClose();
    if (act((d, m) => deleteTickets(d, m, keys, typed), { success: `${one ? one.key : `${keys.length} tickets`} deleted for good` })) onDone();
  };
  const epics = tickets.some((t) => t.type === "epic");
  return (
    <ConfirmDialog
      title={`Delete ${one ? one.key : `${keys.length} tickets`} for good?`} confirmLabel="Delete forever" confirmDisabled={!ready} onConfirm={remove} onCancel={onClose}
      body={(
        <div className="delete-forever">
          <p>
            This deletes {one ? <strong>{one.key} · {one.title}</strong> : <strong>{keys.slice(0, LISTED).join(", ")}{keys.length > LISTED ? ` and ${keys.length - LISTED} more` : ""}</strong>}
            {" "}with {one ? "its" : "their"} updates, images and history{epics ? " (an epic's tickets stay archived, without an epic)" : ""}. It can&apos;t be undone.
          </p>
          <label className="field">
            <span className="field-label">Type <strong>{phrase}</strong> to confirm</span>
            <span className="input">
              <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={phrase} autoComplete="off" spellCheck={false} />
            </span>
          </label>
        </div>
      )}
    />
  );
}
