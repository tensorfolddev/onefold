"use client";

import { useMemo, useState } from "react";
import { Inbox, SearchX } from "lucide-react";
import { useAppState } from "@/features/shell/state";
import { EmptyState } from "@/ui/primitives";
import { BoardToolbar } from "./BoardToolbar";
import { KanbanBoard } from "./KanbanBoard";
import { TicketGrid } from "./TicketGrid";
import { EMPTY_FILTERS, filterTickets, type Filters, type SortKey, type ViewMode } from "./filters";

/** Client wrapper: owns view / search / person / quick-filter / sort state for one product's tickets. */
export function TicketBoard({ productKey }: { productKey: string }) {
  const { tickets } = useAppState();
  const [view, setView] = useState<ViewMode>("table");
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("none");

  const all = useMemo(() => tickets.filter((t) => t.productKey === productKey), [tickets, productKey]);
  const visible = useMemo(
    () => filterTickets(all, { query, person, filters, sort }),
    [all, query, person, filters, sort],
  );

  const clearAll = () => {
    setQuery("");
    setPerson(null);
    setFilters(EMPTY_FILTERS);
  };

  let body: React.ReactNode;
  if (all.length === 0) {
    body = (
      <EmptyState icon={<Inbox aria-hidden />} title="No tickets yet">
        Tickets for this product will show up here once the plan is broken down.
      </EmptyState>
    );
  } else if (visible.length === 0) {
    body = (
      <EmptyState icon={<SearchX aria-hidden />} title="No tickets match">
        <p>Nothing in this product matches the current search and filters.</p>
        <button type="button" className="btn btn-secondary" onClick={clearAll}>Clear search &amp; filters</button>
      </EmptyState>
    );
  } else {
    body = view === "table" ? <TicketGrid tickets={visible} /> : <KanbanBoard productKey={productKey} tickets={visible} />;
  }

  return (
    <div className="ticket-board">
      <BoardToolbar
        productKey={productKey}
        all={all}
        visibleCount={visible.length}
        view={view} onView={setView}
        query={query} onQuery={setQuery}
        person={person} onPerson={setPerson}
        filters={filters} onFilters={setFilters}
        sort={sort} onSort={setSort}
      />
      {body}
    </div>
  );
}
