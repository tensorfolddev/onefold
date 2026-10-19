"use client";

// One decision, opened: its status, the four parts of a decision record (context, the decision and why, alternatives,
// consequences), what it's linked to (tickets, docs) and what replaced it. Managers and admins edit it in place —
// each part saves when you leave it. Also the "new decision" form.
import Link from "next/link";
import { FileText, Plus, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { addDecision, updateDecision } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate, relativeTime } from "@/domain/status";
import type { Decision, DecisionStatus } from "@/domain/types";
import { docPath } from "@/features/docs/tree";
import { useAppState } from "@/features/shell/state";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { Avatar } from "@/ui/primitives";

export const STATUS: Record<DecisionStatus, { label: string; color: string }> = {
  accepted: { label: "Accepted", color: "#00c875" },
  proposed: { label: "Proposed", color: "#fdab3d" },
  rejected: { label: "Rejected", color: "#e2445c" },
  superseded: { label: "Superseded", color: "#9699a6" },
};
export const statusOf = (d: Decision): DecisionStatus => d.status ?? "accepted";

const PARTS = [
  { field: "context", label: "Context", hint: "What called for a decision — the problem, the constraints." },
  { field: "why", label: "Decision", hint: "What we decided, and why." },
  { field: "alternatives", label: "Alternatives considered", hint: "What else was on the table, and why not." },
  { field: "consequences", label: "Consequences", hint: "What it means: trade-offs, risks, follow-ups." },
] as const;

export function StatusPill({ status }: { status: DecisionStatus }) {
  return <span className="decision-status" style={{ "--status": STATUS[status].color } as React.CSSProperties}>{STATUS[status].label}</span>;
}

/** A text part that saves when you leave it (Escape puts it back). */
function Part({ label, hint, value, editable, required, onSave }: {
  label: string; hint: string; value: string; editable: boolean; required?: boolean; onSave: (v: string) => boolean;
}) {
  const [draft, setDraft] = useState(value);
  const id = useId();
  useEffect(() => setDraft(value), [value]); // eslint-disable-line react-hooks/set-state-in-effect -- someone else changed it
  return (
    <section className="decision-part">
      <label className="decision-part-label" htmlFor={id}>{label}</label>
      {editable ? (
        <textarea
          id={id} className="decision-part-input" rows={3} value={draft} placeholder={hint}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { if (draft.trim() === value.trim()) return; if (required && !draft.trim()) { setDraft(value); return; } if (!onSave(draft)) setDraft(value); }}
          onKeyDown={(e) => { if (e.key === "Escape") { setDraft(value); (e.target as HTMLTextAreaElement).blur(); } }}
        />
      ) : value ? <p className="decision-part-text">{value}</p> : <p className="decision-part-empty">{hint}</p>}
    </section>
  );
}

export function DecisionPanel({ decision, onClose, onOpen }: { decision: Decision; onClose: () => void; onOpen: (id: string) => void }) {
  const { db, act, can, href, personById, productByKey } = useMe();
  const { openTicket } = useAppState();
  const product = productByKey(decision.productKey);
  const editable = !!product && can("decision.add", { product });
  const [title, setTitle] = useState(decision.title);
  useEffect(() => setTitle(decision.title), [decision.title]); // eslint-disable-line react-hooks/set-state-in-effect -- someone else renamed it
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !(e.target instanceof HTMLTextAreaElement)) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = (patch: Parameters<typeof updateDecision>[3]) => !!act((d, m) => updateDecision(d, m, decision.id, patch));
  const status = statusOf(decision);
  const tickets = (decision.ticketKeys ?? []).map((k) => db.tickets.find((t) => t.key === k)).filter((t) => !!t);
  const docs = (decision.docIds ?? []).map((id) => db.docs.find((d) => d.id === id && !d.archivedAt)).filter((d) => !!d);
  const others = db.decisions.filter((d) => d.productKey === decision.productKey && d.id !== decision.id);
  const replacedBy = decision.supersededBy ? db.decisions.find((d) => d.id === decision.supersededBy) : undefined;
  const replaces = others.filter((d) => d.supersededBy === decision.id);
  const linkableTickets = db.tickets.filter((t) => t.productKey === decision.productKey && !(decision.ticketKeys ?? []).includes(t.key));
  const linkableDocs = db.docs.filter((d) => !d.archivedAt && (d.productKey === decision.productKey || d.productKey === "") && !(decision.docIds ?? []).includes(d.id));

  return (
    <>
      <div className="scrim is-light" onClick={onClose} aria-hidden />
      <aside className="side-panel decision-panel" role="dialog" aria-modal="true" aria-labelledby="decision-panel-title">
        <header className="decision-panel-head">
          <div className="decision-panel-bar">
            {editable ? (
              <select className="decision-status-select" aria-label="Status" value={status} style={{ "--status": STATUS[status].color } as React.CSSProperties}
                onChange={(e) => save({ status: e.target.value as DecisionStatus, ...(e.target.value !== "superseded" && { supersededBy: null }) })}>
                {(Object.keys(STATUS) as DecisionStatus[]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
              </select>
            ) : <StatusPill status={status} />}
            <span className="spacer" />
            <button type="button" className="docs-topbar-btn" aria-label="Close" data-tip="Close" onClick={onClose}><X aria-hidden /></button>
          </div>
          {editable ? (
            <textarea id="decision-panel-title" className="decision-panel-title" rows={1} value={title} maxLength={140} aria-label="Decision title"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => { if (title.trim() && title.trim() !== decision.title) { if (!save({ title })) setTitle(decision.title); } else setTitle(decision.title); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }} />
          ) : <h2 id="decision-panel-title" className="decision-panel-title">{decision.title}</h2>}
          <p className="decision-panel-meta">
            <Avatar personId={decision.byId} size="sm" /> Decided by {personById(decision.byId)?.name ?? "someone"} · {shortDate(decision.date)}
            {decision.updatedAt && <> · updated {relativeTime(decision.updatedAt)} ago</>}
          </p>
          {replacedBy && (
            <button type="button" className="decision-banner" onClick={() => onOpen(replacedBy.id)}>
              Superseded by <strong>{replacedBy.title}</strong> →
            </button>
          )}
        </header>

        <div className="decision-panel-body">
          {PARTS.map((p) => (
            <Part key={p.field} label={p.label} hint={p.hint} editable={editable} required={p.field === "why"}
              value={(decision[p.field] as string | undefined) ?? ""} onSave={(v) => save({ [p.field]: v })} />
          ))}

          <section className="decision-part">
            <p className="decision-part-label">Linked tickets</p>
            <div className="decision-links">
              {tickets.map((t) => (
                <span key={t.key} className="decision-linked">
                  <button type="button" className="doc-chip is-ticket" onClick={() => openTicket(t.key)}><TypeIcon type={t.type} /><span className="doc-chip-key">{t.key}</span><span className="doc-chip-title">{t.title}</span></button>
                  {editable && <button type="button" className="decision-unlink" aria-label={`Unlink ${t.key}`} data-tip="Unlink" onClick={() => save({ ticketKeys: (decision.ticketKeys ?? []).filter((k) => k !== t.key) })}><X aria-hidden /></button>}
                </span>
              ))}
              {!tickets.length && !(editable && linkableTickets.length) && <p className="decision-part-empty">None yet — link tickets this decision drives.</p>}
              {editable && linkableTickets.length > 0 && (
                <select className="decision-add" aria-label="Link a ticket" value="" onChange={(e) => e.target.value && save({ ticketKeys: [...(decision.ticketKeys ?? []), e.target.value] })}>
                  <option value="">+ Link a ticket…</option>
                  {linkableTickets.map((t) => <option key={t.key} value={t.key}>{t.key} · {t.title}</option>)}
                </select>
              )}
            </div>
          </section>

          <section className="decision-part">
            <p className="decision-part-label">Linked docs</p>
            <div className="decision-links">
              {docs.map((d) => (
                <span key={d.id} className="decision-linked">
                  <Link href={href(docPath(d))} className="doc-chip is-doc"><span aria-hidden>{d.icon ?? <FileText />}</span><span className="doc-chip-title">{d.title}</span></Link>
                  {editable && <button type="button" className="decision-unlink" aria-label={`Unlink ${d.title}`} data-tip="Unlink" onClick={() => save({ docIds: (decision.docIds ?? []).filter((x) => x !== d.id) })}><X aria-hidden /></button>}
                </span>
              ))}
              {!docs.length && !(editable && linkableDocs.length) && <p className="decision-part-empty">None yet — link the specs or notes behind it.</p>}
              {editable && linkableDocs.length > 0 && (
                <select className="decision-add" aria-label="Link a doc" value="" onChange={(e) => e.target.value && save({ docIds: [...(decision.docIds ?? []), e.target.value] })}>
                  <option value="">+ Link a doc…</option>
                  {linkableDocs.map((d) => <option key={d.id} value={d.id}>{d.icon ? `${d.icon} ` : ""}{d.title}</option>)}
                </select>
              )}
            </div>
          </section>

          {(editable || replaces.length > 0) && (
            <section className="decision-part">
              <p className="decision-part-label">Supersedes · superseded by</p>
              {replaces.map((d) => <button key={d.id} type="button" className="decision-banner is-quiet" onClick={() => onOpen(d.id)}>Replaces <strong>{d.title}</strong> →</button>)}
              {editable && others.length > 0 && (
                <select className="decision-add" aria-label="Superseded by" value={decision.supersededBy ?? ""}
                  onChange={(e) => save({ supersededBy: e.target.value || null, ...(!e.target.value && { status: "accepted" as const }) })}>
                  <option value="">Not superseded</option>
                  {others.map((d) => <option key={d.id} value={d.id}>Superseded by: {d.title}</option>)}
                </select>
              )}
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

/** "New decision": the same parts as the record; the decision itself (and why) is required. */
export function NewDecision({ productKey, onClose }: { productKey: string; onClose: () => void }) {
  const { act } = useMe();
  const ref = useRef<HTMLDialogElement>(null);
  const [f, setF] = useState({ title: "", status: "accepted" as DecisionStatus, context: "", why: "", alternatives: "", consequences: "" });
  const [errors, setErrors] = useState<{ title?: string; why?: string }>({});
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = { title: f.title.trim() ? undefined : "Give the decision a title.", why: f.why.trim() ? undefined : "Say what you decided and why — future you will ask." };
    setErrors(next);
    if (next.title || next.why) return;
    const decisionId = crypto.randomUUID(); // named here so the server keeps the same id
    if (act((d, m) => addDecision(d, m, productKey, f, decisionId), { success: "Decision recorded" })) onClose();
  };
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  return (
    <dialog ref={ref} className="confirm-dialog decision-dialog" aria-labelledby="new-decision-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form onSubmit={submit} noValidate>
        <h2 id="new-decision-title" className="confirm-title">Record a decision</h2>
        <label className="field">
          <span className="field-label">Decision</span>
          <span className="input"><input autoFocus value={f.title} onChange={set("title")} maxLength={140} placeholder="e.g. Use Postgres full-text search, not Elasticsearch" aria-invalid={!!errors.title} /></span>
          {errors.title && <span className="field-error" role="alert">{errors.title}</span>}
        </label>
        <div className="decision-status-choice" role="radiogroup" aria-label="Status">
          {(["accepted", "proposed"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={f.status === s} style={{ "--status": STATUS[s].color } as React.CSSProperties}
              onClick={() => setF((cur) => ({ ...cur, status: s }))}>{s === "accepted" ? "Decided" : "Proposed — still open"}</button>
          ))}
        </div>
        {PARTS.map((p) => (
          <label key={p.field} className="field">
            <span className="field-label">{p.field === "why" ? "Why" : `${p.label} (optional)`}</span>
            <textarea className="decision-part-input" rows={p.field === "why" ? 3 : 2} value={f[p.field]} onChange={set(p.field)} placeholder={p.hint} aria-invalid={p.field === "why" && !!errors.why} />
            {p.field === "why" && errors.why && <span className="field-error" role="alert">{errors.why}</span>}
          </label>
        ))}
        <div className="confirm-actions">
          <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Plus aria-hidden /> Record decision</button>
        </div>
      </form>
    </dialog>
  );
}
