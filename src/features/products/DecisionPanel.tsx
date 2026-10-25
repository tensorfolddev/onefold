"use client";

// One decision, opened: status, title, who and when, then the decision written freely in the docs editor (headings,
// bold, tables, images, @people, tickets, docs — type / for everything), saved as you type; related tickets and docs
// sit in one row. Managers and admins edit; everyone on the project reads. Also the short "new decision" form.
import dynamic from "next/dynamic";
import Link from "next/link";
import { Archive, FileText, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { addDecision, archiveDecisions, updateDecision } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Decision, DecisionStatus, Doc } from "@/domain/types";
import type { DecisionPatch } from "@/data/commands";
import { useEditorLinks, useUpload } from "@/features/docs/editor/useEditorLinks";
import { docPath } from "@/features/docs/tree";
import { useAppState } from "@/features/shell/state";
import { TicketPickerList } from "@/features/tickets/TemplateRelations";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { Popover } from "@/ui/Popover";
import { Avatar } from "@/ui/primitives";
import { STATUS, StatusMenu, StatusPill, statusOf, tone } from "./DecisionStatus";

const DocEditor = dynamic(() => import("@/features/docs/editor/DocEditor"), { ssr: false, loading: () => <div className="doc-skeleton" aria-busy="true" /> });
const SAVE_AFTER_MS = 800;

/** A decision recorded before free text: its parts, as the text to start from. */
export const legacyBody = (d: Decision) => [d.why, d.context && `## Context\n\n${d.context}`,
  d.alternatives && `## Alternatives\n\n${d.alternatives}`, d.consequences && `## Consequences\n\n${d.consequences}`].filter(Boolean).join("\n\n");

/** The decision's text, in the docs editor; saved a moment after you stop typing, and when you close it. */
function DecisionBody({ decision, editable }: { decision: Decision; editable: boolean }) {
  const { act } = useMe();
  const links = useEditorLinks(decision.productKey);
  const uploadFile = useUpload({ decision: decision.id });
  const [initial] = useState(() => decision.body ?? legacyBody(decision)); // loaded once; what's typed after is ours
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const md = pending.current;
    pending.current = null;
    if (md !== null) act((d, m) => updateDecision(d, m, decision.id, { body: md }));
  }, [act, decision.id]);
  const onChange = useCallback((md: string) => {
    if (md === initial && decision.body === undefined) return; // just opened: don't rewrite an old decision unasked
    pending.current = md;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_AFTER_MS);
  }, [flush, initial, decision.body]);
  useEffect(() => flush, [flush]); // closing it: save what was typed
  return (
    <div className="decision-body">
      <DocEditor body={initial} editable={editable} onChange={onChange} links={links} uploadFile={editable ? uploadFile : undefined}
        placeholder={editable ? "Write it your way — type / for headings, tables, images, @people, tickets, docs…" : "Nothing written yet."} />
    </div>
  );
}

/** Text that reads as text; if you may edit, click it to change it. Saves when you leave it; Escape puts it back. */
export function EditableText({ label, value, editable, hint, startEditing = false, required = false, title = false, onSave, onDone }: {
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

export function AddLink({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
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
  const siblings = db.decisions.filter((d) => d.productKey === decision.productKey && !d.archivedAt);
  const others = siblings.filter((d) => d.id !== decision.id);
  const replacedBy = decision.supersededBy ? db.decisions.find((d) => d.id === decision.supersededBy) : undefined;
  const replaces = others.filter((d) => d.supersededBy === decision.id);
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
            {editable && (
              <button type="button" className="docs-topbar-btn" aria-label="Archive decision" data-tip="Archive" onClick={() => {
                onClose();
                act((d, m) => archiveDecisions(d, m, [decision.id]), { success: `“${decision.title}” archived — it's in Settings → Archived`, undoable: true });
              }}><Archive aria-hidden /></button>
            )}
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
          <DecisionBody key={decision.id} decision={decision} editable={editable} />

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

        </div>
      </aside>
    </>
  );
}

/** "New decision": just its title and whether it's decided; it then opens, to be written however you like. */
export function NewDecision({ productKey, onClose, onCreated }: { productKey: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { act } = useMe();
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<DecisionStatus>("accepted");
  const [error, setError] = useState<string>();
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Give the decision a title."); return; }
    const decisionId = crypto.randomUUID(); // named here so the server keeps the same id
    if (act((d, m) => addDecision(d, m, productKey, { title, status }, decisionId), { success: "Decision recorded" })) onCreated(decisionId);
  };

  return (
    <dialog ref={ref} className="confirm-dialog decision-dialog" aria-labelledby="new-decision-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form onSubmit={submit} noValidate>
        <h2 id="new-decision-title" className="confirm-title">Record a decision</h2>
        <label className="field">
          <span className="field-label">Decision</span>
          <span className="input"><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="e.g. Use Postgres full-text search" aria-invalid={!!error} /></span>
          {error && <span className="field-error" role="alert">{error}</span>}
        </label>
        <div className="decision-status-choice" role="radiogroup" aria-label="Status">
          {(["accepted", "proposed"] as const).map((s) => (
            <button key={s} type="button" role="radio" aria-checked={status === s} style={tone(STATUS[s].color)} onClick={() => setStatus(s)}>
              {s === "accepted" ? "Decided" : "Still open"}
            </button>
          ))}
        </div>
        <p className="decision-dialog-hint">Next, write it your way: why, options, tables, images, @people, tickets…</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Plus aria-hidden /> Create and write</button>
        </div>
      </form>
    </dialog>
  );
}
