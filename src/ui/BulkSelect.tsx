"use client";

// Picking several rows of a list at once (Settings → Archived): a checkbox per row, "Select all" over the list, and —
// once something is picked — a bar with the count, the actions, and Clear.
import { useState } from "react";

/** Which of the rows on screen are picked (a picked row that's filtered out or gone no longer counts). */
export function usePicked(shown: string[]) {
  const [picked, setPicked] = useState<string[]>([]);
  const selected = shown.filter((id) => picked.includes(id));
  const pick = (ids: string[], on: boolean) => setPicked((s) => (on ? [...new Set([...s, ...ids])] : s.filter((id) => !ids.includes(id))));
  return { selected, pick, clear: () => setPicked([]) };
}

export function BulkHead({ total, picked, noun, onAll, onClear, children }: {
  total: number; picked: number; noun: string; onAll: (on: boolean) => void; onClear: () => void; children: React.ReactNode;
}) {
  const all = total > 0 && picked === total;
  return (
    <div className={`bulk-head${picked ? " is-on" : ""}`} role="region" aria-label={`Select ${noun}`}>
      <label className="bulk-all">
        <input
          type="checkbox" className="checkbox" checked={all} aria-label={`Select all ${noun}`} onChange={() => onAll(!all)}
          ref={(el) => { if (el) el.indeterminate = picked > 0 && !all; }}
        />
        <span aria-live="polite">{picked ? `${picked} selected` : `Select all ${total}`}</span>
      </label>
      {picked > 0 && (
        <>
          {children}
          <button type="button" className="btn btn-tertiary" onClick={onClear}>Clear</button>
        </>
      )}
    </div>
  );
}
