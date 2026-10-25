"use client";

// One requirement, opened: what it is (title, description in the docs editor), what counts as done (acceptance
// criteria), the tickets that build it and how far along they are, and its history. Whoever manages the project writes
// it and marks it confirmed; a confirmed one is locked until they choose to change it (it then needs confirming again,
// and the confirmed version is kept). Everyone on the project reads it.
import dynamic from "next/dynamic";
import { Check, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { deleteRequirement, dropRequirement, markRequirementConfirmed, restoreRequirement, updateRequirement, type RequirementPatch } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { coverage } from "@/domain/selectors/product";
import { PRIORITIES, REQUIREMENT_PRIORITY, REQUIREMENT_STATUS, requirementProgress, SOURCE_KINDS, statusOfRequirement } from "@/domain/selectors/requirements";
import { shortDate } from "@/domain/status";
import type { Requirement, RequirementPriority, RequirementSource, RequirementSourceKind } from "@/domain/types";
import { useEditorLinks } from "@/features/docs/editor/useEditorLinks";
import { AddLink, EditableText } from "@/features/products/DecisionPanel";
import { useAppState } from "@/features/shell/state";
import { TicketPickerList } from "@/features/tickets/TemplateRelations";
import { ItemsEditor } from "@/features/tickets/TemplateItems";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { Battery, StatusPill } from "@/ui/primitives";
import { hoursText } from "./RequirementsView";

const DocEditor = dynamic(() => import("@/features/docs/editor/DocEditor"), { ssr: false, loading: () => <div className="doc-skeleton" aria-busy="true" /> });
const SAVE_AFTER_MS = 800;

/** The description, in the docs editor; saved a moment after you stop typing, and when you close it. */
function Description({ requirement, editable, onSave }: { requirement: Requirement; editable: boolean; onSave: (md: string) => void }) {
  const links = useEditorLinks(requirement.productKey);
  const [initial] = useState(() => requirement.description ?? "");
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const md = pending.current;
    pending.current = null;
    if (md !== null) onSave(md);
  }, [onSave]);
  const onChange = useCallback((md: string) => {
    if (md.trim() === initial.trim()) return;
    pending.current = md;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_AFTER_MS);
  }, [flush, initial]);
  useEffect(() => flush, [flush]);
  if (!editable && !initial.trim()) return <p className="tpl-empty">No description yet.</p>;
  return (
    <div className="decision-body requirement-description">
      <DocEditor body={initial} editable={editable} onChange={onChange} links={links}
        placeholder={editable ? "Who is it for, what do they need to do, and why? e.g. Sales reps export a customer's orders, so accounting can bill them. Type / for more." : "No description yet."} />
    </div>
  );
}

export function RequirementPanel({ requirement: r, onClose }: { requirement: Requirement; onClose: () => void }) {
  const { db, act, can, personById, productByKey, statusById } = useMe();
  const { openTicket, updateTicket } = useAppState();
  const product = productByKey(r.productKey);
  const editable = !!product && can("requirement.edit", { product });
  const status = statusOfRequirement(r);
  const [unlocked, setUnlocked] = useState(false);
  const [asking, setAsking] = useState<"unlock" | "drop" | "delete" | null>(null);
  const [reason, setReason] = useState("");
  // A confirmed requirement's words are locked until whoever manages it chooses to change them.
  const canWrite = editable && status !== "dropped" && (status !== "confirmed" || unlocked);
  useEffect(() => {
    const typing = (t: EventTarget | null) => t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || t instanceof HTMLSelectElement
      || (t instanceof HTMLElement && t.isContentEditable);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !typing(e.target) && !asking) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, asking]);

  const save = useCallback((patch: RequirementPatch) => !!act((d, m) => updateRequirement(d, m, r.id, patch)), [act, r.id]);
  const saveDescription = useCallback((md: string) => { save({ description: md }); }, [save]);
  const p = requirementProgress(db, r);
  const cov = coverage(db, p.linked);
  const linked = db.tickets.filter((t) => t.requirementId === r.id && !t.archivedAt); // epics too: they can be unlinked here
  const linkable = db.tickets.filter((t) => t.productKey === r.productKey && !t.archivedAt && t.requirementId !== r.id);
  const created = personById(r.createdBy);
  const confirmedBy = personById(r.confirmed?.by);
  const changedSince = status === "draft" && !!r.confirmed;

  return (
    <>
      <div className="scrim is-light" onClick={onClose} aria-hidden />
      <aside className="side-panel decision-panel requirement-panel" role="dialog" aria-modal="true" aria-labelledby="requirement-panel-title">
        <header className="decision-panel-head">
          <div className="decision-panel-bar">
            <StatusPill name={REQUIREMENT_STATUS[status].label} tone={REQUIREMENT_STATUS[status].tone} />
            <span className="key">{r.code}</span>
            <span className="spacer" />
            {editable && status === "draft" && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setUnlocked(false); act((d, m) => markRequirementConfirmed(d, m, r.id), { success: `${r.code} marked confirmed` }); }}>
                <Check aria-hidden /> Mark confirmed
              </button>
            )}
            {editable && status === "confirmed" && !unlocked && (
              <button type="button" className="btn btn-tertiary btn-sm" onClick={() => setAsking("unlock")}><Pencil aria-hidden /> Edit</button>
            )}
            {editable && status === "dropped" && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => act((d, m) => restoreRequirement(d, m, r.id), { success: `${r.code} is back` })}>
                <RotateCcw aria-hidden /> Restore
              </button>
            )}
            {editable && status !== "dropped" && (
              <button type="button" className="docs-topbar-btn" aria-label="Drop requirement" data-tip="Drop (out of scope)" onClick={() => { setReason(""); setAsking("drop"); }}><X aria-hidden /></button>
            )}
            {editable && !r.confirmed && !linked.length && (
              <button type="button" className="docs-topbar-btn" aria-label="Delete requirement" data-tip="Delete" onClick={() => setAsking("delete")}><Trash2 aria-hidden /></button>
            )}
            <button type="button" className="docs-topbar-btn" aria-label="Close" data-tip="Close" onClick={onClose}><X aria-hidden /></button>
          </div>
          <h2 id="requirement-panel-title" className="decision-panel-title">
            <EditableText key={`${r.title}:${canWrite}`} title label="Requirement" value={r.title} editable={canWrite} required onSave={(v) => save({ title: v })} />
          </h2>
          <div className="requirement-meta">
            <PriorityPicker value={r.priority} editable={editable && status !== "dropped"} onPick={(p) => save({ priority: p })} />
            <SourceField key={JSON.stringify(r.source ?? null)} source={r.source} editable={editable && status !== "dropped"} onSave={(s) => save({ source: s })} />
          </div>
          {status === "dropped" && <p className="decision-banner is-quiet requirement-banner">Dropped: {r.droppedReason}</p>}
          {changedSince && (
            <p className="decision-banner is-quiet requirement-banner">
              Changed since it was confirmed{confirmedBy ? ` by ${confirmedBy.name}` : ""} on {shortDate(r.confirmed!.at)} — mark it confirmed again once it&apos;s agreed.
            </p>
          )}
        </header>

        <div className="decision-panel-body">
          <Description key={`${r.id}:${canWrite}`} requirement={r} editable={canWrite} onSave={saveDescription} />

          <section className="decision-section">
            <h3 className="decision-section-label">Acceptance criteria</h3>
            <ItemsEditor items={r.criteria ?? []} kind="checklist" title="Acceptance criteria" editable={canWrite} tickable={editable && status !== "dropped"}
              hint="What must be true for this to count as done — one line each."
              onSave={(next) => save({ criteria: next })} />
          </section>

          <section className="decision-section">
            <h3 className="decision-section-label">Tickets</h3>
            {p.total > 0 && (
              <div className="requirement-progress">
                <Battery segments={cov.segments} thin label={`${p.done} of ${p.total} done`} />
                <span>{p.done} of {p.total} done{p.hoursTotal > 0 && ` · ${hoursText(p.hoursDone, p.hoursTotal)}`}</span>
              </div>
            )}
            <div className="decision-related">
              {linked.map((t) => {
                const s = statusById(t.statusId);
                return (
                  <span key={t.key} className="decision-linked">
                    <button type="button" className="doc-chip is-ticket" onClick={() => openTicket(t.key)}>
                      <TypeIcon type={t.type} /><span className="doc-chip-key">{t.key}</span><span className="doc-chip-title">{t.title}</span>
                      {s && t.type !== "epic" && <StatusPill name={s.name} tone={s.tone} />}
                    </button>
                    {editable && <button type="button" className="decision-unlink" aria-label={`Unlink ${t.key}`} data-tip="Unlink" onClick={() => updateTicket(t.key, { requirementId: null })}><X aria-hidden /></button>}
                  </span>
                );
              })}
              {!linked.length && <p className="tpl-hint">No tickets build this yet{editable ? " — link the ones that do." : "."}</p>}
              {editable && status !== "dropped" && (
                <AddLink label="Ticket">
                  {(close) => <TicketPickerList candidates={linkable} onPick={(k) => { close(); updateTicket(k, { requirementId: r.id }); }} emptyText="No more tickets in this project" />}
                </AddLink>
              )}
            </div>
          </section>

          {changedSince && <ConfirmedVersion requirement={r} />}

          <section className="decision-section">
            <h3 className="decision-section-label">History</h3>
            <ul className="requirement-history">
              {r.createdAt && <li>Added{created ? ` by ${created.name}` : ""} · {shortDate(r.createdAt)}</li>}
              {r.confirmed && <li>Confirmed{confirmedBy ? ` by ${confirmedBy.name}` : ""} · {shortDate(r.confirmed.at)} · version {r.confirmed.rev}</li>}
              {(r.rev ?? 1) > (r.confirmed?.rev ?? 1) && <li>Now on version {r.rev}{r.updatedAt ? ` · last changed ${shortDate(r.updatedAt)}` : ""}</li>}
              {status === "dropped" && <li>Dropped · {r.droppedReason}</li>}
            </ul>
          </section>
        </div>
      </aside>

      {asking === "unlock" && (
        <ConfirmDialog title={`Change ${r.code}?`} confirmLabel="Change it" tone="primary"
          body={<>It was confirmed{confirmedBy ? ` by ${confirmedBy.name}` : ""}{r.confirmed ? ` on ${shortDate(r.confirmed.at)}` : ""}. Changing its words means it needs confirming again — the confirmed version is kept.</>}
          onConfirm={() => { setUnlocked(true); setAsking(null); }} onCancel={() => setAsking(null)} />
      )}
      {asking === "drop" && (
        <ConfirmDialog title={`Drop ${r.code}?`} confirmLabel="Drop it" confirmDisabled={!reason.trim()}
          body={(
            <label className="field">
              <span className="field-label">Why is it out of scope?</span>
              <span className="input"><input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. The client moved it to phase 2" /></span>
            </label>
          )}
          onConfirm={() => { if (act((d, m) => dropRequirement(d, m, r.id, reason), { success: `${r.code} dropped — it stays in the list, struck through` })) setAsking(null); }}
          onCancel={() => setAsking(null)} />
      )}
      {asking === "delete" && (
        <ConfirmDialog title={`Delete ${r.code}?`} body="It was never confirmed and no ticket builds it, so it goes for good."
          onConfirm={() => { setAsking(null); onClose(); act((d, m) => deleteRequirement(d, m, r.id), { success: `${r.code} deleted` }); }}
          onCancel={() => setAsking(null)} />
      )}
    </>
  );
}

/** Must / Should / Nice to have — what's essential, and what can wait. Changing it isn't a change to the words. */
function PriorityPicker({ value, editable, onPick }: { value?: RequirementPriority; editable: boolean; onPick: (p: RequirementPriority) => void }) {
  if (!editable) {
    return value ? <span className="requirement-priority is-static" style={{ "--p": REQUIREMENT_PRIORITY[value].color } as React.CSSProperties}>{REQUIREMENT_PRIORITY[value].label}</span>
      : <span className="muted">No priority yet</span>;
  }
  return (
    <div className="requirement-priority-pick" role="radiogroup" aria-label="Priority">
      {PRIORITIES.map((p) => (
        <button key={p} type="button" role="radio" aria-checked={value === p} className="requirement-priority" style={{ "--p": REQUIREMENT_PRIORITY[p].color } as React.CSSProperties}
          onClick={() => value !== p && onPick(p)}>{REQUIREMENT_PRIORITY[p].label}</button>
      ))}
    </div>
  );
}

/** Where it came from: the kind (a meeting, an email…) and a short note ("Kickoff call, 12 Oct"). */
function SourceField({ source, editable, onSave }: { source?: RequirementSource; editable: boolean; onSave: (s: RequirementSource | null) => void }) {
  const [note, setNote] = useState(source?.note ?? "");
  if (!editable) {
    return source ? <span className="requirement-source">From {SOURCE_KINDS[source.kind].toLowerCase()}{source.note ? `: ${source.note}` : ""}</span> : null;
  }
  const saveNote = () => { if (source && note.trim() !== (source.note ?? "")) onSave({ kind: source.kind, note }); };
  return (
    <span className="requirement-source is-editing">
      <select className="decision-add-select" aria-label="Where it came from" value={source?.kind ?? ""}
        onChange={(e) => onSave(e.target.value ? { kind: e.target.value as RequirementSourceKind, note } : null)}>
        <option value="">Where did it come from?</option>
        {(Object.keys(SOURCE_KINDS) as RequirementSourceKind[]).map((k) => <option key={k} value={k}>{SOURCE_KINDS[k]}</option>)}
      </select>
      {source && (
        <span className="input requirement-source-note">
          <input aria-label="Source note" value={note} maxLength={200} placeholder="e.g. Kickoff call, 12 Oct"
            onChange={(e) => setNote(e.target.value)} onBlur={saveNote} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
        </span>
      )}
    </span>
  );
}

/** What was agreed, as it read then — shown while the requirement is being changed. */
function ConfirmedVersion({ requirement: r }: { requirement: Requirement }) {
  const v = r.confirmed!;
  return (
    <details className="decision-section requirement-confirmed">
      <summary className="decision-section-label">Confirmed version (version {v.rev}, {shortDate(v.at)})</summary>
      <p className="requirement-confirmed-title">{v.title}</p>
      {v.description && <p className="requirement-confirmed-text">{v.description}</p>}
      {v.criteria.length > 0 && <ul className="requirement-confirmed-list">{v.criteria.map((c) => <li key={c.id}>{c.text}</li>)}</ul>}
    </details>
  );
}
