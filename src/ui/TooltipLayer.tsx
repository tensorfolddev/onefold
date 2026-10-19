"use client";

// Every tooltip in the app, drawn in one layer above everything (so no panel, list or scroll area can clip or cover
// it): hover — or keyboard focus — anything with data-tip="…" (data-tip-pos="top" prefers above). It sits under the
// element, flips above when there's no room, and always stays on screen. Never in the way of a click.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 350;
const GAP = 8;
const EDGE = 8;

interface Tip { text: string; rect: DOMRect; prefer: "top" | "bottom" }
interface Spot { left: number; top: number; arrow: number; place: "top" | "bottom" }

export function TooltipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: Element | null = null;
    const hide = () => { clearTimeout(timer); current = null; setTip(null); setSpot(null); };
    const show = (el: Element) => {
      clearTimeout(timer);
      current = el;
      timer = setTimeout(() => {
        const text = el.getAttribute("data-tip");
        const menuOpen = el.matches('[aria-expanded="true"], .is-open') || !!el.querySelector('[aria-expanded="true"], .is-open');
        if (!text || !el.isConnected || menuOpen) return; // its menu is open: the menu says it
        setSpot(null);
        setTip({ text, rect: el.getBoundingClientRect(), prefer: el.getAttribute("data-tip-pos") === "top" ? "top" : "bottom" });
      }, DELAY_MS);
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = (e.target as Element | null)?.closest?.("[data-tip]") ?? null;
      if (el === current) return;
      if (el) show(el); else hide();
    };
    const focus = (e: FocusEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-tip]");
      if (el && (e.target as Element).matches(":focus-visible")) show(el);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };
    document.addEventListener("pointerover", over, true);
    document.addEventListener("focusin", focus, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", key, true);
    addEventListener("scroll", hide, true);
    addEventListener("resize", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", key, true);
      removeEventListener("scroll", hide, true);
      removeEventListener("resize", hide);
    };
  }, []);

  // Measured once it's drawn (hidden), then placed: under or over the element, nudged to stay on screen.
  useLayoutEffect(() => {
    if (!tip || !box.current) return;
    const { offsetWidth: w, offsetHeight: h } = box.current;
    const r = tip.rect;
    let place = tip.prefer;
    if (place === "bottom" && r.bottom + GAP + h > innerHeight - EDGE) place = "top";
    else if (place === "top" && r.top - GAP - h < EDGE) place = "bottom";
    const center = r.left + r.width / 2;
    const left = Math.min(Math.max(EDGE, center - w / 2), innerWidth - w - EDGE);
    setSpot({ left, top: place === "bottom" ? r.bottom + GAP : r.top - GAP - h, arrow: center - left, place }); // eslint-disable-line react-hooks/set-state-in-effect -- placed after measuring
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div ref={box} className={`tip-layer is-${spot?.place ?? "bottom"}`} role="tooltip"
      style={{ left: spot?.left ?? 0, top: spot?.top ?? 0, visibility: spot ? "visible" : "hidden", "--arrow": `${spot?.arrow ?? 0}px` } as React.CSSProperties}>
      {tip.text}
    </div>,
    document.body,
  );
}
