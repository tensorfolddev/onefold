"use client";

import { Filter, Layers } from "lucide-react";
import type { Db, Lookups } from "@/data/db";
import { toneVar } from "@/domain/status";
import type { Ticket } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { Avatar } from "@/ui/primitives";
import { EMPTY_FILTERS, FILTER_COLS, valuesOf, type FilterCol, type Filters } from "./filters";
import { PRIORITY_LABEL, priorityLook, TYPE_LABEL, TypeIcon } from "./TicketBits";
import { useDb } from "@/data/StoreProvider";
import { epicLabel, epicsOf } from "@/domain/selectors/epics";

interface Option { value: string; label: string; icon: React.ReactNode }

function optionsFor(col: FilterCol, productKey: string, all: Ticket[], { db, personById, statusesFor }: Lookups & { db: Db }): Option[] {
  switch (col) {
    case "status":
      return statusesFor(productKey).map((s) => ({
        value: s.id, label: s.name,
        icon: <span className="chip-dot" style={{ background: toneVar(s.tone) }} aria-hidden />,
      }));
    case "assignee":
      return [...new Set(all.flatMap((t) => valuesOf(t, "assignee")))].map((id) => ({
        value: id, label: personById(id)?.name ?? "Unassigned",
        icon: <Avatar personId={id === "none" ? undefined : id} size="sm" />,
      }));
    case "type":
      return (Object.keys(TYPE_LABEL) as Ticket["type"][]).map((t) => ({ value: t, label: TYPE_LABEL[t], icon: <TypeIcon type={t} /> }));
    case "priority":
      return (Object.keys(PRIORITY_LABEL) as Ticket["priority"][]).map((pr) => {
        const look = priorityLook(db.products.find((p) => p.key === productKey), pr);
        return { value: pr, label: look.label, icon: <span className="chip-dot priority-dot" data-priority={pr} style={look.style} aria-hidden /> };
      });
    case "epic":
      return [
        ...epicsOf(db, productKey).map((e) => ({
          value: e.key, label: `${epicLabel(db, e)} · ${e.title}`,
          icon: <Layers className="epic-filter-icon" style={{ color: e.color }} aria-hidden />,
        })),
        { value: "none", label: "No epic", icon: <Layers className="epic-filter-icon" aria-hidden /> },
      ];
  }
}

const COL_TITLE: Record<FilterCol, string> = { status: "Status", assignee: "Assignee", type: "Type", priority: "Priority", epic: "Epic" };

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
                    const n = all.filter((t) => valuesOf(t, col).includes(o.value)).length;
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
