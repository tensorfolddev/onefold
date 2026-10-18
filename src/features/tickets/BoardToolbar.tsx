"use client";

import { useState } from "react";
import { ArrowUpDown, ChevronDown, Columns3, Plus, Search, Table2, UserRound, X } from "lucide-react";
import { useAppState } from "@/features/shell/state";
import type { Ticket } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { Avatar, IconButton } from "@/ui/primitives";
import { FilterPopover } from "./FilterPopover";
import type { Filters, SortKey, ViewMode } from "./filters";
import { useDb } from "@/data/StoreProvider";

const VIEWS: { id: ViewMode; label: string; icon: typeof Table2 }[] = [
  { id: "table", label: "Main table", icon: Table2 },
  { id: "kanban", label: "Kanban", icon: Columns3 },
];

const SORTS: { id: SortKey; label: string }[] = [
  { id: "none", label: "Default order" },
  { id: "due", label: "Due date" },
  { id: "priority", label: "Priority" },
  { id: "key", label: "Ticket key" },
];

export interface BoardToolbarProps {
  productKey: string;
  all: Ticket[];
  visibleCount: number;
  view: ViewMode; onView: (v: ViewMode) => void;
  query: string; onQuery: (q: string) => void;
  person: string | null; onPerson: (id: string | null) => void;
  filters: Filters; onFilters: (f: Filters) => void;
  sort: SortKey; onSort: (s: SortKey) => void;
}

export function BoardToolbar(p: BoardToolbarProps) {
  const current = VIEWS.find((v) => v.id === p.view) ?? VIEWS[0];
  const CurrentIcon = current.icon;
  const { can, productByKey } = useDb();
  const canCreate = can("ticket.create", { product: productByKey(p.productKey) });

  return (
    <div className="board-toolbar" role="toolbar" aria-label="Ticket board tools">
      <Popover
        width={240}
        trigger={({ open, toggle }) => (
          <button
            type="button" className={`btn view-switcher${open ? " is-open" : ""}`}
            aria-haspopup="menu" aria-expanded={open} onClick={toggle}
          >
            <CurrentIcon aria-hidden /> {current.label} <ChevronDown aria-hidden />
          </button>
        )}
      >
        {(close) =>
          VIEWS.map((v) => (
            <button
              key={v.id} type="button" role="menuitemradio" aria-checked={v.id === p.view}
              className={`menu-item${v.id === p.view ? " is-selected" : ""}`}
              onClick={() => { p.onView(v.id); close(); }}
            >
              <v.icon aria-hidden /> {v.label}
            </button>
          ))
        }
      </Popover>

      {canCreate && (
        <>
          <span className="toolbar-divider" aria-hidden />

          <Popover
            width={320}
            className="new-ticket-menu"
            trigger={({ open, toggle }) => (
              <button type="button" className="btn btn-primary new-ticket" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
                <Plus aria-hidden /> <span className="toolbar-label">New ticket</span>
              </button>
            )}
          >
            {(close) => <NewTicketForm productKey={p.productKey} onDone={close} />}
          </Popover>
        </>
      )}

      <label className="input board-search">
        <Search aria-hidden />
        <input
          type="text" placeholder="Search" aria-label="Search tickets by key or title"
          value={p.query} onChange={(e) => p.onQuery(e.target.value)}
        />
        {p.query && (
          <IconButton label="Clear search" className="btn btn-tertiary btn-icon search-clear" onClick={() => p.onQuery("")}>
            <X />
          </IconButton>
        )}
      </label>

      <PersonFilter all={p.all} person={p.person} onPerson={p.onPerson} />
      <FilterPopover productKey={p.productKey} all={p.all} visibleCount={p.visibleCount} filters={p.filters} onFilters={p.onFilters} />
      <SortMenu sort={p.sort} onSort={p.onSort} />
    </div>
  );
}

function PersonFilter({ all, person, onPerson }: Pick<BoardToolbarProps, "all" | "person" | "onPerson">) {
  const { personById } = useDb();
  const ids = [...new Set(all.flatMap((t) => t.assigneeIds ?? []))];
  return (
    <Popover
      width={320}
      className="board-popover"
      trigger={({ open, toggle }) => (
        <button
          type="button" className={`btn btn-tertiary${open || person ? " is-open" : ""}`}
          aria-haspopup="dialog" aria-expanded={open} onClick={toggle}
        >
          {person ? <Avatar personId={person} size="sm" /> : <UserRound aria-hidden />}
          <span className="toolbar-label">Person</span>
        </button>
      )}
    >
      {() => (
        <>
          <div className="popover-head">
            <span className="popover-title">Filter this board by person</span>
            <span className="spacer" />
            <button type="button" className="btn btn-tertiary" disabled={!person} onClick={() => onPerson(null)}>Clear</button>
          </div>
          <div className="person-row">
            {ids.map((id) => (
              <button
                key={id} type="button" aria-pressed={id === person}
                className={`person-toggle${id === person ? " is-selected" : ""}`}
                aria-label={`Show only ${personById(id)?.name ?? id}'s tickets`}
                onClick={() => onPerson(id === person ? null : id)}
              >
                <Avatar personId={id} />
              </button>
            ))}
          </div>
        </>
      )}
    </Popover>
  );
}

function SortMenu({ sort, onSort }: Pick<BoardToolbarProps, "sort" | "onSort">) {
  const active = SORTS.find((s) => s.id === sort);
  return (
    <Popover
      width={220}
      trigger={({ open, toggle }) => (
        <button
          type="button" className={`btn btn-tertiary${open || sort !== "none" ? " is-open" : ""}`}
          aria-haspopup="menu" aria-expanded={open} onClick={toggle}
        >
          <ArrowUpDown aria-hidden />
          <span className="toolbar-label">{sort === "none" ? "Sort" : `Sort: ${active?.label}`}</span>
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-section-label">Sort by (ascending)</div>
          {SORTS.map((s) => (
            <button
              key={s.id} type="button" role="menuitemradio" aria-checked={s.id === sort}
              className={`menu-item${s.id === sort ? " is-selected" : ""}`}
              onClick={() => { onSort(s.id); close(); }}
            >
              {s.label}
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}

/** Title-only create; everything else is edited on the ticket afterwards. */
function NewTicketForm({ productKey, onDone }: { productKey: string; onDone: () => void }) {
  const { addTicket, openTicket } = useAppState();
  const [title, setTitle] = useState("");
  const trimmed = title.trim();

  return (
    <form
      className="new-ticket-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!trimmed) return;
        const key = addTicket(productKey, trimmed);
        if (!key) return;
        openTicket(key);
        onDone();
      }}
    >
      <label className="input">
        <input
          autoFocus type="text" placeholder="Ticket title" aria-label="New ticket title" maxLength={200}
          value={title} onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!trimmed}>Create</button>
    </form>
  );
}
