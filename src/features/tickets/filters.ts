import type { Ticket } from "@/domain/types";
import { PRIORITY_RANK } from "./TicketBits";

export type ViewMode = "table" | "kanban";
export type SortKey = "none" | "due" | "priority" | "key";
export type FilterCol = "status" | "assignee" | "type" | "priority";
export type Filters = Record<FilterCol, string[]>;

export const EMPTY_FILTERS: Filters = { status: [], assignee: [], type: [], priority: [] };
export const FILTER_COLS = Object.keys(EMPTY_FILTERS) as FilterCol[];

/** The value a ticket contributes to a quick-filter column ("none" = unassigned). */
export const fieldOf = (t: Ticket, col: FilterCol): string =>
  col === "status" ? t.statusId : col === "assignee" ? t.assigneeId ?? "none" : t[col];

const keyNum = (key: string) => Number(key.split("-")[1]);
const COMPARE: Record<Exclude<SortKey, "none">, (a: Ticket, b: Ticket) => number> = {
  due: (a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"), // no due date sorts last
  priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  key: (a, b) => keyNum(a.key) - keyNum(b.key),
};

export interface BoardQuery {
  query: string;
  person: string | null;
  filters: Filters;
  sort: SortKey;
}

/** Search (key/title) + person + quick filters (AND across columns, OR within one) + sort. */
export function filterTickets(tickets: Ticket[], { query, person, filters, sort }: BoardQuery): Ticket[] {
  const q = query.trim().toLowerCase();
  const list = tickets.filter(
    (t) =>
      (!q || t.key.toLowerCase().includes(q) || t.title.toLowerCase().includes(q)) &&
      (!person || t.assigneeId === person) &&
      FILTER_COLS.every((c) => filters[c].length === 0 || filters[c].includes(fieldOf(t, c))),
  );
  return sort === "none" ? list : [...list].sort(COMPARE[sort]);
}
