"use client";

// Product Settings → Archived: the tickets and epics taken off the board. Anyone who may archive restores in one click;
// only an admin deletes for good — after typing "Delete <key>", which the server checks too.
import { useState } from "react";
import { Archive, ArchiveRestore, Search, Trash2 } from "lucide-react";
import { deleteTickets, restoreTickets, ticketDeletePhrase } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Product, Ticket } from "@/domain/types";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { useAppState } from "@/features/shell/state";
import { ConfirmDialog } from "@/ui/ConfirmDialog";

export function ArchivedTickets({ product }: { product: Product }) {
  const { archivedTickets, personById, can, act } = useMe();
  const { openTicket } = useAppState();
  const [query, setQuery] = useState("");
  const [deleting, setDeleting] = useState<Ticket | null>(null);
  const all = archivedTickets.filter((t) => t.productKey === product.key)
    .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")); // most recently archived first
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((t) => `${t.key} ${t.title}`.toLowerCase().includes(q)) : all;
  const canRestore = can("ticket.archive", { product });
  const canDelete = can("ticket.delete", { product });
  const restore = (t: Ticket) => act((d, m) => restoreTickets(d, m, [t.key]), {
    success: t.type === "epic" ? `${t.key} and its tickets are back on the board` : `${t.key} is back on the board`, undoable: true,
  });

  return (
    <section className="card admin-card archived-tickets" aria-labelledby="archived-title">
      <div className="archived-head">
        <h2 id="archived-title" className="section-title"><Archive aria-hidden /> Archived <span className="muted">{all.length}</span></h2>
        {all.length > 0 && (
          <label className="input archived-search">
            <Search aria-hidden />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search archived tickets" aria-label="Search archived tickets" />
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
        <ul className="archived-list">
          {shown.map((t) => (
            <li key={t.key} className="archived-row">
              <button type="button" className="archived-open" onClick={() => openTicket(t.key)} title={`Open ${t.key}`}>
                <TypeIcon type={t.type} /><span className="key">{t.key}</span><span className="archived-title">{t.title}</span>
              </button>
              <span className="archived-meta">
                {shortDate(t.archivedAt)}{personById(t.archivedBy) && ` · ${personById(t.archivedBy)!.name}`}
              </span>
              {canRestore && (
                <button type="button" className="btn btn-secondary" onClick={() => restore(t)} aria-label={`Restore ${t.key}`}>
                  <ArchiveRestore aria-hidden /> Restore
                </button>
              )}
              {canDelete && (
                <button type="button" className="btn btn-tertiary is-danger archived-delete" onClick={() => setDeleting(t)} aria-label={`Delete ${t.key} forever`} title="Delete forever">
                  <Trash2 aria-hidden />
                </button>
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="archived-row archived-empty">No archived ticket matches “{query}”.</li>}
        </ul>
      )}
      {deleting && <DeleteForever ticket={deleting} onClose={() => setDeleting(null)} />}
    </section>
  );
}

function DeleteForever({ ticket, onClose }: { ticket: Ticket; onClose: () => void }) {
  const { act } = useMe();
  const [typed, setTyped] = useState("");
  const phrase = ticketDeletePhrase([ticket.key]);
  const ready = typed.trim() === phrase;
  const remove = () => {
    if (!ready) return;
    onClose();
    act((d, m) => deleteTickets(d, m, [ticket.key], typed), { success: `${ticket.key} deleted for good` });
  };
  return (
    <ConfirmDialog
      title={`Delete ${ticket.key} for good?`} confirmLabel="Delete forever" confirmDisabled={!ready} onConfirm={remove} onCancel={onClose}
      body={(
        <div className="delete-forever">
          <p>
            This deletes <strong>{ticket.key} · {ticket.title}</strong> with its updates, images and history
            {ticket.type === "epic" ? " (its tickets stay archived, without an epic)" : ""}. It can&apos;t be undone.
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
