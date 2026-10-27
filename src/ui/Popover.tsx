"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { rem } from "./primitives";

const MENU_MIN_W = 220; // .menu min-width
const GAP = 6;
/** The app scales with the screen (base.css): a design px is this many screen px. */
const scale = () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
const remOf = (px?: number) => (px === undefined ? undefined : rem(px));

/** Fixed spot under (or, near the bottom of the screen, over) the anchor, kept on screen. */
function place(r: DOMRect, align: "left" | "right", width?: number): React.CSSProperties {
  const w = Math.max(width ?? 0, MENU_MIN_W) * scale();
  const left = Math.max(8, Math.min(align === "right" ? r.right - w : r.left, innerWidth - w - 8));
  const below = innerHeight - r.bottom;
  const vertical = below >= 240 || below >= r.top
    ? { top: r.bottom + GAP, maxHeight: below - GAP - 12 }
    : { bottom: innerHeight - r.top + GAP, maxHeight: r.top - GAP - 12 };
  // Above side panels and dialogs it may be opened from (a ticket's ⋯ lives inside the ticket panel).
  return { position: "fixed", zIndex: 200, left, width: remOf(width), overflowY: "auto", ...vertical };
}

/**
 * Anchor + floating menu. Closes on outside click and Escape. `floating` puts the menu on <body> at a fixed spot,
 * so a parent that clips (a board card) can't cut it off; it follows its anchor when the page scrolls.
 */
export function Popover({
  trigger,
  children,
  align = "left",
  className = "",
  width,
  anchorClassName = "",
  floating = false,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
  width?: number;
  anchorClassName?: string;
  floating?: boolean;
}) {
  const [spot, setSpot] = useState<React.CSSProperties | null>(null); // non-null = open
  const [anchor, setAnchor] = useState<HTMLDivElement | null>(null); // state, not a ref: toggle reads it
  const menuRef = useRef<HTMLDivElement>(null);
  const open = spot !== null;
  const close = () => setSpot(null);
  const toggle = () => {
    if (open || !anchor) return close();
    setSpot(floating ? place(anchor.getBoundingClientRect(), align, width) : { top: `calc(100% + ${GAP}px)`, [align]: 0, width: remOf(width) });
  };

  useEffect(() => {
    if (!open) return;
    const inside = (t: EventTarget | null) => !!t && (anchor?.contains(t as Node) || menuRef.current?.contains(t as Node));
    const onDown = (e: MouseEvent) => { if (!inside(e.target)) close(); };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    // The page scrolled (or shifted) under the menu: follow the anchor; once it's off screen, close.
    const onScroll = (e: Event) => {
      if (inside(e.target) || !anchor) return;
      const r = anchor.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) close(); else setSpot(place(r, align, width));
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    if (floating) { addEventListener("scroll", onScroll, true); addEventListener("resize", close); }
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      removeEventListener("scroll", onScroll, true);
      removeEventListener("resize", close);
    };
  }, [open, floating, anchor, align, width]);

  const menu = open && (
    <div ref={menuRef} className={`menu ${className}`} role="menu" style={spot}>
      {children(close)}
    </div>
  );
  return (
    <div className={`popover-anchor ${anchorClassName}`} ref={setAnchor}>
      {trigger({ open, toggle })}
      {floating && menu ? createPortal(menu, document.body) : menu}
    </div>
  );
}
