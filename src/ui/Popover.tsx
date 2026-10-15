"use client";

import { useEffect, useRef, useState } from "react";

/** Anchor + floating menu. Closes on outside click and Escape. */
export function Popover({
  trigger,
  children,
  align = "left",
  className = "",
  width,
  anchorClassName = "",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
  width?: number;
  anchorClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`popover-anchor ${anchorClassName}`} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={`menu ${className}`}
          role="menu"
          style={{ top: "calc(100% + 6px)", [align]: 0, width }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
