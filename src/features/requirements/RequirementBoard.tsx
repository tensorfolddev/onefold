"use client";

// Requirements as a board — the tickets' board, the same columns and cards: a list per stage, left to right — Draft,
// (with the client,) Confirmed, Delivered (agreed, and every ticket done), Dropped. A card reads like a ticket's: what
// it is (its code), its title, then its priority, how much is built, and who confirmed it. Dragging does what the
// panel does: to Confirmed marks it confirmed, to Dropped asks why, out of Dropped restores it; Delivered fills itself.
import { useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CircleCheck, FileText, Flag, ListChecks, Mail, MessageCircle, Phone, Plus, Users, CircleHelp, X, type LucideIcon } from "lucide-react";
import { addRequirement, dropRequirement, markRequirementConfirmed, restoreRequirement } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import type { Db } from "@/data/db";
import { isDelivered, PRIORITIES, REQUIREMENT_PRIORITY, requirementProgress, SOURCE_KINDS, statusOfRequirement } from "@/domain/selectors/requirements";
import type { Requirement, RequirementSourceKind } from "@/domain/types";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { Avatar, IconButton } from "@/ui/primitives";

type Column = "proposed" | "draft" | "with_client" | "confirmed" | "delivered" | "dropped";
const COLUMNS: { key: Column; label: string; tone?: string; onlyWhenUsed?: boolean }[] = [
  { key: "proposed", label: "Client asked", tone: "sky", onlyWhenUsed: true },
  { key: "draft", label: "Draft" },
  { key: "with_client", label: "With the client", tone: "working", onlyWhenUsed: true },
  { key: "confirmed", label: "Confirmed", tone: "teal" },
  { key: "delivered", label: "Delivered", tone: "done" },
  { key: "dropped", label: "Dropped", tone: "cancelled" },
];
const CLICK_GUARD_MS = 60; // just past dnd-kit's 50ms "no click right after a drag"
const SOURCE_ICON: Record<RequirementSourceKind, LucideIcon> = { meeting: Users, call: Phone, email: Mail, whatsapp: MessageCircle, doc: FileText, other: CircleHelp };
const rank = (r: Requirement) => (r.priority ? PRIORITIES.indexOf(r.priority) : PRIORITIES.length);
const codeNumber = (r: Requirement) => Number(/\d+/.exec(r.code)?.[0] ?? 0);

function columnOf(db: Db, r: Requirement): Column {
  const s = statusOfRequirement(r);
  if (s === "to_confirm" || s === "changes_requested") return "with_client";
  if (s === "confirmed") return isDelivered(db, r) ? "delivered" : "confirmed";
  return s;
}

export function RequirementBoard({ productKey, items, editable, onOpen }: { productKey: string; items: Requirement[]; editable: boolean; onOpen: (id: string) => void }) {
  const { db, act, toast } = useMe();
  const [dragging, setDragging] = useState<Requirement | null>(null);
  const [dropping, setDropping] = useState<Requirement | null>(null);
  const [reason, setReason] = useState("");
  // Letting go of a dragged card is also a click: that one mustn't open it.
  const dragged = useRef(false);
  const open = (id: string) => { if (!dragged.current) onOpen(id); };
  const settle = () => { setTimeout(() => { dragged.current = false; }, 0); };
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // a plain click still opens it
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), // press-and-hold, so swiping scrolls
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }), // Enter keeps opening it
  );
  const byColumn = new Map<Column, Requirement[]>(COLUMNS.map((c) => [c.key, []]));
  for (const r of items) byColumn.get(columnOf(db, r))!.push(r);
  for (const list of byColumn.values()) list.sort((a, b) => rank(a) - rank(b) || codeNumber(a) - codeNumber(b));
  const shown = COLUMNS.filter((c) => !c.onlyWhenUsed || byColumn.get(c.key)!.length);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    settle();
    const r = items.find((x) => x.id === active.id);
    const to = over?.id as Column | undefined;
    if (!r || !to) return;
    const from = columnOf(db, r);
    if (to === from) return;
    // dnd-kit swallows clicks for 50ms after a drag; the dialog opens once that's over, so its buttons always work.
    if (to === "dropped") { setReason(""); setTimeout(() => setDropping(r), CLICK_GUARD_MS); return; }
    if (from === "dropped") { act((d, m) => restoreRequirement(d, m, r.id), { success: `${r.code} is back` }); return; }
    if (to === "confirmed" && from === "draft") { act((d, m) => markRequirementConfirmed(d, m, r.id), { success: `${r.code} marked confirmed` }); return; }
    toast(to === "delivered" ? "Delivered fills itself: once every ticket that builds it is done."
      : to === "draft" ? `To change ${r.code}, open it and choose Edit — it then needs confirming again.`
      : "Sharing with the client comes with the client space.", undefined, "error");
  };

  return (
    <>
      <DndContext sensors={sensors} onDragStart={({ active }) => { dragged.current = true; setDragging(items.find((x) => x.id === active.id) ?? null); }}
        onDragEnd={onDragEnd} onDragCancel={() => { setDragging(null); settle(); }}>
        <div className="kanban requirement-board" role="list" aria-label="Requirements board">
          {shown.map((c) => <BoardColumn key={c.key} productKey={productKey} column={c} items={byColumn.get(c.key)!} editable={editable} onOpen={open} />)}
        </div>
        <DragOverlay dropAnimation={null}>{dragging && <div className="kanban-card is-overlay requirement-card"><CardView requirement={dragging} /></div>}</DragOverlay>
      </DndContext>
      {dropping && (
        <ConfirmDialog title={`Drop ${dropping.code}?`} confirmLabel="Drop it" confirmDisabled={!reason.trim()}
          body={(
            <label className="field">
              <span className="field-label">Why is it out of scope?</span>
              <span className="input"><input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. The client moved it to phase 2" /></span>
            </label>
          )}
          onConfirm={() => { if (act((d, m) => dropRequirement(d, m, dropping.id, reason), { success: `${dropping.code} dropped` })) setDropping(null); }}
          onCancel={() => setDropping(null)} />
      )}
    </>
  );
}

function BoardColumn({ productKey, column, items, editable, onOpen }: {
  productKey: string; column: (typeof COLUMNS)[number]; items: Requirement[]; editable: boolean; onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const [adding, setAdding] = useState<"top" | "bottom" | null>(null);
  const canAdd = editable && column.key === "draft"; // new ones start as drafts
  return (
    <section role="listitem" aria-label={column.label} className={`kanban-col requirement-col${isOver ? " is-over" : ""}`}>
      <div className="kanban-col-header" data-tone={column.tone}>
        <h2 className="kanban-col-title">{column.label}</h2>
        {canAdd && (
          <span className="kanban-col-actions">
            <button type="button" className="kanban-list-more" aria-label="Add a requirement at the top of Draft" onClick={() => setAdding("top")}><Plus aria-hidden /></button>
          </span>
        )}
      </div>
      {adding === "top" && <Composer productKey={productKey} position="top" onClose={() => setAdding(null)} />}
      <ul ref={setNodeRef} className="kanban-col-body">
        {items.length === 0 && <li className="kanban-empty">{column.key === "delivered" ? "Agreed, and every ticket done" : "No requirements"}</li>}
        {items.map((r) => <DraggableCard key={r.id} requirement={r} editable={editable} onOpen={() => onOpen(r.id)} />)}
      </ul>
      {canAdd && (
        <div className="kanban-col-foot">
          {adding === "bottom" ? <Composer productKey={productKey} position="bottom" onClose={() => setAdding(null)} /> : (
            <button type="button" className="kanban-add-task" onClick={() => setAdding("bottom")}><Plus aria-hidden /> Add requirement</button>
          )}
        </div>
      )}
    </section>
  );
}

/** Quick add, like the tickets' "Add task": Enter adds and keeps the box open for the next one, Escape closes. */
function Composer({ productKey, position, onClose }: { productKey: string; position: "top" | "bottom"; onClose: () => void }) {
  const { act } = useMe();
  const [title, setTitle] = useState("");
  const add = () => {
    if (!title.trim()) return onClose();
    if (act((d, m) => addRequirement(d, m, productKey, { title, priority: "should" }, crypto.randomUUID()))) setTitle("");
  };
  return (
    <form className={`kanban-composer is-${position}`} onSubmit={(e) => { e.preventDefault(); add(); }}>
      <textarea
        autoFocus rows={2} placeholder="What must it do?" aria-label="New requirement" value={title} maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); }
        }}
      />
      <div className="kanban-composer-actions">
        <button type="submit" className="btn btn-primary">Add requirement</button>
        <IconButton label="Cancel" onClick={onClose}><X /></IconButton>
      </div>
    </form>
  );
}

function DraggableCard({ requirement, editable, onOpen }: { requirement: Requirement; editable: boolean; onOpen: () => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: requirement.id, disabled: !editable });
  return (
    <li className={`kanban-card-slot${isDragging ? " is-placeholder" : ""}`}>
      {/* like a ticket card: a div that dnd-kit makes the button, Enter opens it */}
      <div ref={setNodeRef} className={`kanban-card requirement-card${editable ? " is-movable" : ""}`} onClick={onOpen}
        {...attributes} {...listeners}
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.target === e.currentTarget) onOpen();
          else listeners?.onKeyDown?.(e);
        }}>
        <CardView requirement={requirement} />
      </div>
    </li>
  );
}

/** A requirement card, read like a ticket's: what it is, its title, then its priority, how much is built, who agreed. */
function CardView({ requirement: r }: { requirement: Requirement }) {
  const { db } = useMe();
  const p = requirementProgress(db, r);
  const priority = r.priority ? REQUIREMENT_PRIORITY[r.priority] : undefined;
  const met = (r.criteria ?? []).filter((c) => c.done).length;
  const total = r.criteria?.length ?? 0;
  const Source = r.source ? SOURCE_ICON[r.source.kind] : undefined;
  const dropped = statusOfRequirement(r) === "dropped";
  const built = p.total > 0 && p.done === p.total;
  return (
    <>
      <span className="kanban-card-key">
        <ListChecks className="type-icon requirement-type-icon" aria-label="Requirement" />
        <span className="type-tag requirement-tag">{r.code}</span>
        <span className="requirement-card-extras">
          {Source && <span className="requirement-card-source" data-tip={`From ${SOURCE_KINDS[r.source!.kind].toLowerCase()}${r.source!.note ? `: ${r.source!.note}` : ""}`}><Source aria-label={SOURCE_KINDS[r.source!.kind]} /></span>}
          {total > 0 && <span className={`requirement-criteria${met === total ? " is-met" : ""}`} data-tip="Acceptance criteria met"><CircleCheck aria-hidden />{met}/{total}</span>}
        </span>
      </span>
      <span className={`kanban-card-title${dropped ? " is-struck" : ""}`}>{r.title}</span>
      <span className="kanban-card-meta">
        {priority && <span className="card-priority" style={{ "--prio": priority.color } as React.CSSProperties}><Flag aria-hidden />{priority.short}</span>}
        {dropped ? <span className="due-chip is-empty">{r.droppedReason}</span> : (
          <span className={`due-chip requirement-built${built ? " is-built" : ""}${p.total ? "" : " is-empty"}`}>
            {p.total ? <><span className="requirement-built-bar" aria-hidden><i style={{ width: `${(p.done / p.total) * 100}%` }} /></span>{p.done}/{p.total} built</> : "No tickets"}
          </span>
        )}
        <span className="spacer" />
        {r.confirmed && <span data-tip="Confirmed"><Avatar personId={r.confirmed.by} size="sm" /></span>}
      </span>
    </>
  );
}
