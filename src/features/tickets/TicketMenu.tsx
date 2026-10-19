"use client";

// Right-click a ticket (a board card or a table row): open it, copy its link, or archive it (Undo in the toast; an
// admin deletes for good from Settings → Archived). Lists without the provider get no menu — the browser's stays.
import { Archive, ExternalLink, Link2 } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { archiveTickets } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import { useAppState } from "@/features/shell/state";

type Open = (e: React.MouseEvent, ticketKey: string) => void;
const MenuContext = createContext<Open | null>(null);
const MENU_W = 220;
const MENU_H = 140;

/** The handler to put on a ticket's onContextMenu, or undefined outside a ticket list that offers the menu. */
export const useTicketMenu = () => useContext(MenuContext) ?? undefined;

export function TicketMenuProvider({ children }: { children: React.ReactNode }) {
  const [at, setAt] = useState<{ ticketKey: string; x: number; y: number } | null>(null);
  const open = useCallback<Open>((e, ticketKey) => {
    e.preventDefault();
    setAt({ ticketKey, x: Math.min(e.clientX, innerWidth - MENU_W - 8), y: Math.min(e.clientY, innerHeight - MENU_H - 8) });
  }, []);
  const close = useCallback(() => setAt(null), []);
  return (
    <MenuContext.Provider value={open}>
      {children}
      {at && createPortal(<TicketMenu {...at} onClose={close} />, document.body)}
    </MenuContext.Provider>
  );
}

function TicketMenu({ ticketKey, x, y, onClose }: { ticketKey: string; x: number; y: number; onClose: () => void }) {
  const { db, act, can, href, productByKey, toast } = useDb();
  const { openTicket } = useAppState();
  const ref = useRef<HTMLDivElement>(null);
  const ticket = db.tickets.find((t) => t.key === ticketKey);
  const canArchive = !!ticket && !ticket.archivedAt && can("ticket.archive", { product: productByKey(ticket.productKey) });

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    // Closes when you scroll (wheel or touch), not on scrolls the page makes itself — e.g. bringing the row into view.
    addEventListener("wheel", onClose, { passive: true });
    addEventListener("touchmove", onClose, { passive: true });
    addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
      removeEventListener("wheel", onClose);
      removeEventListener("touchmove", onClose);
      removeEventListener("resize", onClose);
    };
  }, [onClose]);

  if (!ticket) return null;
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
    <div ref={ref} className="menu ticket-menu" role="menu" aria-label={`${ticket.key} actions`} style={{ position: "fixed", left: x, top: y, width: MENU_W, zIndex: 200 }}>
      <button type="button" role="menuitem" className="menu-item" onClick={run(() => openTicket(ticket.key))}><ExternalLink aria-hidden /> Open {ticket.key}</button>
      <button type="button" role="menuitem" className="menu-item" onClick={run(copy)}><Link2 aria-hidden /> Copy link</button>
      {canArchive && (
        <>
          <hr className="menu-sep" />
          <button type="button" role="menuitem" className="menu-item" onClick={run(archive)}>
            <Archive aria-hidden /> {ticket.type === "epic" ? "Archive epic and its tickets" : "Archive ticket"}
          </button>
        </>
      )}
    </div>
  );
}
