"use client";

import { useState } from "react";
import { Plus, Scale } from "lucide-react";
import { addDecision } from "@/domain/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import { Avatar, EmptyState } from "@/ui/primitives";
import type { Decision } from "@/domain/types";

export function DecisionCard({ decision }: { decision: Decision }) {
  const { personById } = useMe();
  return (
    <article className="decision-card">
      <header className="decision-author">
        <Avatar personId={decision.byId} />
        <span className="decision-author-name">{personById(decision.byId)?.name}</span>
        <span className="muted">{shortDate(decision.date)}</span>
      </header>
      <h3 className="decision-title">{decision.title}</h3>
      <p className="decision-why"><strong>Why:</strong> {decision.why}</p>
    </article>
  );
}

type Errors = { title?: string; why?: string };

export function DecisionLog({ productKey }: { productKey: string }) {
  const { db, act, can, productByKey } = useMe();
  const product = productByKey(productKey);
  const canAdd = !!product && can("decision.add", { product });
  const items = db.decisions
    .filter((d) => d.productKey === productKey)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [errors, setErrors] = useState<Errors>({});

  const close = () => {
    setFormOpen(false);
    setTitle("");
    setWhy("");
    setErrors({});
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {
      title: title.trim() ? undefined : "Give the decision a title.",
      why: why.trim() ? undefined : "Explain why — future you will ask.",
    };
    setErrors(next);
    if (next.title || next.why) return;
    if (act((d, m) => addDecision(d, m, productKey, { title, why }), { success: "Decision recorded" })) close();
  };

  return (
    <div className="decision-log">
      <div className="toolbar">
        <h2 className="section-title">Decision log</h2>
        <span className="spacer" />
        {canAdd && !formOpen && (
          <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
            <Plus aria-hidden /> Record decision
          </button>
        )}
      </div>

      {formOpen && (
        <form className="decision-card decision-form" onSubmit={submit} noValidate>
          <label className="field">
            <span className="field-label">Decision</span>
            <span className="input">
              <input
                autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140}
                placeholder="e.g. Use Supabase Auth instead of custom login"
                aria-invalid={!!errors.title} aria-describedby={errors.title ? "decision-title-error" : undefined}
              />
            </span>
            {errors.title && <span id="decision-title-error" className="field-error">{errors.title}</span>}
          </label>
          <label className="field">
            <span className="field-label">Why</span>
            <textarea
              className="textarea" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} maxLength={1000}
              placeholder="What did it save, what did it cost, who agreed?"
              aria-invalid={!!errors.why} aria-describedby={errors.why ? "decision-why-error" : undefined}
            />
            {errors.why && <span id="decision-why-error" className="field-error">{errors.why}</span>}
          </label>
          <div className="decision-form-actions">
            <button type="button" className="btn btn-tertiary" onClick={close}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save decision</button>
          </div>
        </form>
      )}

      {items.length ? (
        <ol className="decision-list">
          {items.map((d) => <li key={d.id}><DecisionCard decision={d} /></li>)}
        </ol>
      ) : (
        !formOpen && (
          <EmptyState icon={<Scale aria-hidden />} title="No decisions yet">
            Record why the team chose one path over another, so nobody has to ask twice.
          </EmptyState>
        )
      )}
    </div>
  );
}
