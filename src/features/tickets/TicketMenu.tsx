"use client";

// Right-click a ticket (a board card or a table row): open it, copy its link, put it under one of its product's epics
// (searchable, and the list scrolls — however many epics there are, the menu stays inside the window), or archive it
// (Undo in the toast; an admin deletes for good from Settings → Archived). Lists without the provider get no menu —
// the browser's stays.
import { Archive, Check, ChevronLeft, ChevronRight, ExternalLink, Layers, Link2, X } from "lucide-react";
import { createContext, useCallback, useContext, useState } from "react";
import { archiveTickets, updateTicket } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import { epicLabel, epicsOf } from "@/domain/selectors/epics";
import type { Ticket } from "@/domain/types";
import { useAppState } from "@/features/shell/state";
import { ContextMenu } from "@/ui/ContextMenu";

type Open = (e: React.MouseEvent, ticketKey: string) => void;
const MenuContext = createContext<Open | null>(null);

/** The handler to put on a ticket's onContextMenu, or undefined outside a ticket list that offers the menu. */
export const useTicketMenu = () => useContext(MenuContext) ?? undefined;

export function TicketMenuProvider({ children }: { children: React.ReactNode }) {
  const [at, setAt] = useState<{ ticketKey: string; x: number; y: number } | null>(null);
  const open = useCallback<Open>((e, ticketKey) => {
    e.preventDefault();
    setAt({ ticketKey, x: e.clientX, y: e.clientY });
  }, []);
  const close = useCallback(() => setAt(null), []);
  return (
    <MenuContext.Provider value={open}>
      {children}
      {at && <TicketMenu key={`${at.ticketKey}@${at.x},${at.y}`} {...at} onClose={close} />}
    </MenuContext.Provider>
  );
}

function TicketMenu({ ticketKey, x, y, onClose }: { ticketKey: string; x: number; y: number; onClose: () => void }) {
  const { db, act, can, href, productByKey, toast } = useDb();
  const { openTicket } = useAppState();
  const [picking, setPicking] = useState(false);
  const ticket = db.tickets.find((t) => t.key === ticketKey);
  if (!ticket) return null;
  const product = productByKey(ticket.productKey);
  const canArchive = !ticket.archivedAt && can("ticket.archive", { product });
  const canEpic = ticket.type !== "epic" && !ticket.archivedAt && can("ticket.edit", { product });
  const run = (fn: () => void) => () => { onClose(); fn(); };
  const archive = () => {
    const what = ticket.type === "epic" ? `${ticket.key} and its tickets archived` : `${ticket.key} archived`;
    act((d, m) => archiveTickets(d, m, [ticket.key]), { success: `${what} — they're in Settings → Archived`, undoable: true });
  };
  const copy = async () => {
    await navigator.clipboard.writeText(`${location.origin}${href(`/t/${ticket.key}`)}`).catch(() => {});
    toast("Link copied", undefined, "success");
  };

  return (
    <ContextMenu x={x} y={y} label={`${ticket.key} actions`} width={picking ? 320 : 256} className="ticket-menu" onClose={onClose}>
      {picking ? <EpicPicker ticket={ticket} onBack={() => setPicking(false)} onDone={onClose} /> : (
        <>
          <button type="button" role="menuitem" className="menu-item" onClick={run(() => openTicket(ticket.key))}><ExternalLink aria-hidden /> Open {ticket.key}</button>
          <button type="button" role="menuitem" className="menu-item" onClick={run(copy)}><Link2 aria-hidden /> Copy link</button>
          {canEpic && (
            <button type="button" role="menuitem" aria-haspopup="menu" className="menu-item" onClick={() => setPicking(true)}>
              <Layers aria-hidden /> {ticket.epicKey ? "Move to another epic" : "Add to epic"} <ChevronRight aria-hidden className="menu-item-end" />
            </button>
          )}
          {canArchive && (
            <>
              <hr className="menu-sep" />
              <button type="button" role="menuitem" className="menu-item" onClick={run(archive)}>
                <Archive aria-hidden /> {ticket.type === "epic" ? "Archive epic and its tickets" : "Archive ticket"}
              </button>
            </>
          )}
        </>
      )}
    </ContextMenu>
  );
}

/** The product's epics to put the ticket under: search them; the list scrolls. */
function EpicPicker({ ticket, onBack, onDone }: { ticket: Ticket; onBack: () => void; onDone: () => void }) {
  const { db, act } = useDb();
  const [query, setQuery] = useState("");
  const epics = epicsOf(db, ticket.productKey);
  const needle = query.trim().toLowerCase();
  const shown = needle ? epics.filter((e) => `${epicLabel(db, e)} ${e.key} ${e.title}`.toLowerCase().includes(needle)) : epics;
  const put = (epicKey: string | null) => {
    onDone();
    if (epicKey === (ticket.epicKey ?? null)) return;
    const epic = epics.find((e) => e.key === epicKey);
    act((d, m) => updateTicket(d, m, ticket.key, { epicKey }), {
      success: epic ? `${ticket.key} is in ${epic.key} ${epic.title}` : `${ticket.key} is out of its epic`, undoable: true,
    });
  };
  return (
    <div className="epic-picker">
      <div className="epic-picker-head">
        <button type="button" className="btn btn-tertiary btn-icon" aria-label="Back" onClick={onBack}><ChevronLeft aria-hidden /></button>
        <span>Put {ticket.key} in an epic</span>
      </div>
      {epics.length > 0 && (
        <label className="input tpl-picker-search">
          <input autoFocus placeholder="Search epics" aria-label="Search epics" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      )}
      <div className="tpl-picker-list" role="group" aria-label="Epics">
        {shown.map((e) => {
          const current = ticket.epicKey === e.key;
          return (
            <button key={e.key} type="button" role="menuitemradio" aria-checked={current} className="menu-item tpl-picker-item" onClick={() => put(e.key)}>
              <span className="epic-picker-dot" style={{ background: e.color ?? "var(--color-purple)" }} aria-hidden />
              <span className="key">{epicLabel(db, e)}</span><span className="tpl-ref-title">{e.title}</span>
              {current && <Check aria-hidden className="menu-item-end" />}
            </button>
          );
        })}
        {!shown.length && <p className="tpl-picker-empty">{epics.length ? `No epic matches “${query.trim()}”` : "This product has no epics yet"}</p>}
      </div>
      {ticket.epicKey && (
        <>
          <hr className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => put(null)}><X aria-hidden /> Remove from its epic</button>
        </>
      )}
    </div>
  );
}
