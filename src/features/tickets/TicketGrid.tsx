"use client";

import { useState } from "react";
import { Archive, ChevronDown, ChevronRight, Maximize2 } from "lucide-react";
import { useAppState } from "@/features/shell/state";
import { archiveTickets } from "@/data/commands";
import { CATEGORY_LABEL, CATEGORY_ORDER, CATEGORY_TONE, formatHours, shortDate, toneVar } from "@/domain/status";
import type { StatusCategory, Ticket, Tone } from "@/domain/types";
import { StatusCell } from "@/ui/StatusCell";
import { Avatar, Battery, IconButton } from "@/ui/primitives";
import { DueDate, EpicChip, PrBadge, PriorityCell, requirementById, TypeIcon } from "./TicketBits";
import { useDb } from "@/data/StoreProvider";

const COLUMNS = [
  { id: "ticket", label: "Ticket" },
  { id: "owner", label: "Owner" },
  { id: "status", label: "Status" },
  { id: "priority", label: "Priority" },
  { id: "due", label: "Due" },
  { id: "time", label: "Estimate" },
  { id: "req", label: "Requirement" },
  { id: "pr", label: "PR" },
];

/** Table view: one group per status category (monday groups), rows 36px, full-bleed status cells. */
export function TicketGrid({ tickets }: { tickets: Ticket[] }) {
  const { statusById, productByKey, can, act } = useDb();
  const [collapsed, setCollapsed] = useState<StatusCategory[]>([]);
  const [picked, setSelected] = useState<string[]>([]);
  // Only rows still on screen count (filters can hide picked rows).
  const selected = picked.filter((k) => tickets.some((t) => t.key === k));
  // Archived, never deleted from here (Undo is in the toast); an admin deletes for good from Settings → Archived.
  const canArchive = tickets
    .filter((t) => selected.includes(t.key))
    .every((t) => can("ticket.archive", { product: productByKey(t.productKey) }));
  const n = selected.length;
  const archive = () => {
    const keys = selected;
    if (act((d, m) => archiveTickets(d, m, keys), { success: `${n === 1 ? keys[0] : `${n} tickets`} archived — find them in Settings → Archived`, undoable: true })) {
      setSelected([]);
    }
  };

  const groups = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: tickets.filter((t) => statusById(t.statusId)?.category === cat),
  })).filter((g) => g.items.length > 0);

  const toggleGroup = (cat: StatusCategory) =>
    setCollapsed((c) => (c.includes(cat) ? c.filter((x) => x !== cat) : [...c, cat]));
  const select = (keys: string[], on: boolean) =>
    setSelected((s) => (on ? [...new Set([...s, ...keys])] : s.filter((k) => !keys.includes(k))));

  return (
    <div className="ticket-grid">
      {n > 0 && (
        <div className="selection-bar" role="region" aria-label="Selected tickets">
          <span className="selection-count" aria-live="polite">{n} selected</span>
          {canArchive && (
            <button type="button" className="btn btn-tertiary" onClick={archive}>
              <Archive aria-hidden /> Archive
            </button>
          )}
          <button type="button" className="btn btn-tertiary" onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}
      {groups.map(({ cat, items }) => (
        <GridGroup
          key={cat} category={cat} items={items}
          collapsed={collapsed.includes(cat)} onToggle={() => toggleGroup(cat)}
          selected={selected} onSelect={select}
        />
      ))}
    </div>
  );
}

function GridGroup({
  category, items, collapsed, onToggle, selected, onSelect,
}: {
  category: StatusCategory; items: Ticket[]; collapsed: boolean; onToggle: () => void;
  selected: string[]; onSelect: (keys: string[], on: boolean) => void;
}) {
  const label = CATEGORY_LABEL[category];
  const keys = items.map((t) => t.key);
  const allOn = keys.every((k) => selected.includes(k));

  return (
    <section className="grid-group" style={{ "--group": toneVar(CATEGORY_TONE[category]) } as React.CSSProperties}>
      <header className="group-header">
        <button
          type="button" className="group-toggle" aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${label}`} onClick={onToggle}
        >
          {collapsed ? <ChevronRight aria-hidden /> : <ChevronDown aria-hidden />}
        </button>
        <h2 className="group-title">{label}</h2>
        <span className="group-count">{items.length} {items.length === 1 ? "ticket" : "tickets"}</span>
      </header>
      {!collapsed && (
        <div className="group-body">
          <span className="group-bar" aria-hidden />
          <div className="grid-table" role="table" aria-label={`${label} tickets`}>
            <div className="grid-row grid-head" role="row">
              <span className="grid-cell col-check" role="columnheader">
                <input
                  type="checkbox" className="checkbox" checked={allOn}
                  aria-label={`Select all ${label} tickets`} onChange={() => onSelect(keys, !allOn)}
                />
              </span>
              {COLUMNS.map((c) => (
                <span key={c.id} className={`grid-cell col-${c.id}`} role="columnheader">{c.label}</span>
              ))}
            </div>
            {items.map((t) => (
              <GridRow key={t.key} ticket={t} selected={selected.includes(t.key)} onSelect={(on) => onSelect([t.key], on)} />
            ))}
            <SummaryRow items={items} />
          </div>
        </div>
      )}
    </section>
  );
}

function GridRow({ ticket, selected, onSelect }: { ticket: Ticket; selected: boolean; onSelect: (on: boolean) => void }) {
  const { openTicket, openTicketKey } = useAppState();
  const { db, statusById } = useDb();
  const done = statusById(ticket.statusId)?.category === "done";
  const req = requirementById(db.requirements, ticket.requirementId);
  const open = () => openTicket(ticket.key);

  return (
    <div role="row" className={`grid-row${openTicketKey === ticket.key ? " is-open" : ""}${selected ? " is-selected" : ""}`}>
      <span className="grid-cell col-check" role="cell">
        <input
          type="checkbox" className="checkbox" checked={selected}
          aria-label={`Select ${ticket.key}`} onChange={() => onSelect(!selected)}
        />
      </span>
      <span className="grid-cell col-ticket" role="rowheader">
        <TypeIcon type={ticket.type} />
        <span className="key">{ticket.key}</span>
        <button type="button" className="ticket-title" onClick={open}>{ticket.title}</button>
        <EpicChip ticket={ticket} />
        <span className="row-expand">
          <IconButton label="Open ticket" onClick={open}><Maximize2 /></IconButton>
        </span>
      </span>
      <span className="grid-cell col-owner" role="cell"><Avatar personId={ticket.assigneeId} size="sm" /></span>
      <span className="grid-cell col-status" role="cell"><StatusCell ticket={ticket} /></span>
      <span className="grid-cell col-priority" role="cell"><PriorityCell priority={ticket.priority} /></span>
      <span className="grid-cell col-due" role="cell"><DueDate ticket={ticket} done={done} /></span>
      <span className="grid-cell col-time" role="cell">
        <span className="time-text">{ticket.estimateH ? formatHours(ticket.estimateH) : "—"}</span>
      </span>
      <span className="grid-cell col-req" role="cell">
        {req ? <span className="chip sm" title={req.title}>{req.code}</span> : <span className="muted">—</span>}
      </span>
      <span className="grid-cell col-pr" role="cell"><PrBadge pr={ticket.pr} /></span>
    </div>
  );
}

/** Group footer (monday summary row): status battery + due-date range. */
function SummaryRow({ items }: { items: Ticket[] }) {
  const { statusById } = useDb();
  const counts = new Map<Tone, number>();
  for (const t of items) {
    const tone = statusById(t.statusId)?.tone;
    if (tone) counts.set(tone, (counts.get(tone) ?? 0) + 1);
  }
  const segments = [...counts].map(([tone, value]) => ({ tone, value }));
  const dues = items.map((t) => t.due).filter((d): d is string => !!d).sort();
  const range = dues.length
    ? dues[0] === dues[dues.length - 1] ? shortDate(dues[0]) : `${shortDate(dues[0])} – ${shortDate(dues[dues.length - 1])}`
    : null;

  return (
    <div className="grid-row grid-summary" role="row">
      <span className="grid-cell col-check" role="cell" />
      <span className="grid-cell col-ticket" role="cell" />
      <span className="grid-cell col-owner" role="cell" />
      <span className="grid-cell col-status" role="cell">
        <Battery segments={segments} label={segments.map((s) => `${s.value} ${s.tone}`).join(", ")} />
      </span>
      <span className="grid-cell col-priority" role="cell" />
      <span className="grid-cell col-due" role="cell">
        {range && <span className="range-pill">{range}</span>}
      </span>
      <span className="grid-cell col-time" role="cell" />
      <span className="grid-cell col-req" role="cell" />
      <span className="grid-cell col-pr" role="cell" />
    </div>
  );
}
