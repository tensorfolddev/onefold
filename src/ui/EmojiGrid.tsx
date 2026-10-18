"use client";

// Every Unicode emoji, by group or searched by name — the product icon picker and doc page icons use it.
import { useEffect, useMemo, useRef, useState } from "react";

interface Emoji { unicode: string; label: string; tags?: string[]; group?: number }

// Unicode groups, minus "components" (skin-tone swatches) — same order monday's picker uses.
const GROUPS: { id: number; label: string; icon: string }[] = [
  { id: 0, label: "Smileys & emotion", icon: "😀" }, { id: 1, label: "People & body", icon: "👋" },
  { id: 3, label: "Animals & nature", icon: "🐻" }, { id: 4, label: "Food & drink", icon: "🍔" },
  { id: 5, label: "Travel & places", icon: "✈️" }, { id: 6, label: "Activities", icon: "⚽" },
  { id: 7, label: "Objects", icon: "💡" }, { id: 8, label: "Symbols", icon: "❤️" }, { id: 9, label: "Flags", icon: "🏁" },
];

export function EmojiGrid({ query, current, onPick }: { query: string; current?: string; onPick: (e: string) => void }) {
  const [all, setAll] = useState<Emoji[] | null>(null);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ~570 KB of emoji names + keywords: fetched only when someone opens the picker.
    import("emojibase-data/en/compact.json")
      .then((m) => setAll((m.default as Emoji[]).filter((e) => e.group !== undefined && e.group !== 2)))
      .catch(() => setFailed(true));
  }, []);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () => (q && all ? all.filter((e) => e.label.toLowerCase().includes(q) || e.tags?.some((t) => t.includes(q))) : null),
    [q, all],
  );

  if (failed) return <p className="icon-picker-empty">Couldn&apos;t load emoji. Try again.</p>;
  if (!all) return <p className="icon-picker-empty" aria-busy="true">Loading emoji…</p>;

  const cell = (e: Emoji) => (
    <button
      key={e.unicode} type="button" className={`icon-picker-cell is-emoji${current === e.unicode ? " is-current" : ""}`}
      title={e.label} aria-label={e.label} onClick={() => onPick(e.unicode)}
    >
      {e.unicode}
    </button>
  );

  return (
    <>
      {!results && (
        <nav className="icon-picker-jump" aria-label="Emoji categories">
          {GROUPS.map((g) => (
            <button
              key={g.id} type="button" title={g.label} aria-label={g.label}
              onClick={() => scrollRef.current?.querySelector(`#emoji-group-${g.id}`)?.scrollIntoView({ block: "start" })}
            >
              {g.icon}
            </button>
          ))}
        </nav>
      )}
      <div className="icon-picker-scroll" ref={scrollRef}>
        {results ? (
          results.length ? <div className="icon-picker-grid">{results.map(cell)}</div>
            : <p className="icon-picker-empty">No emoji for “{query}”</p>
        ) : GROUPS.map((g) => (
          <section key={g.id} id={`emoji-group-${g.id}`} aria-label={g.label}>
            <h3 className="icon-picker-group">{g.label}</h3>
            <div className="icon-picker-grid">{all.filter((e) => e.group === g.id).map(cell)}</div>
          </section>
        ))}
      </div>
    </>
  );
}
