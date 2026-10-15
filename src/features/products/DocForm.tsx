"use client";

import { useState } from "react";
import { addDoc, ValidationError } from "@/domain/commands";
import { useMe } from "@/data/StoreProvider";
import type { DocKind } from "@/domain/types";

/** Inline "Add document" form. `kinds` with one entry fixes the kind (developers: meeting notes only). */
export function DocForm({ productKey, kinds, onClose }: { productKey: string; kinds: DocKind[]; onClose: () => void }) {
  const { db, me, act } = useMe();
  const [kind, setKind] = useState<DocKind>(kinds[0]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = { kind, title };
    try {
      addDoc(db, me, productKey, input);
    } catch (err) {
      if (err instanceof ValidationError) { setError(err.message); return; }
      throw err;
    }
    if (act((d, m) => addDoc(d, m, productKey, input), { success: "Document added" })) onClose();
  };

  return (
    <form className="decision-card decision-form mgr-form" onSubmit={submit} noValidate aria-label="Add document">
      <div className="mgr-form-row">
        {kinds.length > 1 && (
          <label className="field">
            <span className="field-label">Kind</span>
            <select className="mgr-select" value={kind} onChange={(e) => setKind(e.target.value as DocKind)}>
              {kinds.map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
        )}
        <label className="field mgr-grow">
          <span className="field-label">{kinds.length > 1 ? "Title" : "Meeting notes title"}</span>
          <span className="input">
            <input
              autoFocus value={title} maxLength={140} placeholder="e.g. Kickoff call with the client"
              onChange={(e) => { setTitle(e.target.value); setError(""); }}
              aria-invalid={!!error} aria-describedby={error ? "doc-title-error" : undefined}
            />
          </span>
          {error && <span id="doc-title-error" className="field-error" role="alert">{error}</span>}
        </label>
      </div>
      <div className="decision-form-actions">
        <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn-primary">Add</button>
      </div>
    </form>
  );
}
