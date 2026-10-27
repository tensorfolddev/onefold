"use client";

// The Client tab's main table, like monday's: requirements (or requests) in status groups — every phase there, even
// empty, in the company's own names and colours — one row per item with its status, and a 💬 count that opens its chat
// beside it. A priority is changed right in the row (or on a card): a small menu, no chat opened.
import { useState } from "react";
import { Archive, CalendarDays, ChevronDown, CircleAlert, Flag, Lock, MessageCircle, MessagesSquare, Plus } from "lucide-react";
import { today } from "@/domain/clock";
import { askPhase, prioritiesOf, priorityLook, reqPhase } from "@/domain/selectors/clientLook";
import type { RoomModel, RoomRequirement, RoomThread } from "@/domain/selectors/room";
import type { AskState, Product, RequirementStatus } from "@/domain/types";
import { ContextMenu } from "@/ui/ContextMenu";
import { Popover } from "@/ui/Popover";
import { ProductTile } from "@/ui/primitives";
import type { RoomActions } from "./roomActions";
import { dateLabel, KIND, KindIcon, kindOf, RoomAvatar, statusOf } from "./roomUi";

export function ThreadIcon({ room, t }: { room: RoomModel; t: RoomThread }) {
  if (t.kind === "chat") return <ProductTile product={{ name: room.project.name, color: room.project.color, icon: room.project.icon } as Product} />;
  const kind = kindOf(t);
  return (
    <span className="room-thread-ico" style={{ "--c": KIND[kind].color } as React.CSSProperties}>
      <KindIcon kind={kind} size={18} />
      {t.internal && <span className="room-thread-lock" title="Only the team sees this"><Lock aria-hidden /></span>}
    </span>
  );
}

const REQ_GROUPS: RequirementStatus[] = ["to_confirm", "changes_requested", "proposed", "draft", "confirmed", "dropped"];
const ASK_GROUPS: AskState[] = ["open", "answered", "done", "cancelled"];
const FOLDED = new Set<string>(["dropped", "done", "cancelled"]); // closed ones start folded
const talk = (t: RoomThread) => t.messages.filter((m) => m.kind !== "event").length;
type Group = { id: string; label: string; color: string; items: RoomThread[] };

/** Every phase, in order — a client never has drafts, so they don't get that one. */
function groupsOf(room: RoomModel, kind: "req" | "ask", threads: RoomThread[]): Group[] {
  return kind === "req"
    ? REQ_GROUPS.filter((s) => room.side === "team" || s !== "draft")
      .map((s) => ({ id: s, ...reqPhase(room.look, s, room.side), items: threads.filter((t) => t.requirement?.status === s) }))
    : ASK_GROUPS.map((s) => ({ id: s, ...askPhase(room.look, s, room.side), items: threads.filter((t) => t.ask?.state === s) }));
}

function TalkCount({ t, unread }: { t: RoomThread; unread: number }) {
  const n = talk(t);
  return (
    <span className={unread ? "room-talk is-new" : n ? "room-talk" : "room-talk is-none"} aria-label={unread ? `${unread} new messages` : `${n} messages`}>
      <MessageCircle aria-hidden />{unread || n || ""}
    </span>
  );
}

function Progress({ r }: { r: RoomRequirement }) {
  const { done, doing, total } = r.progress;
  return <><span className="room-bar"><i style={{ width: `${(done / total) * 100}%` }} /><i className="is-doing" style={{ width: `${(doing / total) * 100}%` }} /></span>{done}/{total}</>;
}

/** A requirement's priority — for the team, a button: a small menu to change it right here, the chat stays shut. */
export function PriorityChip({ room, r, actions, flag }: { room: RoomModel; r: RoomRequirement; actions: RoomActions; flag?: boolean }) {
  const p = priorityLook(room.look, r.priority);
  const chip = p
    ? <span className={flag ? "card-priority" : "room-prio"} style={{ "--c": p.color, "--prio": p.color } as React.CSSProperties}>{flag && <Flag aria-hidden />}{p.short}</span>
    : <span className="room-cell-none">{flag ? "" : "—"}</span>;
  if (room.side !== "team" || !actions.setPriority || r.status === "dropped") return chip;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation(); // the row's own click opens the chat
  return (
    <Popover
      floating // the table clips what overflows it
      width={210}
      trigger={({ open, toggle }) => (
        <button type="button" className={`room-prio-btn${open ? " is-open" : ""}${p ? "" : " is-none"}`} aria-haspopup="menu" aria-expanded={open}
          aria-label={`Priority: ${p?.name ?? "none"}`} onClick={(e) => { stop(e); toggle(); }} onKeyDown={stop}>
          {p ? chip : flag ? <span className="room-prio-add"><Flag aria-hidden /> Priority</span> : chip}
        </button>
      )}
    >
      {(close) => (
        <div role="menu" aria-label="Priority" onClick={stop} onKeyDown={stop}>
          <div className="menu-section-label">Priority</div>
          {prioritiesOf(room.look).map((x) => (
            <button key={x.id} type="button" role="menuitemradio" aria-checked={x.id === r.priority} className={`menu-item${x.id === r.priority ? " is-selected" : ""}`}
              onClick={() => { if (x.id !== r.priority) actions.setPriority!(r.id, x.id); close(); }}>
              <span className="chip-dot" style={{ background: x.color }} aria-hidden />{x.name}
            </button>
          ))}
          {r.priority && <button type="button" role="menuitem" className="menu-item" onClick={() => { actions.setPriority!(r.id, null); close(); }}>No priority</button>}
        </div>
      )}
    </Popover>
  );
}

/** Enter or Space on the row itself (not a button in it) opens it. */
const openOnKey = (onOpen: () => void) => (e: React.KeyboardEvent) => {
  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
  e.preventDefault();
  onOpen();
};

/** Right-click a requirement — only where it can be archived (an admin): open it, or archive it. */
function useRequirementMenu(actions: RoomActions, onOpen: (subject: string) => void) {
  const [at, setAt] = useState<{ t: RoomThread; x: number; y: number } | null>(null);
  const onMenu = (t: RoomThread) => (t.requirement && actions.archive
    ? (e: React.MouseEvent) => { e.preventDefault(); setAt({ t, x: e.clientX, y: e.clientY }); } : undefined);
  const menu = at && (
    <ContextMenu x={at.x} y={at.y} label={`${at.t.key} actions`} onClose={() => setAt(null)}>
      <button type="button" role="menuitem" className="menu-item" onClick={() => { setAt(null); onOpen(at.t.subject); }}><MessagesSquare aria-hidden /> Open {at.t.key}</button>
      <hr className="menu-sep" />
      <button type="button" role="menuitem" className="menu-item" onClick={() => { setAt(null); actions.archive!(at.t.requirement!.id); }}><Archive aria-hidden /> Archive requirement</button>
    </ContextMenu>
  );
  return { onMenu, menu };
}

function Row({ room, t, current, unread, onOpen, onMenu, actions }: {
  room: RoomModel; t: RoomThread; current: boolean; unread: number; onOpen: () => void; onMenu?: (e: React.MouseEvent) => void; actions: RoomActions;
}) {
  const r = t.requirement, a = t.ask;
  const s = statusOf(room, t)!;
  const forWhom = a?.assigneeId ? room.people[a.assigneeId] : undefined;
  return (
    <div role="row" tabIndex={0} className="room-row" aria-current={current || undefined} aria-label={`${t.key} ${t.title}`} onClick={onOpen} onContextMenu={onMenu} onKeyDown={openOnKey(onOpen)}>
      <span role="cell" className="room-cell-item">
        {a && <span className="room-row-kind" style={{ color: KIND[a.kind].color }}><KindIcon kind={a.kind} size={15} /></span>}
        <span className="room-row-key">{t.key}</span>
        <span className="room-row-title">{t.title}</span>
        {t.internal && <Lock aria-label="Only the team sees this" className="room-row-lock" />}
      </span>
      <span role="cell" className="room-cell-status" style={{ "--c": s.color } as React.CSSProperties}>{s.label}</span>
      {r ? (
        <>
          <span role="cell" className="room-cell-prio"><PriorityChip room={room} r={r} actions={actions} /></span>
          <span role="cell" className="room-cell-built">
            {r.progress.total > 0 && r.status === "confirmed" ? <Progress r={r} /> : <span className="room-cell-none">—</span>}
          </span>
        </>
      ) : (
        <>
          <span role="cell" className="room-cell-for">{forWhom ? <><RoomAvatar person={forWhom} side={room.side} size={24} /><span>{forWhom.id === room.meId ? "You" : forWhom.name.split(" ")[0]}</span></> : <span className="room-cell-none">Anyone</span>}</span>
          <span role="cell" className="room-cell-due">{a!.due ? <><CalendarDays aria-hidden />{dateLabel(a!.due)}</> : <span className="room-cell-none">—</span>}</span>
        </>
      )}
      <span role="cell" className="room-cell-talk"><TalkCount t={t} unread={unread} /></span>
    </div>
  );
}

export function RoomTable({ room, kind, threads, subject, onOpen, unread, actions, filtered }: {
  room: RoomModel; kind: "req" | "ask"; threads: RoomThread[]; subject: string | null; onOpen: (s: string) => void;
  unread: (t: RoomThread) => number; actions: RoomActions; filtered: boolean;
}) {
  const [folded, setFolded] = useState<Set<string>>(FOLDED);
  const { onMenu, menu } = useRequirementMenu(actions, onOpen);
  const groups = groupsOf(room, kind, threads);
  const toggle = (id: string) => setFolded((f) => { const n = new Set(f); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const shown = filtered ? groups.filter((g) => g.items.length) : groups; // a search shows what it found; otherwise every phase
  const add = addOf(room, kind, actions);
  const cols = kind === "req" ? ["Requirement", "Status", "Priority", "Built"] : ["Request", "Status", "For", "Due"];
  return (
    <div className={`room-table is-${kind}`} role="table" aria-label={kind === "req" ? "Requirements" : "Requests"}>
      {!threads.length && <Empty room={room} kind={kind} filtered={filtered} add={add} />}
      {shown.map((g) => {
        const isFolded = folded.has(g.id) && !filtered && !g.items.some((t) => t.subject === subject);
        return (
          <section key={g.id} className="room-tgroup" style={{ "--c": g.color } as React.CSSProperties} aria-label={g.label}>
            <button type="button" className="room-tgroup-head" aria-expanded={!isFolded} onClick={() => toggle(g.id)}>
              <ChevronDown aria-hidden data-folded={isFolded || undefined} />
              <span className="room-tgroup-title">{g.label}</span>
              <span className="room-tgroup-n">{g.items.length} {g.items.length === 1 ? "item" : "items"}</span>
            </button>
            {!isFolded && (
              <div className="room-tgroup-rows" role="rowgroup">
                {g.items.length ? (
                  <>
                    <div className="room-row is-head" role="row">
                      {cols.map((c) => <span key={c} role="columnheader">{c}</span>)}
                      <span role="columnheader" aria-label="Messages" />
                    </div>
                    {g.items.map((t) => <Row key={t.subject} room={room} t={t} current={t.subject === subject} unread={unread(t)} onOpen={() => onOpen(t.subject)} onMenu={onMenu(t)} actions={actions} />)}
                  </>
                ) : <p className="room-tgroup-empty">Nothing {g.label.toLowerCase()} right now</p>}
              </div>
            )}
          </section>
        );
      })}
      {menu}
    </div>
  );
}

export const addOf = (room: RoomModel, kind: "req" | "ask", actions: RoomActions) => room.side === "team"
  ? (kind === "req" ? actions.newRequirement : room.clientFacing ? () => actions.newRequest?.() : undefined)
  : (kind === "req" && room.myRole !== "tester" ? actions.suggest : undefined);

function Empty({ room, kind, filtered, add }: { room: RoomModel; kind: "req" | "ask"; filtered: boolean; add?: () => void }) {
  const team = room.side === "team";
  return (
    <div className="room-table-empty">
      <p>{filtered ? "Nothing matches." : kind === "req" ? (team ? "No requirements yet. Write the first one, then send it to the client to confirm." : "Nothing shared with you yet.") : team ? "Ask the client for access, a file or an answer — it gets its own chat." : "Nothing asked of you yet."}</p>
      {add && !filtered && <button type="button" className="btn btn-primary btn-sm" onClick={add}><Plus aria-hidden /> {kind === "req" ? (team ? "New requirement" : "Suggest a requirement") : "New request"}</button>}
    </div>
  );
}

/** The same items as a kanban — the tickets board's: a column per phase, side by side in the order work moves, every
 *  column there even when empty, each in its phase's colour; ticket-style cards. A card opens its chat. */
const FLOW: Record<string, number> = { draft: 0, proposed: 1, to_confirm: 2, changes_requested: 3, confirmed: 4, dropped: 5 };

export function RoomKanban({ room, kind, threads, subject, onOpen, unread, actions }: Parameters<typeof RoomTable>[0]) {
  const cols = groupsOf(room, kind, threads).sort((a, b) => (FLOW[a.id] ?? 0) - (FLOW[b.id] ?? 0));
  const none = kind === "req" ? "No requirements" : "No requests";
  const { onMenu, menu } = useRequirementMenu(actions, onOpen);
  return (
    <div className="kanban room-kanban">
      {cols.map((g) => (
        <section key={g.id} className="kanban-col" aria-label={g.label}>
          <div className="kanban-col-header" style={{ "--c": g.color } as React.CSSProperties}>
            <h2 className="kanban-col-title" aria-label={`${g.label}, ${g.items.length}`}>{g.label}<span className="room-kcol-n" aria-hidden>{g.items.length}</span></h2>
          </div>
          <ul className="kanban-col-body">
            {!g.items.length && <li className="kanban-empty">{none}</li>}
            {g.items.map((t) => <li key={t.subject}><KanbanCard room={room} t={t} current={t.subject === subject} unread={unread(t)} onOpen={() => onOpen(t.subject)} onMenu={onMenu(t)} actions={actions} /></li>)}
          </ul>
        </section>
      ))}
      {menu}
    </div>
  );
}

function KanbanCard({ room, t, current, unread, onOpen, onMenu, actions }: {
  room: RoomModel; t: RoomThread; current: boolean; unread: number; onOpen: () => void; onMenu?: (e: React.MouseEvent) => void; actions: RoomActions;
}) {
  const r = t.requirement, a = t.ask;
  const kind = r ? "req" : a!.kind;
  const forWhom = a?.assigneeId ? room.people[a.assigneeId] : undefined;
  const late = !!a?.due && a.state === "open" && a.due < today();
  return (
    <div className="kanban-card room-kcard" role="button" tabIndex={0} aria-current={current || undefined} aria-label={`${t.key} ${t.title}`} onClick={onOpen} onContextMenu={onMenu} onKeyDown={openOnKey(onOpen)}>
      <span className="kanban-card-key">
        <span className="type-icon room-kcard-ico" style={{ color: KIND[kind].color }}><KindIcon kind={kind} size={16} /></span>
        <span className="type-tag" style={{ "--t": KIND[kind].color } as React.CSSProperties} title={KIND[kind].label}>{t.key}</span>
        {t.internal && <Lock aria-label="Only the team sees this" className="room-row-lock" />}
        {forWhom && <span className="room-kcard-who" title={`For ${forWhom.name}`}><RoomAvatar person={forWhom} side={room.side} size={24} /></span>}
      </span>
      <span className="kanban-card-title">{t.title}</span>
      <span className="kanban-card-meta">
        {r && <PriorityChip room={room} r={r} actions={actions} flag />}
        {r && r.status === "confirmed" && r.progress.total > 0 && <span className="room-kcard-built"><Progress r={r} /></span>}
        {a?.due && (
          <span className="due-chip"><span className={`due${late ? " is-overdue" : ""}`}>{late && <CircleAlert aria-label="Late" />}<span className="due-text">{dateLabel(a.due)}</span></span></span>
        )}
        <span className="spacer" />
        <TalkCount t={t} unread={unread} />
      </span>
    </div>
  );
}
