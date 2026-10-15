"use client";

import { Filter } from "lucide-react";
import type { Lookups } from "@/data/db";
import { toneVar } from "@/domain/status";
import type { Ticket } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { Avatar } from "@/ui/primitives";
import { EMPTY_FILTERS, FILTER_COLS, fieldOf, type FilterCol, type Filters } from "./filters";
import { PRIORITY_LABEL, TYPE_LABEL, TypeIcon } from "./TicketBits";
import { useDb } from "@/data/StoreProvider";

interface Option { value: string; label: string; icon: React.ReactNode }

function optionsFor(col: FilterCol, productKey: string, all: Ticket[], { personById, statusesFor }: Lookups): Option[] {
  switch (col) {
    case "status":
      return statusesFor(productKey).map((s) => ({
        value: s.id, label: s.name,
        icon: <span className="chip-dot" style={{ background: toneVar(s.tone) }} aria-hidden />,
      }));
    case "assignee":
      return [...new Set(all.map((t) => fieldOf(t, "assignee")))].map((id) => ({
        value: id, label: personById(id)?.name ?? "Unassigned",
        icon: <Avatar personId={id === "none" ? undefined : id} size="sm" />,
      }));
    case "type":
      return (Object.keys(TYPE_LABEL) as Ticket["type"][]).map((t) => ({ value: t, label: TYPE_LABEL[t], icon: <TypeIcon type={t} /> }));
    case "priority":
      return (Object.keys(PRIORITY_LABEL) as Ticket["priority"][]).map((pr) => ({
        value: pr, label: PRIORITY_LABEL[pr], icon: <span className="chip-dot priority-dot" data-priority={pr} aria-hidden />,
      }));
  }
}

const COL_TITLE: Record<FilterCol, string> = { status: "Status", assignee: "Assignee", type: "Type", priority: "Priority" };

/** monday "Quick filters": one chip column per field; OR within a column, AND across columns. */
export function FilterPopover({
  productKey, all, visibleCount, filters, onFilters,
}: {
  productKey: string; all: Ticket[]; visibleCount: number; filters: Filters; onFilters: (f: Filters) => void;
}) {
  const lookups = useDb();
  const count = FILTER_COLS.reduce((n, c) => n + filters[c].length, 0);
  const toggle = (col: FilterCol, v: string) =>
    onFilters({ ...filters, [col]: filters[col].includes(v) ? filters[col].filter((x) => x !== v) : [...filters[col], v] });

  return (
    <Popover
      width={640}
      align="right"
      className="board-popover filter-menu"
      trigger={({ open, toggle: t }) => (
        <button
          type="button" className={`btn btn-tertiary${open || count ? " is-open" : ""}`}
          aria-haspopup="dialog" aria-expanded={open} onClick={t}
        >
          <Filter aria-hidden />
          <span className="toolbar-label">Filter{count ? ` / ${count}` : ""}</span>
        </button>
      )}
    >
      {() => (
        <>
          <div className="popover-head">
            <span className="popover-title">Quick filters</span>
            <span className="muted">Showing {visibleCount} of {all.length} tickets</span>
            <span className="spacer" />
            <button type="button" className="btn btn-tertiary" disabled={!count} onClick={() => onFilters(EMPTY_FILTERS)}>
              Clear all
            </button>
          </div>
          <h3 className="filter-subtitle">All columns</h3>
          <div className="filter-cols">
            {FILTER_COLS.map((col) => (
              <div key={col} className="filter-col" role="group" aria-labelledby={`filter-${col}`}>
                <h4 id={`filter-${col}`}>{COL_TITLE[col]}</h4>
                <ul>
                  {optionsFor(col, productKey, all, lookups).map((o) => {
                    const on = filters[col].includes(o.value);
                    const n = all.filter((t) => fieldOf(t, col) === o.value).length;
                    return (
                      <li key={o.value}>
                        <button
                          type="button" aria-pressed={on} className={`chip${on ? " is-selected" : ""}`}
                          onClick={() => toggle(col, o.value)}
                        >
                          {o.icon}
                          <span className="chip-label">{o.label}</span>
                          <span className="chip-count">{n || "-"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </Popover>
  );
}
