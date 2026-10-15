"use client";

import { countByCategory } from "@/domain/selectors/dashboard";
import { visibleProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { CATEGORY_LABEL, CATEGORY_ORDER, CATEGORY_TONE, toneVar } from "@/domain/status";
import type { StatusCategory } from "@/domain/types";

// r chosen so the circumference is 100 → dash lengths are plain percentages.
const R = 15.915;

/** Tickets by status category — hand-written SVG donut + dot legend (monday pie widget). Reads live tickets. */
export function DonutChart() {
  const { me, db } = useMe();
  const keys = new Set(visibleProducts(me, db.products).map((p) => p.key));
  const tickets = db.tickets.filter((t) => keys.has(t.productKey));
  const counts = countByCategory(db, tickets);
  const total = tickets.length || 1;
  const segments = CATEGORY_ORDER.filter((c) => counts[c] > 0).reduce<{ c: StatusCategory; pct: number; offset: number }[]>(
    (acc, c) => {
      const prev = acc[acc.length - 1];
      return [...acc, { c, pct: (counts[c] / total) * 100, offset: prev ? prev.offset + prev.pct : 0 }];
    }, []);

  return (
    <div className="donut">
      <svg viewBox="0 0 42 42" className="donut-svg" role="img"
        aria-label={segments.map((s) => `${CATEGORY_LABEL[s.c]} ${Math.round(s.pct)}%`).join(", ")}>
        <circle cx="21" cy="21" r={R} fill="none" stroke="var(--ui-background-color)" strokeWidth="6" />
        {segments.map((s) => (
          <circle key={s.c} cx="21" cy="21" r={R} fill="none" strokeWidth="6"
            stroke={toneVar(CATEGORY_TONE[s.c])}
            strokeDasharray={`${s.pct} ${100 - s.pct}`}
            strokeDashoffset={25 - s.offset} />
        ))}
        <text x="21" y="22.5" className="donut-total">{tickets.length}</text>
        <text x="21" y="27.5" className="donut-caption">tickets</text>
      </svg>
      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.c}>
            <span className="chip-dot" style={{ background: toneVar(CATEGORY_TONE[s.c]) }} />
            {CATEGORY_LABEL[s.c]}: {s.pct.toFixed(1)}%
          </li>
        ))}
      </ul>
    </div>
  );
}
