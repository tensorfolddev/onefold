"use client";

import { TriangleAlert } from "lucide-react";
import { useMe } from "@/data/StoreProvider";
import { loadColor, teamLoad } from "@/domain/selectors/dashboard";
import { Progress } from "@/ui/primitives";

/** Booked hours vs capacity per delivery team for the current sprint. */
export function TeamLoad() {
  const { db } = useMe();
  return (
    <div className="team-load">
      {db.teams.map((t) => {
        const { booked, capacity, pct } = teamLoad(db, t.id);
        const over = pct > 100;
        return (
          <div key={t.id} className="meter-row">
            <span className="team-load-label">
              {t.name}
              <span className="dash-muted">{booked}h / {capacity}h</span>
            </span>
            <Progress pct={pct} color={loadColor(pct)} />
            <span className={`meter-value${over ? " is-over" : ""}`}>
              {over && <TriangleAlert aria-label="Over capacity" />}
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
