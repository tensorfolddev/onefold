"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Native modal <dialog>: focus is trapped by the browser, Escape cancels, focus returns to the opener.
 * Render it only while open: {confirming && <ConfirmDialog … />}.
 */
export function ConfirmDialog({
  title, body, confirmLabel = "Delete", tone = "danger", onConfirm, onCancel,
}: {
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    cancelRef.current?.focus(); // the safe choice gets focus first
    return () => d?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={body ? `${id}-body` : undefined}
      onCancel={(e) => { e.preventDefault(); onCancel(); }}
    >
      <h2 id={`${id}-title`} className="confirm-title">{title}</h2>
      {body && <div id={`${id}-body`} className="confirm-body">{body}</div>}
      <div className="confirm-actions">
        <button ref={cancelRef} type="button" className="btn btn-tertiary" onClick={onCancel}>Cancel</button>
        <button type="button" className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
