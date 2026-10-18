"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  message: string;
  undo?: () => void;
  tone?: ToastTone;
}

// A message that opens with an emoji (🎉 a ticket done, 🏆 an epic complete) shows it as the toast's badge.
const LEADING_EMOJI = /^(\p{Extended_Pictographic}️?)\s*/u;
const CHEERS = new Set(["🎉", "🏆"]);
const ICON = { success: CircleCheck, error: CircleAlert, info: Info };

/**
 * Top-right stack of floating cards: an icon for what happened (or the message's own emoji), the words, Undo, and a
 * thin line that runs out with the toast. The store owns the list and the timeout (`ms`).
 */
export function Toaster({ items, ms, onDismiss }: { items: ToastItem[]; ms: number; onDismiss: (id: number) => void }) {
  return (
    <div className="toaster" role="status" aria-live="polite" style={{ "--toast-ms": `${ms}ms` } as React.CSSProperties}>
      {items.map((t) => {
        const emoji = LEADING_EMOJI.exec(t.message)?.[1];
        const text = emoji ? t.message.replace(LEADING_EMOJI, "") : t.message;
        const tone = t.tone ?? "info";
        const Icon = ICON[tone];
        return (
          <div key={t.id} className="toast" data-tone={emoji && CHEERS.has(emoji) ? "cheer" : tone}>
            <span className="toast-icon" aria-hidden>{emoji ?? <Icon />}</span>
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
