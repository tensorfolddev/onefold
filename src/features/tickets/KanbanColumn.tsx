"use client";

import { memo } from "react";
import { Ban, Layers, Plus } from "lucide-react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDb } from "@/data/StoreProvider";
import { epicLabel } from "@/domain/selectors/epics";
import type { Status, Ticket } from "@/domain/types";
import { Assignees, DueDate, EpicChip, TypeIcon } from "./TicketBits";
import { ListHeader, TaskComposer } from "./KanbanLists";
import { useIsDone } from "./TemplateRelations";

export const cardId = (key: string) => `card:${key}`;
export const listId = (statusId: string) => `list:${statusId}`;
/** Neighbours slide out of the way with this; the dropped item glides into its slot. */
export const SORT_TRANSITION = { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" };

export type Composer = { statusId: string; position: "top" | "bottom" } | null;

/** "Blocked by 2" while a dependency is still open. */
function BlockedChip({ ticket }: { ticket: Ticket }) {
  const { db } = useDb();
  const isDone = useIsDone();
  const open = (ticket.dependsOn ?? []).filter((k) => { const t = db.tickets.find((x) => x.key === k); return t && !isDone(t); });
  if (!open.length) return null;
  return <span className="blocked-chip" title={`Blocked by ${open.join(", ")}`}><Ban aria-hidden /> Blocked{open.length > 1 ? ` · ${open.length}` : ""}</span>;
}

function EpicProgress({ epic }: { epic: Ticket }) {
  const { db } = useDb();
  const isDone = useIsDone();
  const kids = db.tickets.filter((t) => t.epicKey === epic.key);
  if (!kids.length) return null;
  const done = kids.filter(isDone).length;
  return (
    <span className="epic-card-progress" title={`${done} of ${kids.length} tickets done`}>
      <span className="epic-card-bar" aria-hidden><span style={{ width: `${(done / kids.length) * 100}%` }} /></span>
      {done}/{kids.length}
    </span>
  );
}

/** Epic face: colour wash in the epic's colour, icon badge, "Epic" pill, bold title. */
const EpicCardView = memo(function EpicCardView({ ticket }: { ticket: Ticket }) {
  const { db } = useDb();
  return (
    <>
      <span className="epic-card-head">
        <span className="epic-card-badge" aria-hidden><Layers /></span>
        <span className="key">{ticket.key}</span>
        <span className="epic-card-pill">{epicLabel(db, ticket)}</span>
      </span>
      <span className="epic-card-title">{ticket.title}</span>
      <EpicProgress epic={ticket} />
      <span className="epic-card-foot">
        {ticket.due ? <DueDate ticket={ticket} done={false} /> : <span className="muted">No due date</span>}
        <span className="spacer" />
        <Assignees ids={ticket.assigneeIds} />
      </span>
    </>
  );
});

/** The card face — shared by the card in its list and the copy that follows the pointer while dragging. */
export const CardView = memo(function CardView({ ticket }: { ticket: Ticket }) {
  const { statusById } = useDb();
  const status = statusById(ticket.statusId);
  if (ticket.type === "epic") return <EpicCardView ticket={ticket} />;
  return (
    <>
      <span className="kanban-card-key"><TypeIcon type={ticket.type} /><span className="key">{ticket.key}</span><EpicChip ticket={ticket} /></span>
      <span className="kanban-card-title">{ticket.title}</span>
      <span className="kanban-card-meta">
        {ticket.due && <span className="due-chip"><DueDate ticket={ticket} done={status?.category === "done"} /></span>}
        <BlockedChip ticket={ticket} />
        <span className="spacer" />
        <Assignees ids={ticket.assigneeIds} />
      </span>
    </>
  );
});

const SortableCard = memo(function SortableCard({ ticket, canMove, onOpen }: { ticket: Ticket; canMove: boolean; onOpen: (key: string) => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: cardId(ticket.key), data: { type: "card", key: ticket.key }, disabled: !canMove, transition: SORT_TRANSITION,
  });
  return (
    <li
      ref={setNodeRef} className={`kanban-card-slot${isDragging ? " is-placeholder" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        type="button" className={`kanban-card${canMove ? " is-movable" : ""}${ticket.type === "epic" ? " is-epic" : ""}`}
        style={ticket.type === "epic" ? ({ "--epic": ticket.color } as React.CSSProperties) : undefined}
        onClick={() => onOpen(ticket.key)}
        {...attributes} {...listeners}
      >
        <CardView ticket={ticket} />
      </button>
    </li>
  );
});

export interface ColumnProps {
  productKey: string;
  status: Status;
  lists: Status[];
  keys: string[]; // this list's ticket keys in board order (same array while unchanged → no re-render)
  byKey: Map<string, Ticket>;
  canMove: boolean;
  canManageLists: boolean;
  canCreate: boolean;
  composer: Composer;
  setComposer: (c: Composer) => void;
  onOpen: (key: string) => void;
  /** The dragged item can't go here: highlighted red while it hovers. */
  forbidden?: boolean;
}

/** One list. Movable lists drag by their header; Epic + Backlog only accept cards. */
export const KanbanColumn = memo(function KanbanColumn(p: ColumnProps) {
  const { status } = p;
  const tickets = p.keys.map((k) => p.byKey.get(k)).filter((t): t is Ticket => !!t);
  const fixed = !!status.system;
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: listId(status.id), data: { type: "list", statusId: status.id, fixed },
    disabled: { draggable: fixed || !p.canManageLists, droppable: false }, transition: SORT_TRANSITION,
  });
  const composerHere = p.composer?.statusId === status.id ? p.composer.position : null;

  return (
    <section
      ref={setNodeRef} role="listitem" aria-labelledby={`kcol-${status.id}`}
      className={`kanban-col${isDragging ? " is-placeholder" : ""}${p.forbidden ? " is-forbidden" : ""}`}
      data-fixed={fixed || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <ListHeader
        productKey={p.productKey} status={status} count={tickets.length} lists={p.lists} canManage={p.canManageLists}
        handleRef={setActivatorNodeRef} handleProps={{ ...attributes, ...listeners }}
        onAddTop={p.canCreate ? () => p.setComposer({ statusId: status.id, position: "top" }) : undefined}
      />
      {composerHere === "top" && (
        <TaskComposer productKey={p.productKey} statusId={status.id} position="top" onClose={() => p.setComposer(null)} />
      )}
      <SortableContext items={tickets.map((t) => cardId(t.key))} strategy={verticalListSortingStrategy}>
        <ul className="kanban-col-body">
          {tickets.length === 0 && <li className="kanban-empty">No tickets</li>}
          {tickets.map((t) => <SortableCard key={t.key} ticket={t} canMove={p.canMove} onOpen={p.onOpen} />)}
        </ul>
      </SortableContext>
      {p.canCreate && (
        <div className="kanban-col-foot">
          {composerHere === "bottom" ? (
            <TaskComposer productKey={p.productKey} statusId={status.id} position="bottom" onClose={() => p.setComposer(null)} />
          ) : (
            <button type="button" className="kanban-add-task" onClick={() => p.setComposer({ statusId: status.id, position: "bottom" })}>
              <Plus aria-hidden /> Add task
            </button>
          )}
        </div>
      )}
    </section>
  );
});

/** What follows the pointer while a whole list is dragged: header + its first cards. */
export function ColumnPreview({ status, tickets, forbidden }: { status: Status; tickets: Ticket[]; forbidden?: boolean }) {
  return (
    <section className={`kanban-col is-overlay${forbidden ? " is-forbidden" : ""}`}>
      <div className="kanban-col-header" data-tone={status.tone}><h2 className="kanban-col-title">{status.name}</h2></div>
      <ul className="kanban-col-body">
        {tickets.slice(0, 4).map((t) => <li key={t.key}><div className="kanban-card"><CardView ticket={t} /></div></li>)}
        {tickets.length === 0 && <li className="kanban-empty">No tickets</li>}
      </ul>
    </section>
  );
}
