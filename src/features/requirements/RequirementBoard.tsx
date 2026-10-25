"use client";

// Requirements as a board, like the tickets' one: a column per stage, left to right — Draft, (with the client,)
// Confirmed, Delivered (agreed, and every ticket done), Dropped. Dragging is the same as the panel's actions: to
// Confirmed marks it confirmed, to Dropped asks why, out of Dropped restores it. Delivered fills itself.
import { useRef, useState } from "react";
import { DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { FileText, Mail, MessageCircle, Phone, Users, CircleHelp, type LucideIcon } from "lucide-react";
import { dropRequirement, markRequirementConfirmed, restoreRequirement } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { isDelivered, PRIORITIES, REQUIREMENT_PRIORITY, requirementProgress, SOURCE_KINDS, statusOfRequirement } from "@/domain/selectors/requirements";
import type { Requirement, RequirementSourceKind } from "@/domain/types";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { Avatar } from "@/ui/primitives";

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

function columnOf(db: Parameters<typeof isDelivered>[0], r: Requirement): Column {
  const s = statusOfRequirement(r);
  if (s === "to_confirm" || s === "changes_requested") return "with_client";
  if (s === "confirmed") return isDelivered(db, r) ? "delivered" : "confirmed";
  return s;
}

export function RequirementBoard({ items, editable, onOpen }: { items: Requirement[]; editable: boolean; onOpen: (id: string) => void }) {
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
        <div className="kanban requirement-board" aria-label="Requirements board">
          {shown.map((c) => <BoardColumn key={c.key} column={c} items={byColumn.get(c.key)!} editable={editable} onOpen={open} />)}
        </div>
        <DragOverlay dropAnimation={null}>{dragging && <CardFace requirement={dragging} lifted />}</DragOverlay>
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

function BoardColumn({ column, items, editable, onOpen }: { column: (typeof COLUMNS)[number]; items: Requirement[]; editable: boolean; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <section className={`kanban-col requirement-col${isOver ? " is-over" : ""}`} aria-label={column.label}>
      <header className="kanban-col-header" data-tone={column.tone}>{column.label} <span className="kanban-count">/ {items.length}</span></header>
      <div ref={setNodeRef} className="kanban-col-body">
        {items.map((r) => <DraggableCard key={r.id} requirement={r} editable={editable} onOpen={() => onOpen(r.id)} />)}
        {!items.length && <p className="kanban-empty">{column.key === "delivered" ? "Agreed, and every ticket done" : "Nothing here"}</p>}
      </div>
    </section>
  );
}

function DraggableCard({ requirement, editable, onOpen }: { requirement: Requirement; editable: boolean; onOpen: () => void }) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: requirement.id, disabled: !editable });
  return (
    <div className={`requirement-card-slot${isDragging ? " is-placeholder" : ""}`}>
      <CardFace requirement={requirement} onOpen={onOpen} drag={{ ref: setNodeRef, props: { ...attributes, ...listeners } }} />
    </div>
  );
}

/** A requirement card: what it is, how important, how much is built, what's met, where it came from, who agreed. */
function CardFace({ requirement: r, onOpen, lifted = false, drag }: {
  requirement: Requirement; onOpen?: () => void; lifted?: boolean;
  drag?: { ref: (el: HTMLElement | null) => void; props: React.HTMLAttributes<HTMLElement> }; // the card itself is what you pick up
}) {
  const { db } = useMe();
  const p = requirementProgress(db, r);
  const priority = r.priority ? REQUIREMENT_PRIORITY[r.priority] : undefined;
  const met = (r.criteria ?? []).filter((c) => c.done).length;
  const total = r.criteria?.length ?? 0;
  const Source = r.source ? SOURCE_ICON[r.source.kind] : undefined;
  const dropped = statusOfRequirement(r) === "dropped";
  return (
    <button type="button" ref={drag?.ref} {...drag?.props} className={`requirement-card${lifted ? " is-lifted" : ""}${dropped ? " is-dropped" : ""}`} onClick={onOpen}
      style={{ "--p": priority?.color ?? "var(--ui-border-color)" } as React.CSSProperties}>
      <span className="requirement-card-top">
        <span className="requirement-code">{r.code}</span>
        {priority && <span className="requirement-card-priority">{priority.short}</span>}
      </span>
      <span className="requirement-card-title">{r.title}</span>
      {dropped ? <span className="requirement-card-note">{r.droppedReason}</span> : (
        <>
          {p.total > 0 && (
            <span className="requirement-split" role="img" aria-label={`${p.done} done, ${p.doing} in progress, ${p.total - p.done - p.doing} to do`}>
              <i className="is-done" style={{ width: `${(p.done / p.total) * 100}%` }} /><i className="is-doing" style={{ width: `${(p.doing / p.total) * 100}%` }} />
            </span>
          )}
          <span className="requirement-card-foot">
            <span>{p.total ? `${p.done}/${p.total} built` : "No tickets yet"}</span>
            {total > 0 && <span data-tip="Acceptance criteria met">✓ {met}/{total}</span>}
            <span className="spacer" />
            {Source && <span className="requirement-card-source" data-tip={`${SOURCE_KINDS[r.source!.kind]}${r.source!.note ? `: ${r.source!.note}` : ""}`}><Source aria-hidden /></span>}
            {r.confirmed && <span data-tip="Confirmed"><Avatar personId={r.confirmed.by} size="sm" /></span>}
          </span>
        </>
      )}
    </button>
  );
}
