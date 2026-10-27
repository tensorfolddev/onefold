"use client";

// The Client tab's toolbar — the tickets board's (monday's): the view, New, Search, Person, Filter, Sort — and on the
// right, which section: the project's chat, its requirements or its requests. Its own copy
// because the tickets one reads the team's tickets; this one reads the room, the same for the team and the client.
import { ArrowUpDown, BookOpen, ChevronDown, ClipboardCheck, Columns3, Filter, Inbox, MessagesSquare, Plus, Search, Table2, UserPlus, UserRound, X } from "lucide-react";
import { askPhase, ASK_STATES, prioritiesOf, reqPhase, REQUIREMENT_STATUSES } from "@/domain/selectors/clientLook";
import type { RoomModel, RoomThread } from "@/domain/selectors/room";
import { Popover } from "@/ui/Popover";
import { IconButton } from "@/ui/primitives";
import { NO_FILTERS, peopleOf, valuesOf, type FilterCol, type RoomFilters, type RoomQuery, type RoomSort, type RoomView } from "./roomFilters";
import { KIND, KindIcon, RoomAvatar } from "./roomUi";

const VIEWS: { id: RoomView; label: string; icon: typeof Table2 }[] = [
  { id: "table", label: "Main table", icon: Table2 },
  { id: "board", label: "Kanban", icon: Columns3 },
];
const SORTS: Record<"req" | "ask", { id: RoomSort; label: string }[]> = {
  req: [{ id: "none", label: "Default order" }, { id: "recent", label: "Latest message" }, { id: "priority", label: "Priority" }, { id: "key", label: "Key" }],
  ask: [{ id: "none", label: "Default order" }, { id: "recent", label: "Latest message" }, { id: "due", label: "Due date" }, { id: "key", label: "Key" }],
};
export const sortsFor = (kind: "req" | "ask") => SORTS[kind];

interface Option { value: string; label: string; icon: React.ReactNode }
const dot = (color: string) => <span className="chip-dot" style={{ background: color }} aria-hidden />;

function columnsFor(room: RoomModel, kind: "req" | "ask"): { col: FilterCol; title: string; options: Option[] }[] {
  const team = room.side === "team";
  const status = kind === "req"
    ? REQUIREMENT_STATUSES.filter((s) => team || s !== "draft").map((s) => { const p = reqPhase(room.look, s, room.side); return { value: s, label: p.label, icon: dot(p.color) }; })
    : ASK_STATES.map((s) => { const p = askPhase(room.look, s, room.side); return { value: s, label: p.label, icon: dot(p.color) }; });
  const other = room.project.client || "the client";
  return [
    { col: "status", title: "Status", options: status },
    kind === "req"
      ? { col: "priority", title: "Priority", options: [...prioritiesOf(room.look).map((p) => ({ value: p.id, label: p.name, icon: dot(p.color) })), { value: "none", label: "No priority", icon: dot("var(--ui-border-color)") }] }
      : { col: "type", title: "Type", options: (["access", "file", "question", "other"] as const).map((k) => ({ value: k, label: KIND[k].label, icon: <KindIcon kind={k} size={14} /> })) },
    { col: "waiting", title: "Waiting for", options: [
      { value: "client", label: team ? other : "You", icon: dot("#fdab3d") },
      { value: "team", label: team ? "You" : room.companyName, icon: dot("var(--primary-color)") },
    ] },
    { col: "show", title: "Show", options: [{ value: "needs", label: "Needs you", icon: dot("#00c875") }, { value: "unread", label: "Unread", icon: dot("var(--primary-color)") }] },
  ];
}

export type RoomSection = "chat" | "req" | "ask";
const SECTIONS: { id: RoomSection; label: string; icon: typeof Table2 }[] = [
  { id: "chat", label: "Chat", icon: MessagesSquare },
  { id: "req", label: "Requirements", icon: ClipboardCheck },
  { id: "ask", label: "Requests", icon: Inbox },
];

/** The three sections, as monday's view tabs: a segmented switch; the chat shows what's new in it. */
type Counts = Record<RoomSection, number>;
function Sections({ section, onSection, counts }: { section: RoomSection; onSection: (s: RoomSection) => void; counts: Counts }) {
  return (
    <div className="room-sections" role="tablist" aria-label="Show">
      {SECTIONS.map((s) => (
        <button key={s.id} type="button" role="tab" aria-selected={s.id === section} aria-label={s.label} onClick={() => onSection(s.id)}>
          <s.icon aria-hidden /><span className="toolbar-label">{s.label}</span>
          {counts[s.id] > 0 && <b aria-label={s.id === "chat" ? `${counts.chat} new` : `${counts[s.id]} with new messages`}>{counts[s.id]}</b>}
        </button>
      ))}
    </div>
  );
}

export function RoomToolbar({ room, section, onSection, counts, onInvite, onGuide, kind, all, shown, view, onView, q, onQ, unread, add, addLabel }: {
  room: RoomModel; section: RoomSection; onSection: (s: RoomSection) => void; counts: Counts; onInvite?: () => void; onGuide?: () => void;
  kind: "req" | "ask"; all: RoomThread[]; shown: number; view: RoomView; onView: (v: RoomView) => void;
  q: RoomQuery; onQ: (q: RoomQuery) => void; unread: (t: RoomThread) => number; add?: () => void; addLabel: string;
}) {
  const current = VIEWS.find((v) => v.id === view)!;
  const sections = <Sections section={section} onSection={onSection} counts={counts} />;
  if (section === "chat") {
    return (
      <div className="board-toolbar room-toolbar" role="toolbar" aria-label="Chat tools">
        {onInvite && <button type="button" className="btn btn-secondary" onClick={onInvite}><UserPlus aria-hidden /> <span className="toolbar-label">Invite</span></button>}
        {onGuide && <button type="button" className="btn btn-tertiary" onClick={onGuide}><BookOpen aria-hidden /> <span className="toolbar-label">Guide</span></button>}
        {sections}
      </div>
    );
  }
  return (
    <div className="board-toolbar room-toolbar" role="toolbar" aria-label="Requirement and request tools">
      <Popover
        floating // the room clips what overflows it
        width={240}
        trigger={({ open, toggle }) => (
          <button type="button" className={`btn view-switcher${open ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
            <current.icon aria-hidden /> {current.label} <ChevronDown aria-hidden />
          </button>
        )}
      >
        {(close) => VIEWS.map((v) => (
          <button key={v.id} type="button" role="menuitemradio" aria-checked={v.id === view} className={`menu-item${v.id === view ? " is-selected" : ""}`}
            onClick={() => { onView(v.id); close(); }}>
            <v.icon aria-hidden /> {v.label}
          </button>
        ))}
      </Popover>
      {add && (
        <>
          <span className="toolbar-divider" aria-hidden />
          <button type="button" className="btn btn-primary" onClick={add}><Plus aria-hidden /> <span className="toolbar-label">{addLabel}</span></button>
        </>
      )}
      <label className="input board-search">
        <Search aria-hidden />
        <input type="text" placeholder="Search" aria-label="Search requirements, requests and messages" value={q.query} onChange={(e) => onQ({ ...q, query: e.target.value })} />
        {q.query && <IconButton label="Clear search" className="btn btn-tertiary btn-icon search-clear" onClick={() => onQ({ ...q, query: "" })}><X /></IconButton>}
      </label>
      <PersonMenu room={room} all={all} person={q.person} onPerson={(person) => onQ({ ...q, person })} />
      <FilterMenu room={room} kind={kind} all={all} shown={shown} filters={q.filters} onFilters={(filters) => onQ({ ...q, filters })} unread={unread} />
      <SortMenu kind={kind} sort={q.sort} onSort={(sort) => onQ({ ...q, sort })} />
      {sections}
    </div>
  );
}

function PersonMenu({ room, all, person, onPerson }: { room: RoomModel; all: RoomThread[]; person: string | null; onPerson: (id: string | null) => void }) {
  const ids = [...new Set(all.flatMap(peopleOf))].filter((id) => room.people[id]);
  return (
    <Popover
        floating // the room clips what overflows it
      width={320}
      className="board-popover"
      trigger={({ open, toggle }) => (
        <button type="button" className={`btn btn-tertiary${open || person ? " is-open" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
          {person ? <RoomAvatar person={room.people[person]} side={room.side} size={22} /> : <UserRound aria-hidden />}
          <span className="toolbar-label">Person</span>
        </button>
      )}
    >
      {() => (
        <>
          <div className="popover-head">
            <span className="popover-title">Show what someone is part of</span>
            <span className="spacer" />
            <button type="button" className="btn btn-tertiary" disabled={!person} onClick={() => onPerson(null)}>Clear</button>
          </div>
          <div className="person-row">
            {ids.map((id) => (
              <button key={id} type="button" aria-pressed={id === person} className={`person-toggle${id === person ? " is-selected" : ""}`}
                aria-label={`Show only what ${room.people[id].name} is part of`} data-tip={room.people[id].name} onClick={() => onPerson(id === person ? null : id)}>
                <RoomAvatar person={room.people[id]} side={room.side} size={32} />
              </button>
            ))}
            {!ids.length && <span className="muted">Nobody has written here yet.</span>}
          </div>
        </>
      )}
    </Popover>
  );
}

/** monday "Quick filters": one chip column per field; OR within a column, AND across columns. */
function FilterMenu({ room, kind, all, shown, filters, onFilters, unread }: {
  room: RoomModel; kind: "req" | "ask"; all: RoomThread[]; shown: number; filters: RoomFilters; onFilters: (f: RoomFilters) => void; unread: (t: RoomThread) => number;
}) {
  const count = Object.values(filters).reduce((n, v) => n + v.length, 0);
  const toggle = (col: FilterCol, v: string) => onFilters({ ...filters, [col]: filters[col].includes(v) ? filters[col].filter((x) => x !== v) : [...filters[col], v] });
  return (
    <Popover
        floating // the room clips what overflows it
      width={760}
      align="right"
      className="board-popover filter-menu"
      trigger={({ open, toggle: t }) => (
        <button type="button" className={`btn btn-tertiary${open || count ? " is-open" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={t}>
          <Filter aria-hidden />
          <span className="toolbar-label">Filter{count ? ` / ${count}` : ""}</span>
        </button>
      )}
    >
      {() => (
        <>
          <div className="popover-head">
            <span className="popover-title">Quick filters</span>
            <span className="muted">Showing {shown} of {all.length}</span>
            <span className="spacer" />
            <button type="button" className="btn btn-tertiary" disabled={!count} onClick={() => onFilters(NO_FILTERS)}>Clear all</button>
          </div>
          <div className="filter-cols">
            {columnsFor(room, kind).filter((c) => c.col !== "waiting" || room.clientFacing).map(({ col, title, options }) => (
              <div key={col} className="filter-col" role="group" aria-labelledby={`room-filter-${col}`}>
                <h4 id={`room-filter-${col}`}>{title}</h4>
                <ul>
                  {options.map((o) => {
                    const on = filters[col].includes(o.value);
                    const n = all.filter((t) => valuesOf(room, t, col, unread).includes(o.value)).length;
                    return (
                      <li key={o.value}>
                        <button type="button" aria-pressed={on} className={`chip${on ? " is-selected" : ""}`} onClick={() => toggle(col, o.value)}>
                          {o.icon}<span className="chip-label">{o.label}</span><span className="chip-count">{n || "-"}</span>
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

function SortMenu({ kind, sort, onSort }: { kind: "req" | "ask"; sort: RoomSort; onSort: (s: RoomSort) => void }) {
  const active = SORTS[kind].find((s) => s.id === sort);
  return (
    <Popover
        floating // the room clips what overflows it
      width={220}
      trigger={({ open, toggle }) => (
        <button type="button" className={`btn btn-tertiary${open || sort !== "none" ? " is-open" : ""}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
          <ArrowUpDown aria-hidden />
          <span className="toolbar-label">{sort === "none" || !active ? "Sort" : `Sort: ${active.label}`}</span>
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-section-label">Sort by</div>
          {SORTS[kind].map((s) => (
            <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === sort} className={`menu-item${s.id === sort ? " is-selected" : ""}`}
              onClick={() => { onSort(s.id); close(); }}>
              {s.label}
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}
