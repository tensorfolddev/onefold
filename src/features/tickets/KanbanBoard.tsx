"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter, closestCorners, defaultDropAnimationSideEffects, DndContext, DragOverlay, KeyboardSensor,
  MeasuringStrategy, MouseSensor, pointerWithin, TouchSensor, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragOverEvent, type DragStartEvent, type DropAnimation,
} from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { playSound } from "@/features/tickets/sounds";
import { useAppState } from "@/features/shell/state";
import { moveStatus, moveTicket } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import type { Status, Ticket } from "@/domain/types";
import { AddList } from "./KanbanLists";
import { CardView, ColumnPreview, KanbanColumn, listId, SORT_TRANSITION, type Composer } from "./KanbanColumn";

type Items = Record<string, string[]>; // list id → ticket keys, in board order
type DragData = { type: "card"; key: string } | { type: "list"; statusId: string; fixed: boolean };

const DROP: DropAnimation = {
  duration: SORT_TRANSITION.duration, easing: SORT_TRANSITION.easing,
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } }),
};

/** Epics live only in the Epic list, and nothing else does (spec: epics have a colour, not a status). */
export const canLiveIn = (t: Ticket, list?: Status) => !!list && (t.type === "epic") === (list.system === "epic");

const NO_KEYS: string[] = [];
const findList = (items: Items, key: string) => Object.keys(items).find((sid) => items[sid].includes(key));

/** Kanban view: drag cards between lists and lists between each other; space opens where the item will land. */
export function KanbanBoard({ productKey, tickets }: { productKey: string; tickets: Ticket[] }) {
  const { openTicket } = useAppState();
  const { statusesFor, can, productByKey, act } = useDb();
  const product = productByKey(productKey);
  const canMove = !!product && can("ticket.edit", { product });
  const canManageLists = !!product && can("statuses.edit", { product });
  const canCreate = !!product && can("ticket.create", { product });
  const lists = statusesFor(productKey);
  const byKey = useMemo(() => new Map(tickets.map((t) => [t.key, t])), [tickets]);
  const [composer, setComposer] = useState<Composer>(null);

  const base: Items = useMemo(
    () => Object.fromEntries(lists.map((s) => [s.id, tickets.filter((t) => t.statusId === s.id).map((t) => t.key)])),
    [lists, tickets],
  );
  const [dragItems, setDragItems] = useState<Items | null>(null); // live layout while a card is dragged
  const [active, setActive] = useState<DragData | null>(null);
  const items = dragItems ?? base;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // a plain click still opens the ticket
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }), // press-and-hold, so swiping scrolls
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] }, // Enter keeps opening the ticket
    }),
  );

  // Cards: the card under the pointer wins, else the list; lists only collide with movable lists.
  const collision: CollisionDetection = (args) => {
    const type = (args.active.data.current as DragData | undefined)?.type;
    if (type === "list") {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((c) => c.data.current?.type === "list" && !c.data.current.fixed),
      });
    }
    // Just moved into another list: the lists re-measure for a frame, and the pointer may briefly sit over the old one —
    // keep the target we had, or the card bounces between the two lists forever ("Maximum update depth exceeded").
    if (movedLists.current && lastHit.current !== null) return [{ id: lastHit.current }];
    const hits = pointerWithin(args);
    const cardHits = hits.filter((h) => args.droppableContainers.find((c) => c.id === h.id)?.data.current?.type === "card");
    const result = cardHits.length ? cardHits : hits.length ? hits : closestCorners(args);
    lastHit.current = result[0]?.id ?? null;
    return result;
  };
  const movedLists = useRef(false);
  const lastHit = useRef<string | number | null>(null);

  const lastList = useRef<string | undefined>(undefined); // for the "moved into another list" tick
  const lastOver = useRef<string | number | undefined>(undefined); // for the tick as the item passes others

  // "You can't do that": the lists the dragged item may not enter while it hovers them (shake + red + buzz).
  const [nope, setNope] = useState<string[] | null>(null);
  const refuse = (ids: string[] | null) => {
    if (ids && !nope) {
      playSound("refuse");
      navigator.vibrate?.([30, 40, 30]); // phones: a short double buzz
    }
    if ((ids?.join() ?? "") !== (nope?.join() ?? "")) setNope(ids);
  };

  const onDragStart = ({ active: a }: DragStartEvent) => {
    const data = a.data.current as DragData;
    playSound("pickup");
    lastList.current = data.type === "card" ? byKey.get(data.key)?.statusId : undefined;
    lastOver.current = a.id;
    setActive(data);
    if (data.type === "card") setDragItems(base);
    setComposer(null);
  };

  // While a card moves across lists, re-home it in the live layout so the target list opens a gap for it.
  const onDragOver = ({ active: a, over }: DragOverEvent) => {
    const data = a.data.current as DragData;
    const overData = over?.data.current as DragData | undefined;
    // A heavy tick each time the item passes another one (same sound in every direction).
    if (over && over.id !== lastOver.current && over.id !== a.id) {
      const sameList = data.type === "list" || (overData?.type === "card"
        ? findList(dragItems ?? base, overData.key) === lastList.current : overData?.statusId === lastList.current);
      if (sameList && !nope) playSound("tick");
    }
    lastOver.current = over?.id;
    if (data.type !== "card" || !overData) return;
    const to = overData.type === "card" ? findList(dragItems ?? base, overData.key) : overData.statusId;
    const ticket = byKey.get(data.key);
    if (to && ticket) refuse(canLiveIn(ticket, lists.find((s) => s.id === to)) ? null : [to]);
    if (to && to !== lastList.current && ticket) {
      const allowed = canLiveIn(ticket, lists.find((s) => s.id === to));
      lastList.current = allowed ? to : ticket.statusId; // back home: the next allowed list ticks again
      if (allowed) playSound("move");
    }
    setDragItems((prev) => {
      const cur = prev ?? base;
      const from = findList(cur, data.key);
      const to = overData.type === "card" ? findList(cur, overData.key) : overData.statusId;
      const ticket = byKey.get(data.key);
      if (!from || !to || !ticket) return cur;
      // Over a list it can't live in (epic ↔ Epic): the card goes back home, so letting go there changes nothing.
      if (!canLiveIn(ticket, lists.find((s) => s.id === to))) return base;
      if (from === to) return cur;
      movedLists.current = true; // steady the target until the lists have re-measured (see collision)
      const target = cur[to];
      const overIndex = overData.type === "card" ? target.indexOf(overData.key) : target.length;
      const below = overData.type === "card" && over && a.rect.current.translated
        ? a.rect.current.translated.top > over.rect.top + over.rect.height / 2 : false;
      const at = overIndex < 0 ? target.length : overIndex + (below ? 1 : 0);
      return { ...cur, [from]: cur[from].filter((k) => k !== data.key), [to]: [...target.slice(0, at), data.key, ...target.slice(at)] };
    });
  };

  // Lists can't go in front of Epic + Backlog: refuse as soon as the dragged list reaches them.
  const onDragMove = ({ active: a }: DragMoveEvent) => {
    if ((a.data.current as DragData).type !== "list") return;
    const fixed = [...(boardRef.current?.querySelectorAll<HTMLElement>(".kanban-col[data-fixed]") ?? [])];
    const edge = fixed.at(-1)?.getBoundingClientRect().right;
    const left = a.rect.current.translated?.left;
    refuse(edge !== undefined && left !== undefined && left < edge - 40 ? lists.filter((s) => s.system).map((s) => s.id) : null);
  };

  const onDragEnd = ({ active: a, over }: DragEndEvent) => {
    const data = a.data.current as DragData;
    const overData = over?.data.current as DragData | undefined;
    let moved = false;
    if (data.type === "list" && !nope && overData?.type === "list" && overData.statusId !== data.statusId) {
      moved = true;
      const movable = lists.filter((s) => !s.system).map((s) => s.id);
      const order = arrayMove(movable, movable.indexOf(data.statusId), movable.indexOf(overData.statusId));
      const before = order[order.indexOf(data.statusId) + 1];
      act((d, m) => moveStatus(d, m, productKey, data.statusId, before));
    }
    if (data.type === "card") {
      const cur = dragItems ?? base;
      const to = findList(cur, data.key);
      if (to) {
        let col = cur[to];
        if (overData?.type === "card" && overData.key !== data.key && col.includes(overData.key)) {
          col = arrayMove(col, col.indexOf(data.key), col.indexOf(overData.key)); // reorder inside the list
        }
        const from = byKey.get(data.key)?.statusId;
        const changed = from !== to || col.join() !== base[to].join();
        if (changed) moved = !!act((d, m) => moveTicket(d, m, data.key, to, col[col.indexOf(data.key) + 1]));
      }
    }
    playSound(moved ? "drop" : "cancel");
    setActive(null);
    setDragItems(null);
    setNope(null);
  };

  const onDragCancel = () => { playSound("cancel"); setActive(null); setDragItems(null); setNope(null); };

  // Once the moved card has been laid out in its new list, targets may change again.
  useEffect(() => {
    const frame = requestAnimationFrame(() => { movedLists.current = false; });
    return () => cancelAnimationFrame(frame);
  }, [dragItems]);

  // Lists run to the bottom of the window and scroll on their own: size the board from where it starts.
  const boardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      const el = boardRef.current;
      if (!el) return;
      const bottomBar = window.matchMedia("(max-width: 767px)").matches ? 76 : 0; // mobile tab bar
      const page = el.closest(".page");
      const below = page ? parseFloat(getComputedStyle(page).paddingBottom) || 0 : 16; // keep the page from scrolling
      el.style.setProperty("--kanban-h", `${Math.max(320, window.innerHeight - el.getBoundingClientRect().top - below - bottomBar)}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const activeTicket = active?.type === "card" ? byKey.get(active.key) : undefined;
  const activeList = active?.type === "list" ? lists.find((s) => s.id === active.statusId) : undefined;

  return (
    <DndContext
      id={`kanban-${productKey}`} sensors={sensors} collisionDetection={collision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart} onDragMove={onDragMove} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}
    >
      <div className={`kanban${active ? " is-dragging" : ""}${nope ? " is-forbidden" : ""}`} role="list" aria-label="Kanban columns" ref={boardRef}>
        <SortableContext items={lists.map((s) => listId(s.id))} strategy={horizontalListSortingStrategy}>
          {lists.map((s) => (
            <KanbanColumn
              key={s.id} productKey={productKey} status={s} lists={lists}
              keys={items[s.id] ?? NO_KEYS} byKey={byKey}
              canMove={canMove} canManageLists={canManageLists} canCreate={canCreate}
              composer={composer} setComposer={setComposer} onOpen={openTicket}
              forbidden={!!nope?.includes(s.id)}
            />
          ))}
        </SortableContext>
        {canManageLists && <div className="kanban-end"><AddList productKey={productKey} /></div>}
        <DragOverlay dropAnimation={DROP}>
          {activeTicket && (
            <div
              className={`kanban-card is-overlay${activeTicket.type === "epic" ? " is-epic" : ""}${nope ? " is-forbidden" : ""}`}
              style={activeTicket.type === "epic" ? ({ "--epic": activeTicket.color } as React.CSSProperties) : undefined}
            >
              <CardView ticket={activeTicket} />
            </div>
          )}
          {activeList && (
            <ColumnPreview status={activeList} tickets={(base[activeList.id] ?? []).map((k) => byKey.get(k)!)} forbidden={!!nope} />
          )}
        </DragOverlay>
      </div>
    </DndContext>
  );
}
