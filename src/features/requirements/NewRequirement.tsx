"use client";

// "New requirement": just what it is; it then opens, to be written out with its acceptance criteria.
import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addRequirement } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { nextRequirementCode } from "@/domain/selectors/requirements";

export function NewRequirement({ productKey, onClose, onCreated }: { productKey: string; onClose: () => void; onCreated: (id: string) => void }) {
  const { db, act } = useMe();
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string>();
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);
  const code = nextRequirementCode(db, productKey);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Say what the requirement is."); return; }
    const requirementId = crypto.randomUUID(); // named here so the server keeps the same id
    if (act((d, m) => addRequirement(d, m, productKey, { title }, requirementId), { success: `${code} added` })) onCreated(requirementId);
  };

  return (
    <dialog ref={ref} className="confirm-dialog decision-dialog" aria-labelledby="new-requirement-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <form onSubmit={submit} noValidate>
        <h2 id="new-requirement-title" className="confirm-title">New requirement <span className="key">{code}</span></h2>
        <label className="field">
          <span className="field-label">Requirement</span>
          <span className="input">
            <input autoFocus value={title} onChange={(e) => { setTitle(e.target.value); setError(undefined); }} maxLength={200}
              placeholder="e.g. Customers can pay by card" aria-invalid={!!error} />
          </span>
          {error && <span className="field-error" role="alert">{error}</span>}
        </label>
        <p className="decision-dialog-hint">Next: describe it, and list what must be true for it to count as done.</p>
        <div className="confirm-actions">
          <button type="button" className="btn btn-tertiary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary"><Plus aria-hidden /> Add and write</button>
        </div>
      </form>
    </dialog>
  );
}
