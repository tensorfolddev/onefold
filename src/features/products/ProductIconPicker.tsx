"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { setProductLook } from "@/domain/commands";
import { PRODUCT_COLORS } from "@/data/db";
import { useDb } from "@/data/StoreProvider";
import type { Product } from "@/domain/types";
import { Tabs } from "@/ui/primitives";

interface Emoji { unicode: string; label: string; tags?: string[]; group?: number }

// Unicode groups, minus "components" (skin-tone swatches) — same order monday's picker uses.
const GROUPS: { id: number; label: string; icon: string }[] = [
  { id: 0, label: "Smileys & emotion", icon: "😀" }, { id: 1, label: "People & body", icon: "👋" },
  { id: 3, label: "Animals & nature", icon: "🐻" }, { id: 4, label: "Food & drink", icon: "🍔" },
  { id: 5, label: "Travel & places", icon: "✈️" }, { id: 6, label: "Activities", icon: "⚽" },
  { id: 7, label: "Objects", icon: "💡" }, { id: 8, label: "Symbols", icon: "❤️" }, { id: 9, label: "Flags", icon: "🏁" },
];
const ICON_PAGE = 180; // icons render in pages as you scroll (2,000+ in total)
const pretty = (name: string) => name.replace(/-/g, " ");
const IconSkeleton = () => <span className="icon-picker-skeleton" aria-hidden />; // while an icon downloads

/** Emoji (all Unicode emoji, searchable) or icon (every lucide icon, searchable) + tile colour. */
export default function ProductIconPicker({ product, onDone, onLook }: {
  product: Pick<Product, "key" | "icon" | "color">;
  onDone: () => void;
  /** Draft mode (e.g. the New product form): hand the choice back instead of saving it. */
  onLook?: (look: Parameters<typeof setProductLook>[3]) => void;
}) {
  const { act } = useDb();
  const [tab, setTab] = useState(product.icon?.type === "icon" ? "Icons" : "Emoji");
  const [query, setQuery] = useState("");
  const save = (look: Parameters<typeof setProductLook>[3], close = true) => {
    if (onLook) { onLook(look); if (close) onDone(); return; }
    if (act((d, m) => setProductLook(d, m, product.key, look)) && close) onDone();
  };

  return (
    <div className="icon-picker">
      <Tabs items={[{ label: "Emoji" }, { label: "Icons" }]} active={tab} onSelect={(t) => { setTab(t); setQuery(""); }} ariaLabel="Icon type" />
      <div className="icon-picker-colors" role="radiogroup" aria-label="Tile colour">
        {PRODUCT_COLORS.map((c) => (
          <button
            key={c} type="button" role="radio" aria-checked={product.color === c}
            aria-label={c.replace(/var\(--color-|\)/g, "").replace(/[-_]/g, " ")}
            className="icon-picker-color" style={{ background: c }} onClick={() => save({ color: c }, false)}
          />
        ))}
      </div>
      <div className="icon-picker-search">
        <label className="input">
          <Search aria-hidden />
          <input
            autoFocus type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === "Emoji" ? "Search emoji (e.g. rocket, heart)" : "Search icons (e.g. chart, code)"}
            aria-label={tab === "Emoji" ? "Search emoji" : "Search icons"}
          />
        </label>
        {product.icon && (
          <button type="button" className="btn btn-tertiary" onClick={() => save({ icon: null })}>
            <X aria-hidden /> Remove
          </button>
        )}
      </div>
      {tab === "Emoji"
        ? <EmojiGrid query={query} current={product.icon?.type === "emoji" ? product.icon.value : undefined} onPick={(value) => save({ icon: { type: "emoji", value } })} />
        : <IconGrid query={query} color={product.color} current={product.icon?.type === "icon" ? product.icon.value : undefined} onPick={(value) => save({ icon: { type: "icon", value } })} />}
    </div>
  );
}

function EmojiGrid({ query, current, onPick }: { query: string; current?: string; onPick: (e: string) => void }) {
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

function IconGrid({ query, color, current, onPick }: { query: string; color: string; current?: string; onPick: (n: string) => void }) {
  const q = query.trim().toLowerCase().replace(/\s+/g, "-");
  const names = useMemo(() => (q ? iconNames.filter((n) => n.includes(q)) : iconNames), [q]);
  const [shown, setShown] = useState(ICON_PAGE);
  const sentinel = useRef<HTMLDivElement>(null);
  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) { setPrevQ(q); setShown(ICON_PAGE); } // a new search starts from the first page

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown((n) => n + ICON_PAGE), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [names]);

  if (!names.length) return <p className="icon-picker-empty">No icons for “{query}”</p>;
  return (
    <div className="icon-picker-scroll">
      <p className="icon-picker-group">{q ? `${names.length} icons` : `All ${iconNames.length} icons`}</p>
      <div className="icon-picker-grid">
        {names.slice(0, shown).map((n) => (
          <button
            key={n} type="button" className={`icon-picker-cell is-icon${current === n ? " is-current" : ""}`}
            title={pretty(n)} aria-label={pretty(n)} onClick={() => onPick(n)}
            style={{ "--tile": color } as React.CSSProperties}
          >
            <DynamicIcon name={n as IconName} aria-hidden fallback={IconSkeleton} />
          </button>
        ))}
      </div>
      {shown < names.length && <div ref={sentinel} className="icon-picker-more" aria-hidden />}
    </div>
  );
}
