"use client";

import { useState } from "react";
import { upsertMilestone, ValidationError } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import type { Milestone } from "@/domain/types";

/** Inline add/edit milestone form. Pass `milestone` to edit, omit to add. */
export function MilestoneForm({ productKey, milestone, onClose }: { productKey: string; milestone?: Milestone; onClose: () => void }) {
  const { db, me, act } = useMe();
  const [name, setName] = useState(milestone?.name ?? "");
  const [due, setDue] = useState(milestone?.due ?? "");
  const [pct, setPct] = useState(String(milestone?.pct ?? 0));
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { id: milestone?.id, name, due, pct: pct.trim() === "" ? NaN : Number(pct) };
    try {
      upsertMilestone(db, me, productKey, input);
    } catch (err) {
      if (err instanceof ValidationError) { setError(err.message); return; }
      throw err;
    }
    if (act((d, m) => upsertMilestone(d, m, productKey, input), { success: "Milestone saved" })) onClose();
  };
  const clear = () => setError("");

  return (
    <form className="decision-card decision-form mgr-form" onSubmit={submit} noValidate
      aria-label={milestone ? `Edit ${milestone.name}` : "Add milestone"}>
      <div className="mgr-form-row">
        <label className="field mgr-grow">
          <span className="field-label">Name</span>
          <span className="input">
            <input autoFocus value={name} maxLength={80} placeholder="e.g. Beta release"
              onChange={(e) => { setName(e.target.value); clear(); }} />
          </span>
        </label>
        <label className="field">
          <span className="field-label">Due</span>
          <span className="input">
            <input type="date" value={due} onChange={(e) => { setDue(e.target.value); clear(); }} />
          </span>
        </label>
        <label className="field mgr-pct">
          <span className="field-label">% done</span>
          <span className="input">
            <input type="number" min={0} max={100} step={1} inputMode="numeric" value={pct}
              onChange={(e) => { setPct(e.target.value); clear(); }} />
          </span>
        </label>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="decision-form-actions">
        <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Save milestone</button>
      </div>
    </form>
  );
}
