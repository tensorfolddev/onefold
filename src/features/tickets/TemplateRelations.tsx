"use client";

// Sections that point at other tickets: Dependencies ("blocked by" + the reverse "blocks"), and an epic's Tickets.
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useAppState } from "@/features/shell/state";
import { addDependency, createTicket, removeDependency, updateTicket } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import { epicLabel } from "@/domain/selectors/epics";
import type { Ticket } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { IconButton, Progress, StatusPill } from "@/ui/primitives";
import { TypeIcon } from "./TicketBits";

/** Done = a done or cancelled list; an epic is done when it has tickets and all of them are. */
export function useIsDone() {
  const { db, statusById } = useDb();
  const closed = (t: Ticket) => { const c = statusById(t.statusId)?.category; return c === "done" || c === "cancelled"; };
  return (t: Ticket) => {
    if (t.type !== "epic") return closed(t);
    const kids = db.tickets.filter((x) => x.epicKey === t.key);
    return kids.length > 0 && kids.every(closed);
  };
}

function TicketRow({ t, onRemove, removeLabel }: { t: Ticket; onRemove?: () => void; removeLabel?: string }) {
  const { db, statusById } = useDb();
  const { openTicket } = useAppState();
  const isDone = useIsDone();
  const status = t.type === "epic" ? undefined : statusById(t.statusId);
  return (
    <li className="tpl-ref" data-done={isDone(t) || undefined}>
      <button type="button" className="tpl-ref-open" onClick={() => openTicket(t.key)} title={`Open ${t.key}`}>
        <TypeIcon type={t.type} />
        <span className="key">{t.key}</span>
        <span className="tpl-ref-title">{t.title}</span>
      </button>
      {status ? <StatusPill name={status.name} tone={status.tone} /> : <span className="tpl-ref-epic">{epicLabel(db, t)}</span>}
      {onRemove && <span className="tpl-item-x"><IconButton label={removeLabel ?? "Remove"} onClick={onRemove}><X /></IconButton></span>}
    </li>
  );
}

/** "+ Add …" with a searchable list of tickets. */
function TicketPicker({ label, candidates, onPick }: { label: string; candidates: Ticket[]; onPick: (key: string) => void }) {
  return (
    <Popover
      width={380} className="tpl-picker"
      trigger={({ open, toggle }) => (
        <button type="button" className="tpl-add-btn" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}><Plus aria-hidden /> {label}</button>
      )}
    >
      {(close) => <TicketPickerList candidates={candidates} onPick={(k) => { close(); onPick(k); }} />}
    </Popover>
  );
}

/** Searchable list of tickets (key, title, status). Also used by the Time page's Start timer / Add ticket menus. */
export function TicketPickerList({ candidates, onPick, emptyText }: { candidates: Ticket[]; onPick: (key: string) => void; emptyText?: string }) {
  const { statusById } = useDb();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = candidates.filter((t) => !needle || `${t.key} ${t.title}`.toLowerCase().includes(needle)).slice(0, 40);
  return (
    <>
      <label className="input tpl-picker-search">
        <input autoFocus placeholder="Search by key or title" aria-label="Search tickets" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="tpl-picker-list" role="listbox" aria-label="Tickets">
        {shown.map((t) => {
          const s = t.type === "epic" ? undefined : statusById(t.statusId);
          return (
            <button key={t.key} type="button" role="option" aria-selected={false} className="menu-item tpl-picker-item" onClick={() => onPick(t.key)}>
              <TypeIcon type={t.type} /><span className="key">{t.key}</span><span className="tpl-ref-title">{t.title}</span>
              {s && <StatusPill name={s.name} tone={s.tone} />}
            </button>
          );
        })}
        {!shown.length && <p className="tpl-picker-empty">{candidates.length ? `Nothing matches “${q}”` : emptyText ?? "No tickets to pick"}</p>}
      </div>
    </>
  );
}

export function DependenciesSection({ ticket, editable }: { ticket: Ticket; editable: boolean }) {
  const { db, act, can, productByKey } = useDb();
  const deps = (ticket.dependsOn ?? []).map((k) => db.tickets.find((t) => t.key === k)).filter((t): t is Ticket => !!t);
  const blocks = db.tickets.filter((t) => t.dependsOn?.includes(ticket.key));
  const visible = (t: Ticket) => { const p = productByKey(t.productKey); return !!p && can("product.view", { product: p }); };
  // This product first; anything you can see is allowed. The store refuses loops with a clear message.
  const candidates = db.tickets
    .filter((t) => t.key !== ticket.key && !ticket.dependsOn?.includes(t.key) && visible(t))
    .sort((a, b) => Number(b.productKey === ticket.productKey) - Number(a.productKey === ticket.productKey));

  return (
    <>
      {!deps.length && <p className={editable ? "tpl-hint" : "tpl-empty"}>{editable ? "Nothing has to happen first. Add the tickets this one waits on." : "No dependencies"}</p>}
      {deps.length > 0 && (
        <>
          <p className="tpl-sub">Blocked by</p>
          <ul className="tpl-refs">
            {deps.map((t) => (
              <TicketRow key={t.key} t={t} removeLabel={`Remove dependency on ${t.key}`}
                onRemove={editable ? () => act((d, m) => removeDependency(d, m, ticket.key, t.key)) : undefined} />
            ))}
          </ul>
        </>
      )}
      {editable && (
        <TicketPicker label="Add a ticket this waits on" candidates={candidates}
          onPick={(k) => act((d, m) => addDependency(d, m, ticket.key, k), { success: `${ticket.key} now waits on ${k}` })} />
      )}
      {blocks.length > 0 && (
        <>
          <p className="tpl-sub">Blocks</p>
          <ul className="tpl-refs">{blocks.map((t) => <TicketRow key={t.key} t={t} />)}</ul>
        </>
      )}
    </>
  );
}

export function EpicTicketsSection({ epic, editable }: { epic: Ticket; editable: boolean }) {
  const { db, act } = useDb();
  const isDone = useIsDone();
  const [title, setTitle] = useState("");
  const kids = db.tickets.filter((t) => t.epicKey === epic.key);
  const done = kids.filter(isDone).length;
  const others = db.tickets.filter((t) => t.productKey === epic.productKey && t.type !== "epic" && t.epicKey !== epic.key);
  const create = () => {
    const name = title.trim();
    if (!name) return;
    const ok = act((d, m) => {
      const made = createTicket(d, m, epic.productKey, name);
      return { db: updateTicket(made.db, m, made.key, { epicKey: epic.key }), key: made.key };
    }, { success: "Ticket added to the epic" });
    if (ok) setTitle("");
  };

  return (
    <>
      {kids.length > 0 ? (
        <>
          <div className="tpl-progress"><Progress pct={(done / kids.length) * 100} /> <span>{done} of {kids.length} done</span></div>
          <ul className="tpl-refs">
            {kids.map((t) => (
              <TicketRow key={t.key} t={t} removeLabel={`Take ${t.key} out of this epic`}
                onRemove={editable ? () => act((d, m) => updateTicket(d, m, t.key, { epicKey: undefined })) : undefined} />
            ))}
          </ul>
        </>
      ) : <p className={editable ? "tpl-hint" : "tpl-empty"}>{editable ? "No tickets yet. Add existing ones or create the first." : "No tickets yet"}</p>}
      {editable && (
        <div className="tpl-epic-add">
          <form className="tpl-add" onSubmit={(e) => { e.preventDefault(); create(); }}>
            <Plus aria-hidden />
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="New ticket in this epic"
              placeholder="New ticket in this epic — Enter to create" />
          </form>
          <TicketPicker label="Add existing ticket" candidates={others}
            onPick={(k) => act((d, m) => updateTicket(d, m, k, { epicKey: epic.key }), { success: `${k} added to ${epic.key}` })} />
        </div>
      )}
    </>
  );
}
