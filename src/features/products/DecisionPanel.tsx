"use client";

// One decision, opened — short and readable: status, title, who and when, why. Context, alternatives and consequences
// show only once written; related tickets and docs sit in one row. Managers and admins click any text to edit it in
// place (it saves when you leave it). Also the short "new decision" form.
import Link from "next/link";
import { FileText, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addDecision, updateDecision } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Decision, DecisionStatus, Doc } from "@/domain/types";
import type { DecisionPatch } from "@/data/commands";
import { docPath } from "@/features/docs/tree";
import { useAppState } from "@/features/shell/state";
import { TicketPickerList } from "@/features/tickets/TemplateRelations";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { Popover } from "@/ui/Popover";
import { Avatar } from "@/ui/primitives";
import { STATUS, StatusMenu, StatusPill, statusOf, tone } from "./DecisionStatus";

const EXTRAS = [
  { field: "context", label: "Context", hint: "What called for a decision?" },
  { field: "alternatives", label: "Alternatives", hint: "What else was considered, and why not?" },
  { field: "consequences", label: "Consequences", hint: "Trade-offs, risks, follow-ups." },
] as const;
type Extra = (typeof EXTRAS)[number]["field"];

/** Text that reads as text; if you may edit, click it to change it. Saves when you leave it; Escape puts it back. */
function EditableText({ label, value, editable, hint, startEditing = false, required = false, title = false, onSave, onDone }: {
  label: string; value: string; editable: boolean; hint?: string; startEditing?: boolean; required?: boolean; title?: boolean;
  onSave: (v: string) => boolean; onDone?: () => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [draft, setDraft] = useState(value);
  const stop = () => { setEditing(false); onDone?.(); };
  const commit = () => {
    const next = draft.trim();
    if (next !== value.trim() && (next || !required) && !onSave(next)) setDraft(value);
    stop();
  };
  const cls = `decision-text${title ? " is-title" : ""}`;
  if (editing) {
    return (
      <textarea
        autoFocus aria-label={label} className={`${cls} is-editing`} value={draft} placeholder={hint} rows={title ? 1 : 3} maxLength={title ? 140 : 8000}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setDraft(value); stop(); }
          if (title && e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        }}
      />
    );
  }
  if (!editable) return <p className={cls}>{value}</p>;
  return (
    <button type="button" className={`${cls} is-editable`} data-tip="Click to edit" onClick={() => { setDraft(value); setEditing(true); }}>
      {value || <span className="decision-text-hint">{hint}</span>}
    </button>
  );
}

/** Searchable list of docs to link, same look as the ticket picker. */
function DocPickerList({ candidates, onPick }: { candidates: Doc[]; onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = candidates.filter((d) => d.title.toLowerCase().includes(needle)).slice(0, 40);
  return (
    <>
      <label className="input tpl-picker-search">
        <input autoFocus placeholder="Search docs" aria-label="Search docs" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="tpl-picker-list" role="listbox" aria-label="Docs">
        {shown.map((d) => (
          <button key={d.id} type="button" role="option" aria-selected={false} className="menu-item tpl-picker-item" onClick={() => onPick(d.id)}>
            <span aria-hidden>{d.icon ?? <FileText />}</span><span className="tpl-ref-title">{d.title}</span>
          </button>
        ))}
        {!shown.length && <p className="tpl-picker-empty">{candidates.length ? `Nothing matches “${q}”` : "No docs to link"}</p>}
      </div>
    </>
  );
}

function AddLink({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  return (
    <Popover floating width={380} className="tpl-picker decision-picker" trigger={({ open, toggle }) => (
      <button type="button" className="decision-add-btn" aria-haspopup="dialog" aria-expanded={open} onClick={toggle}><Plus aria-hidden /> {label}</button>
    )}>
      {children}
    </Popover>
  );
}

export function DecisionPanel({ decision, onClose, onOpen }: { decision: Decision; onClose: () => void; onOpen: (id: string) => void }) {
  const { db, act, can, href, personById, productByKey } = useMe();
  const { openTicket } = useAppState();
  const product = productByKey(decision.productKey);
  const editable = !!product && can("decision.add", { product });
  const [adding, setAdding] = useState<Extra[]>([]);
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t instanceof HTMLSelectElement;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !typing(e.target)) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (patch: DecisionPatch) => !!act((d, m) => updateDecision(d, m, decision.id, patch));
  const status = statusOf(decision);
  const keys = decision.ticketKeys ?? [];
  const docIds = decision.docIds ?? [];
  const tickets = keys.map((k) => db.tickets.find((t) => t.key === k)).filter((t) => !!t);
  const docs = docIds.map((id) => db.docs.find((d) => d.id === id && !d.archivedAt)).filter((d) => !!d);
  const siblings = db.decisions.filter((d) => d.productKey === decision.productKey);
  const others = siblings.filter((d) => d.id !== decision.id);
  const replacedBy = decision.supersededBy ? db.decisions.find((d) => d.id === decision.supersededBy) : undefined;
  const replaces = others.filter((d) => d.supersededBy === decision.id);
  const shownExtras = EXTRAS.filter((x) => decision[x.field] || adding.includes(x.field));
  const missingExtras = EXTRAS.filter((x) => !shownExtras.includes(x));
  const linkableTickets = db.tickets.filter((t) => t.productKey === decision.productKey && !keys.includes(t.key));
  const linkableDocs = db.docs.filter((d) => !d.archivedAt && (d.productKey === decision.productKey || d.productKey === "") && !docIds.includes(d.id));
  const by = personById(decision.byId);

  return (
    <>
      <div className="scrim is-light" onClick={onClose} aria-hidden />
      <aside className="side-panel decision-panel" role="dialog" aria-modal="true" aria-labelledby="decision-panel-title">
        <header className="decision-panel-head">
          <div className="decision-panel-bar">
            {editable ? <StatusMenu decision={decision} siblings={siblings} variant="pill" /> : <StatusPill decision={decision} />}
            <span className="spacer" />
            <button type="button" className="docs-topbar-btn" aria-label="Close" data-tip="Close" onClick={onClose}><X aria-hidden /></button>
          </div>
          <h2 id="decision-panel-title" className="decision-panel-title">
            <EditableText key={decision.title} title label="Title" value={decision.title} editable={editable} required onSave={(v) => save({ title: v })} />
          </h2>
          <p className="decision-panel-meta">{by && <Avatar personId={by.id} size="sm" />} {by?.name ?? "Someone"} · {shortDate(decision.date)}</p>
          {replacedBy && <button type="button" className="decision-banner" onClick={() => onOpen(replacedBy.id)}>Replaced by <strong>{replacedBy.title}</strong> →</button>}
          {replaces.map((d) => <button key={d.id} type="button" className="decision-banner is-quiet" onClick={() => onOpen(d.id)}>Replaces <strong>{d.title}</strong> →</button>)}
          {editable && status === "superseded" && !decision.label && !replacedBy && others.length > 0 && (
            <label className="decision-replaced-pick">
              Replaced by
              <select className="decision-add-select" aria-label="Replaced by" value="" onChange={(e) => e.target.value && save({ supersededBy: e.target.value })}>
                <option value="">Pick the newer decision…</option>
                {others.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
              </select>
            </label>
          )}
        </header>

        <div className="decision-panel-body">
          <section className="decision-section">
            <h3 className="decision-section-label">Why</h3>
            <EditableText key={decision.why} label="Why" value={decision.why} editable={editable} required hint="What we decided, and why." onSave={(v) => save({ why: v })} />
          </section>

          {shownExtras.map((x) => (
            <section key={x.field} className="decision-section">
              <h3 className="decision-section-label">{x.label}</h3>
              <EditableText key={decision[x.field] ?? ""} label={x.label} value={decision[x.field] ?? ""} editable={editable} hint={x.hint}
                startEditing={adding.includes(x.field)} onSave={(v) => save({ [x.field]: v })}
                onDone={() => setAdding((cur) => cur.filter((f) => f !== x.field))} />
            </section>
          ))}

          {(tickets.length > 0 || docs.length > 0 || editable) && (
            <section className="decision-section">
              <h3 className="decision-section-label">Related</h3>
              <div className="decision-related">
                {tickets.map((t) => (
                  <span key={t.key} className="decision-linked">
                    <button type="button" className="doc-chip is-ticket" onClick={() => openTicket(t.key)}><TypeIcon type={t.type} /><span className="doc-chip-key">{t.key}</span><span className="doc-chip-title">{t.title}</span></button>
                    {editable && <button type="button" className="decision-unlink" aria-label={`Unlink ${t.key}`} data-tip="Unlink" onClick={() => save({ ticketKeys: keys.filter((k) => k !== t.key) })}><X aria-hidden /></button>}
                  </span>
                ))}
                {docs.map((d) => (
                  <span key={d.id} className="decision-linked">
                    <Link href={href(docPath(d))} className="doc-chip is-doc"><span aria-hidden>{d.icon ?? <FileText />}</span><span className="doc-chip-title">{d.title}</span></Link>
                    {editable && <button type="button" className="decision-unlink" aria-label={`Unlink ${d.title}`} data-tip="Unlink" onClick={() => save({ docIds: docIds.filter((x) => x !== d.id) })}><X aria-hidden /></button>}
                  </span>
                ))}
                {editable && (
                  <>
                    <AddLink label="Ticket">{(close) => <TicketPickerList candidates={linkableTickets} onPick={(k) => { close(); save({ ticketKeys: [...keys, k] }); }} emptyText="No more tickets in this project" />}</AddLink>
                    <AddLink label="Doc">{(close) => <DocPickerList candidates={linkableDocs} onPick={(id) => { close(); save({ docIds: [...docIds, id] }); }} />}</AddLink>
                  </>
                )}
              </div>
            </section>
          )}

          {editable && missingExtras.length > 0 && (
            <div className="decision-adds">
              {missingExtras.map((x) => (
                <button key={x.field} type="button" className="decision-add-btn is-quiet" onClick={() => setAdding((cur) => [...cur, x.field])}><Plus aria-hidden /> {x.label}</button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

/** "New decision": just what was decided and why; the rest is added on the decision itself, if it's worth it. */
export function NewDecision({ productKey, onClose }: { productKey: string; onClose: () => void }) {
  const { act } = useMe();
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({ title: "", why: "", status: "accepted" as DecisionStatus });
  const [errors, setErrors] = useState<{ title?: string; why?: string }>({});
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = { title: f.title.trim() ? undefined : "Give the decision a title.", why: f.why.trim() ? undefined : "Say why — future you will ask." };
    setErrors(next);
    if (next.title || next.why) return;
    const decisionId = crypto.randomUUID(); // named here so the server keeps the same id
    if (act((d, m) => addDecision(d, m, productKey, f, decisionId), { success: "Decision recorded" })) onClose();
  };

  return (
    <dialog ref={ref} className="confirm-dialog decision-dialog" aria-labelledby="new-decision-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form onSubmit={submit} noValidate>
        <h2 id="new-decision-title" className="confirm-title">Record a decision</h2>
        <label className="field">
          <span className="field-label">Decision</span>
          <span className="input"><input autoFocus value={f.title} onChange={(e) => setF((c) => ({ ...c, title: e.target.value }))} maxLength={140} placeholder="e.g. Use Postgres full-text search" aria-invalid={!!errors.title} /></span>
          {errors.title && <span className="field-error" role="alert">{errors.title}</span>}
        </label>
        <label className="field">
          <span className="field-label">Why</span>
          <textarea rows={3} value={f.why} onChange={(e) => setF((c) => ({ ...c, why: e.target.value }))} placeholder="One or two lines are enough." aria-invalid={!!errors.why} />
          {errors.why && <span className="field-error" role="alert">{errors.why}</span>}
        </label>
        <div className="decision-status-choice" role="radiogroup" aria-label="Status">
          {(["accepted", "proposed"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={f.status === s} style={tone(STATUS[s].color)} onClick={() => setF((c) => ({ ...c, status: s }))}>
              {s === "accepted" ? "Decided" : "Still open"}
            </button>
          ))}
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Plus aria-hidden /> Record decision</button>
        </div>
      </form>
    </dialog>
  );
}
