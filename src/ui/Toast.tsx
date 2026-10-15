"use client";

import { X } from "lucide-react";

export interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

/** Bottom-centre stack of short messages; the store owns the list and the 5s timeout. */
export function Toaster({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast-message">{t.message}</span>
          {t.undo && (
            <button type="button" className="toast-action" onClick={() => { t.undo?.(); onDismiss(t.id); }}>
              Undo
            </button>
          )}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
            <X aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
