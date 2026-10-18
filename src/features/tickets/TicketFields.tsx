"use client";

import { useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAppState } from "@/features/shell/state";
import { isOnProduct } from "@/domain/permissions";
import { useDb } from "@/data/StoreProvider";
import { epicLabel, epicsOf } from "@/domain/selectors/epics";
import type { Priority, Product, Ticket } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { Avatar, IconButton } from "@/ui/primitives";
import { isOverdue, PRIORITY_LABEL } from "./TicketBits";

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

export function EpicField({ ticket }: { ticket: Ticket }) {
  const { updateTicket } = useAppState();
  const { db } = useDb();
  const epics = epicsOf(db, ticket.productKey);
  return (
    <select className="meta-select" aria-label="Epic" value={ticket.epicKey ?? ""}
      onChange={(e) => updateTicket(ticket.key, { epicKey: e.target.value || undefined })}>
      <option value="">No epic</option>
      {epics.map((t) => <option key={t.key} value={t.key}>{epicLabel(db, t)} · {t.title}</option>)}
    </select>
  );
}

export function AssigneeField({ ticket, product }: { ticket: Ticket; product: Product }) {
  const { updateTicket } = useAppState();
  const { db, personById } = useDb();
  const people = db.people.filter((p) => p.active && isOnProduct(p.id, product));
  const current = personById(ticket.assigneeId);
  const pick = (id: string | undefined, close: () => void) => {
    if (id !== ticket.assigneeId) updateTicket(ticket.key, { assigneeId: id });
    close();
  };

  return (
    <Popover
      width={240} className="assignee-menu"
      trigger={({ open, toggle }) => (
        <button
          type="button" className={`btn btn-tertiary meta-trigger${open ? " is-open" : ""}`}
          aria-haspopup="menu" aria-expanded={open} onClick={toggle}
          aria-label={`Assignee: ${current?.name ?? "Unassigned"}. Change assignee`}
        >
          <Avatar personId={ticket.assigneeId} size="sm" /> {current?.name ?? "Unassigned"}
        </button>
      )}
    >
      {(close) => (
        <>
          <button
            type="button" role="menuitemradio" aria-checked={!ticket.assigneeId}
            className={`menu-item${!ticket.assigneeId ? " is-selected" : ""}`} onClick={() => pick(undefined, close)}
          >
            <Avatar size="sm" /> Unassigned
          </button>
          {people.map((p) => (
            <button
              key={p.id} type="button" role="menuitemradio" aria-checked={p.id === ticket.assigneeId}
              className={`menu-item${p.id === ticket.assigneeId ? " is-selected" : ""}`} onClick={() => pick(p.id, close)}
            >
              <Avatar personId={p.id} size="sm" /> {p.name}
            </button>
          ))}
        </>
      )}
    </Popover>
  );
}

export function PriorityField({ ticket }: { ticket: Ticket }) {
  const { updateTicket } = useAppState();
  return (
    <Popover
      width={160} className="priority-menu"
      trigger={({ open, toggle }) => (
        <button
          type="button" className="priority-cell" data-priority={ticket.priority}
          aria-haspopup="menu" aria-expanded={open} onClick={toggle}
          aria-label={`Priority: ${PRIORITY_LABEL[ticket.priority]}. Change priority`}
        >
          {PRIORITY_LABEL[ticket.priority]}
        </button>
      )}
    >
      {(close) =>
        PRIORITIES.map((pr) => (
          <button
            key={pr} type="button" role="menuitemradio" aria-checked={pr === ticket.priority}
            className="menu-item" data-priority={pr}
            onClick={() => { if (pr !== ticket.priority) updateTicket(ticket.key, { priority: pr }); close(); }}
          >
            {PRIORITY_LABEL[pr]}
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
      {ticket.due && <IconButton label="Clear due date" onClick={() => updateTicket(ticket.key, { due: undefined })}><X /></IconButton>}
    </>
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
  const reqs = db.requirements.filter((r) => r.productKey === ticket.productKey);
  return (
    <select
      className="meta-select" aria-label="Requirement" value={ticket.requirementId ?? ""}
      onChange={(e) => updateTicket(ticket.key, { requirementId: e.target.value || undefined })}
    >
      <option value="">None</option>
      {reqs.map((r) => <option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}
    </select>
  );
}
