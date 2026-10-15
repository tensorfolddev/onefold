"use client";

import { useAppState } from "@/features/shell/state";
import { toneVar } from "@/domain/status";
import type { Ticket } from "@/domain/types";
import { Popover } from "./Popover";
import { useDb } from "@/data/StoreProvider";
import { EPIC_COLORS } from "@/data/db";

/** Epics have no status: the cell shows the epic's colour, and clicking it picks another colour. */
function EpicColorCell({ ticket, editable }: { ticket: Ticket; editable: boolean }) {
  const { updateTicket } = useAppState();
  const style = { background: ticket.color ?? EPIC_COLORS[0] };
  if (!editable) return <span className="status-cell is-readonly epic-cell" style={style}>Epic</span>;
  return (
    <Popover
      className="status-menu" anchorClassName="fill" width={236}
      trigger={({ toggle }) => (
        <button type="button" className="status-cell epic-cell" style={style} onClick={toggle} aria-label="Epic colour. Change colour">
          Epic
        </button>
      )}
    >
      {(close) => (
        <div className="epic-colors" role="radiogroup" aria-label="Epic colour">
          {EPIC_COLORS.map((c) => (
            <button
              key={c} type="button" role="radio" aria-checked={ticket.color === c} aria-label={c.replace(/var\(--color-|\)/g, "").replace(/[-_]/g, " ")}
              className="epic-color" style={{ background: c }}
              onClick={() => { updateTicket(ticket.key, { color: c }); close(); }}
            />
          ))}
        </div>
      )}
    </Popover>
  );
}

/** Full-bleed status fill; click opens the product's own status list (in-memory update). */
export function StatusCell({ ticket }: { ticket: Ticket }) {
  const { updateTicket } = useAppState();
  const { statusById, statusesFor, can, productByKey } = useDb();
  if (ticket.type === "epic") {
    const p = productByKey(ticket.productKey);
    return <EpicColorCell ticket={ticket} editable={!!p && can("ticket.edit", { product: p })} />;
  }
  const status = statusById(ticket.statusId);
  if (!status) return null;
  const product = productByKey(ticket.productKey);
  if (!product || !can("ticket.edit", { product })) {
    return <span className="status-cell is-readonly" data-tone={status.tone}>{status.name}</span>;
  }

  return (
    <Popover
      className="status-menu"
      anchorClassName="fill"
      width={200}
      trigger={({ toggle }) => (
        <button
          type="button"
          className="status-cell"
          data-tone={status.tone}
          onClick={toggle}
          aria-label={`Status: ${status.name}. Change status`}
        >
          {status.name}
        </button>
      )}
    >
      {(close) =>
        statusesFor(ticket.productKey).filter((s) => s.system !== "epic").map((s) => (
          <button
            key={s.id}
            type="button"
            role="menuitemradio"
            aria-checked={s.id === ticket.statusId}
            className="menu-item"
            style={{ background: toneVar(s.tone) }}
            onClick={() => {
              updateTicket(ticket.key, { statusId: s.id });
              close();
            }}
          >
            {s.name}
          </button>
        ))
      }
    </Popover>
  );
}
