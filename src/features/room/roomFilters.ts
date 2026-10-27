// The Client tab's toolbar, as data — the tickets board's, for chats: search, one person, quick filters (OR within a
// column, AND across) and a sort. The table and the kanban show what it lets through.
import { prioritiesOf } from "../../domain/selectors/clientLook.ts";
import { needsMe, whoseMove, type RoomModel, type RoomThread } from "../../domain/selectors/room.ts";

export type RoomView = "table" | "board";
export type RoomSort = "none" | "recent" | "priority" | "due" | "key";
export type FilterCol = "status" | "priority" | "type" | "waiting" | "show";
export type RoomFilters = Record<FilterCol, string[]>;

export const NO_FILTERS: RoomFilters = { status: [], priority: [], type: [], waiting: [], show: [] };
export const FILTER_COLS = Object.keys(NO_FILTERS) as FilterCol[];

export interface RoomQuery { query: string; person: string | null; filters: RoomFilters; sort: RoomSort }
export const NO_QUERY: RoomQuery = { query: "", person: null, filters: NO_FILTERS, sort: "none" };
export const isFiltered = (q: RoomQuery) => !!q.query.trim() || !!q.person || FILTER_COLS.some((c) => q.filters[c].length > 0);

type Unread = (t: RoomThread) => number;

/** What a chat counts as in a filter column ("none" = it has nothing there). */
export function valuesOf(room: RoomModel, t: RoomThread, col: FilterCol, unread: Unread): string[] {
  switch (col) {
    case "status": return [t.requirement?.status ?? t.ask?.state ?? "none"];
    case "priority": return [t.requirement?.priority ?? "none"];
    case "type": return [t.ask?.kind ?? "none"];
    case "waiting": return [whoseMove(room, t)?.side ?? "none"];
    case "show": return [...(needsMe(room, t) ? ["needs"] : []), ...(unread(t) ? ["unread"] : [])];
  }
}

/** Everyone in a chat: whoever wrote in it (or moved it along), and who a request is for. */
export const peopleOf = (t: RoomThread): string[] =>
  [...new Set([...t.messages.map((m) => m.authorId), ...(t.ask?.assigneeId ? [t.ask.assigneeId] : [])])];

const keyNum = (key: string) => Number(key.replace(/\D/g, "")) || 0;
const lastAt = (t: RoomThread) => t.messages.at(-1)?.at ?? "";
const compare = (room: RoomModel): Record<Exclude<RoomSort, "none">, (a: RoomThread, b: RoomThread) => number> => {
  const ids = prioritiesOf(room.look).map((p) => p.id); // the company's order: its first priority first
  const rank = (t: RoomThread) => { const i = ids.indexOf(t.requirement?.priority ?? ""); return i < 0 ? ids.length : i; };
  return {
    recent: (a, b) => lastAt(b).localeCompare(lastAt(a)), // the latest message first
    priority: (a, b) => rank(a) - rank(b),
    due: (a, b) => (a.ask?.due ?? "9999").localeCompare(b.ask?.due ?? "9999"), // no due date last
    key: (a, b) => keyNum(a.key) - keyNum(b.key),
  };
};

export function filterThreads(room: RoomModel, threads: RoomThread[], { query, person, filters, sort }: RoomQuery, unread: Unread): RoomThread[] {
  const q = query.trim().toLowerCase();
  const list = threads.filter((t) =>
    (!q || `${t.key} ${t.title} ${t.messages.map((m) => m.body).join(" ")}`.toLowerCase().includes(q))
    && (!person || peopleOf(t).includes(person))
    && FILTER_COLS.every((c) => !filters[c].length || valuesOf(room, t, c, unread).some((v) => filters[c].includes(v))));
  return sort === "none" ? list : [...list].sort(compare(room)[sort]);
}
