"use client";

// A right-click menu at the pointer, always inside the window: it measures itself on every render (its content can
// grow — a list of epics, say) and moves in from an edge it would spill over. Closes on Escape, a click elsewhere,
// or resizing; scrolling closes it too, except inside the menu itself (so a long list in it can scroll).
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

const EDGE = 8;

export function ContextMenu({ x, y, label, width = 256, className = "", onClose, children }: {
  x: number; y: number; label: string; width?: number; className?: string; onClose: () => void; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    el.style.left = `${Math.max(EDGE, Math.min(x, innerWidth - w - EDGE))}px`;
    el.style.top = `${Math.max(EDGE, Math.min(y, innerHeight - h - EDGE))}px`;
  });

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    const outside = (e: Event) => !ref.current?.contains(e.target as Node);
    const away = (e: Event) => { if (outside(e)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    // Scrolling the page (wheel or finger) closes it — not scrolls the page makes itself, nor scrolling inside the menu.
    addEventListener("wheel", away, { passive: true });
    addEventListener("touchmove", away, { passive: true });
    addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", key);
      removeEventListener("wheel", away);
      removeEventListener("touchmove", away);
      removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div ref={ref} className={`menu context-menu ${className}`} role="menu" aria-label={label}
      style={{ position: "fixed", left: x, top: y, width, maxHeight: `calc(100vh - ${EDGE * 2}px)`, zIndex: 200 }}>
      {children}
    </div>,
    document.body,
  );
}
