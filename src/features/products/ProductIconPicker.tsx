"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { setProductLook } from "@/data/commands";
import { PRODUCT_COLORS } from "@/data/db";
import { useDb } from "@/data/StoreProvider";
import type { Product } from "@/domain/types";
import { EmojiGrid } from "@/ui/EmojiGrid";
import { Tabs } from "@/ui/primitives";

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
