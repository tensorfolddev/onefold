"use client";

// A long list to choose from — a search box over a list that scrolls, the current choice ticked — for inside a
// floating Popover, so however many there are (400 time zones, 40 epics) it stays the same size and on screen.
import { useState } from "react";
import { Check } from "lucide-react";

export interface Choice { value: string; label: string; hint?: string; swatch?: string }

export function SearchList({ choices, value, onPick, label, placeholder, empty }: {
  choices: Choice[]; value: string; onPick: (value: string) => void; label: string; placeholder: string; empty: string;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? choices.filter((c) => `${c.label} ${c.hint ?? ""} ${c.value}`.toLowerCase().includes(needle)) : choices;
  return (
    <div className="search-list">
      <label className="input tpl-picker-search">
        <input autoFocus placeholder={placeholder} aria-label={`Search ${label.toLowerCase()}`} value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="search-list-items" role="listbox" aria-label={label}>
        {shown.map((c) => (
          <button key={c.value} type="button" role="option" aria-selected={c.value === value} className="menu-item search-list-item" onClick={() => onPick(c.value)}>
            {c.swatch && <span className="search-list-swatch" style={{ background: c.swatch }} aria-hidden />}
            <span className="search-list-label">{c.label}</span>
            {c.hint && <span className="search-list-hint">{c.hint}</span>}
            {c.value === value && <Check aria-hidden className="search-list-on" />}
          </button>
        ))}
        {!shown.length && <p className="tpl-picker-empty">{needle ? `Nothing matches “${query.trim()}”` : empty}</p>}
      </div>
    </div>
  );
}
