"use client";

import { X } from "lucide-react";

export interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
}

// A message that opens with an emoji (🎉 a ticket done, 🏆 an epic complete) shows it as the toast's badge.
const LEADING_EMOJI = /^(\p{Extended_Pictographic}️?)\s*/u;
const CHEERS = new Set(["🎉", "🏆"]);

/** Top-right stack of short messages; the store owns the list and the 5s timeout. */
export function Toaster({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toaster" role="status" aria-live="polite">
      {items.map((t) => {
        const emoji = LEADING_EMOJI.exec(t.message)?.[1];
        const text = emoji ? t.message.replace(LEADING_EMOJI, "") : t.message;
        return (
        <div key={t.id} className={`toast${emoji && CHEERS.has(emoji) ? " is-cheer" : ""}`}>
          {emoji && <span className="toast-icon" aria-hidden>{emoji}</span>}
          <span className="toast-message">{text}</span>
          {t.undo && (
            <button type="button" className="toast-action" onClick={() => { t.undo?.(); onDismiss(t.id); }}>
              Undo
            </button>
          )}
          <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
            <X aria-hidden />
          </button>
        </div>
        );
      })}
    </div>
  );
}
