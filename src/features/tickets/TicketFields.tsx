"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, Flag, X } from "lucide-react";
import { useAppState } from "@/features/shell/state";
import { isOnProduct } from "@/domain/permissions";
import { useDb } from "@/data/StoreProvider";
import { epicLabel, epicsOf } from "@/domain/selectors/epics";
import type { Priority, Product, Ticket } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { Avatar, IconButton } from "@/ui/primitives";
import { SearchList } from "@/ui/SearchList";
import { shortDate } from "@/domain/status";
import { Assignees, DueDate, isOverdue, usePriorityLook } from "./TicketBits";

const PRIORITIES: Priority[] = ["critical", "high", "medium", "low"];

/** Escape inside a field cancels the edit without also closing the ticket panel. */
const isEscape = (e: React.KeyboardEvent) => {
  if (e.key !== "Escape") return false;
  e.stopPropagation();
  return true;
};

/** Panel heading; click to rename. Enter/blur saves, Escape cancels, empty is refused inline. */
export function TitleField({ ticket, editable }: { ticket: Ticket; editable: boolean }) {
  const { updateTicket } = useAppState();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const skipBlur = useRef(false);
  const errId = useId();

  if (!editable || draft === null) {
    return (
      <h2 id="ticket-panel-title" className="board-title">
        {editable ? (
          <button type="button" className="inline-edit" onClick={() => { skipBlur.current = false; setDraft(ticket.title); }} aria-label={`${ticket.title}. Edit title`}>
            {ticket.title}
          </button>
        ) : ticket.title}
      </h2>
    );
  }
  const stop = () => { skipBlur.current = true; setDraft(null); setError(""); };
  const save = () => {
    if (skipBlur.current) { skipBlur.current = false; return; }
    if (!draft.trim()) { setError("Title is required"); return; }
    if (draft.trim() !== ticket.title) updateTicket(ticket.key, { title: draft });
    stop();
  };

  return (
    <div id="ticket-panel-title" className="title-edit">
      <input
        autoFocus type="text" className="title-input" aria-label="Ticket title" maxLength={200}
        value={draft} aria-invalid={!!error} aria-describedby={error ? errId : undefined}
        onChange={(e) => { setDraft(e.target.value); setError(""); }}
        onBlur={save}
        onKeyDown={(e) => {
          if (isEscape(e)) stop();
          else if (e.key === "Enter") { e.preventDefault(); save(); }
        }}
      />
      {error && <p id={errId} className="field-error" role="alert">{error}</p>}
    </div>
  );
}

/** Task ↔ bug (each has its own template sections; nothing typed in is lost when switching). */
export function TypeField({ ticket }: { ticket: Ticket }) {
  const { updateTicket } = useAppState();
  return (
    <select className="meta-select" aria-label="Type" value={ticket.type}
      onChange={(e) => updateTicket(ticket.key, { type: e.target.value as "task" | "bug" })}>
      <option value="task">Task</option>
      <option value="bug">Bug</option>
    </select>
  );
}

/** The ticket's epic: a searchable list that scrolls (a product can have dozens), always on screen. */
export function EpicField({ ticket }: { ticket: Ticket }) {
  const { updateTicket } = useAppState();
  const { db } = useDb();
  const epics = epicsOf(db, ticket.productKey);
  const current = epics.find((e) => e.key === ticket.epicKey);
  const choices = [
    { value: "", label: "No epic" },
    ...epics.map((e) => ({ value: e.key, label: `${epicLabel(db, e)} · ${e.title}`, swatch: e.color ?? "var(--color-purple)" })),
  ];
  return (
    <Popover floating width={340} className="search-list-menu" trigger={({ toggle, open }) => (
      <button type="button" className="meta-select picker-trigger" aria-label="Epic" aria-haspopup="listbox" aria-expanded={open} onClick={toggle}>
        {current && <span className="search-list-swatch" style={{ background: current.color ?? "var(--color-purple)" }} aria-hidden />}
        <span className="picker-text">{current ? `${epicLabel(db, current)} · ${current.title}` : "No epic"}</span>
        <ChevronDown aria-hidden />
      </button>
    )}>
      {(close) => (
        <SearchList label="Epics" placeholder="Search epics" empty="This product has no epics yet" choices={choices} value={ticket.epicKey ?? ""}
          onPick={(v) => { close(); if (v !== (ticket.epicKey ?? "")) updateTicket(ticket.key, { epicKey: v || null }); }} />
      )}
    </Popover>
  );
}

/** `onCard`: the board card's avatar stack is the trigger, and the menu floats over the board. */
export function AssigneeField({ ticket, product, onCard }: { ticket: Ticket; product: Product; onCard?: boolean }) {
  const { updateTicket } = useAppState();
  const { db, personById } = useDb();
  const people = db.people.filter((p) => p.active && isOnProduct(p.id, product));
  const ids = ticket.assigneeIds ?? [];
  const label = ids.length === 0 ? "Unassigned" : ids.length === 1 ? personById(ids[0])?.name ?? "1 person" : `${ids.length} people`;
  // Any number of people: each pick adds or removes one, and the menu stays open for the next.
  const toggle = (id: string) => updateTicket(ticket.key, { assigneeIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] });

  return (
    <Popover
      width={260} className="assignee-menu" floating align={onCard ? "right" : "left"}
      trigger={({ open, toggle: openMenu }) => onCard ? (
        <button
          type="button" className="card-assignees" aria-haspopup="menu" aria-expanded={open} onClick={openMenu}
          aria-label={`Assignees: ${label}. Change assignees`}
        >
          <Assignees ids={ids} max={2} />
        </button>
      ) : (
        <button
          type="button" className={`btn btn-tertiary meta-trigger${open ? " is-open" : ""}`}
          aria-haspopup="menu" aria-expanded={open} onClick={openMenu}
          aria-label={`Assignees: ${label}. Change assignees`}
        >
          <Assignees ids={ids} /> {label}
        </button>
      )}
    >
      {() => (
        <>
          <button
            type="button" role="menuitemcheckbox" aria-checked={!ids.length}
            className={`menu-item${!ids.length ? " is-selected" : ""}`} onClick={() => ids.length && updateTicket(ticket.key, { assigneeIds: [] })}
          >
            <Avatar size="sm" /> Unassigned
          </button>
          {people.map((p) => (
            <button
              key={p.id} type="button" role="menuitemcheckbox" aria-checked={ids.includes(p.id)}
              className={`menu-item${ids.includes(p.id) ? " is-selected" : ""}`} onClick={() => toggle(p.id)}
            >
              <Avatar personId={p.id} size="sm" /> {p.name}
              {ids.includes(p.id) && <Check className="menu-item-end" aria-hidden />}
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}

/** `onCard`: the trigger is the card's priority tag, and the menu floats over the board. */
export function PriorityField({ ticket, onCard }: { ticket: Ticket; onCard?: boolean }) {
  const { updateTicket } = useAppState();
  const look = usePriorityLook(ticket.productKey);
  const cur = look(ticket.priority);
  return (
    <Popover
      width={160} className="priority-menu" floating
      trigger={({ open, toggle }) => (
        <button
          type="button" className={onCard ? "card-priority" : "priority-cell"} data-priority={ticket.priority} style={cur.style}
          aria-haspopup="menu" aria-expanded={open} onClick={toggle}
          aria-label={`Priority: ${cur.label}. Change priority`}
        >
          {onCard && <Flag aria-hidden />}{cur.label}
        </button>
      )}
    >
      {(close) =>
        PRIORITIES.map((pr) => (
          <button
            key={pr} type="button" role="menuitemradio" aria-checked={pr === ticket.priority}
            className="menu-item" data-priority={pr} style={look(pr).style}
            onClick={() => { if (pr !== ticket.priority) updateTicket(ticket.key, { priority: pr }); close(); }}
          >
            {look(pr).label}
          </button>
        ))
      }
    </Popover>
  );
}

export function DueField({ ticket, done }: { ticket: Ticket; done: boolean }) {
  const { updateTicket } = useAppState();
  // Saves when the field loses focus, so typing a date digit by digit logs one Activity row, not five.
  return (
    <>
      <label className={`input meta-input${isOverdue(ticket, done) ? " is-over" : ""}`}>
        <input
          key={ticket.due ?? ""} type="date" aria-label="Due date" defaultValue={ticket.due ?? ""}
          onBlur={(e) => { const due = e.target.value || undefined; if (due !== ticket.due) updateTicket(ticket.key, { due }); }}
        />
      </label>
      {ticket.due && <IconButton label="Clear due date" onClick={() => updateTicket(ticket.key, { due: null })}><X /></IconButton>}
    </>
  );
}

/** The board card's date tag: opens the browser's date picker right on the card. Pick → saved; Clear → no date. */
export function CardDueField({ ticket, done }: { ticket: Ticket; done: boolean }) {
  const { updateTicket } = useAppState();
  const input = useRef<HTMLInputElement>(null);
  const pick = () => {
    try { input.current?.showPicker(); } catch { input.current?.focus(); } // no showPicker: the field takes typing
  };
  return (
    <span className="card-due">
      <button
        type="button" className={`due-chip${ticket.due ? "" : " is-empty"}`} onClick={pick}
        aria-label={ticket.due ? `Due ${shortDate(ticket.due)}. Change due date` : "No due date. Set due date"}
      >
        {ticket.due ? <DueDate ticket={ticket} done={done} /> : "No date"}
      </button>
      <input
        ref={input} type="date" className="card-due-input" tabIndex={-1} aria-hidden value={ticket.due ?? ""}
        onChange={(e) => { const due = e.target.value || undefined; if (due !== ticket.due) updateTicket(ticket.key, { due }); }}
      />
    </span>
  );
}

export function EstimateField({ ticket }: { ticket: Ticket }) {
  const { updateTicket } = useAppState();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState("");
  const errId = useId();
  const save = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(n) || n < 0) { setError("Estimate must be 0 or more"); return; }
    if (n !== ticket.estimateH) updateTicket(ticket.key, { estimateH: n });
    setDraft(null);
    setError("");
  };

  return (
    <>
      <span className="estimate-edit">
        <label className="input meta-input estimate-input">
          <input
            type="number" min={0} step={0.5} inputMode="decimal" aria-label="Estimate in hours"
            value={draft ?? String(ticket.estimateH)} aria-invalid={!!error} aria-describedby={error ? errId : undefined}
            onChange={(e) => { setDraft(e.target.value); setError(""); }}
            onBlur={save}
            onKeyDown={(e) => {
              if (isEscape(e)) { setDraft(null); setError(""); }
              else if (e.key === "Enter") save();
            }}
          />
          <span className="muted" aria-hidden>h</span>
        </label>
      </span>
      {error && <p id={errId} className="field-error" role="alert">{error}</p>}
    </>
  );
}

export function RequirementField({ ticket }: { ticket: Ticket }) {
  const { updateTicket } = useAppState();
  const { db } = useDb();
  // Dropped ones are out of scope — still shown if this ticket already points at one.
  const reqs = db.requirements.filter((r) => r.productKey === ticket.productKey && (r.status !== "dropped" || r.id === ticket.requirementId));
  return (
    <select
      className="meta-select" aria-label="Requirement" value={ticket.requirementId ?? ""}
      onChange={(e) => updateTicket(ticket.key, { requirementId: e.target.value || null })}
    >
      <option value="">None</option>
      {reqs.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}
    </select>
  );
}
