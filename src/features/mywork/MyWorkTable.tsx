"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { GroupId, WorkGroup } from "@/domain/selectors/mywork";
import { toneVar } from "@/domain/status";
import { WorkRow } from "./WorkRow";

const COLUMNS = ["Ticket", "Product", "Est", "Req", "Status", "Due", "PR"];

export function MyWorkTable({ groups }: { groups: WorkGroup[] }) {
  const [collapsed, setCollapsed] = useState<Record<GroupId, boolean>>({ now: false, next: false, review: false, done: true });

  return (
    <div className="mw-groups">
      {groups.map((g) => {
        const isCollapsed = collapsed[g.id];
        const Chevron = isCollapsed ? ChevronRight : ChevronDown;
        return (
          <section key={g.id} className="mw-group" style={{ "--group": toneVar(g.tone) } as React.CSSProperties} aria-labelledby={`mw-g-${g.id}`}>
            <header className="mw-group-header">
              <button
                type="button"
                className="mw-group-toggle"
                aria-expanded={!isCollapsed}
                onClick={() => setCollapsed((c) => ({ ...c, [g.id]: !c[g.id] }))}
              >
                <Chevron aria-hidden />
                <h2 id={`mw-g-${g.id}`} className="group-title">{g.title}</h2>
              </button>
              <span className="mw-group-count">{g.tickets.length} {g.tickets.length === 1 ? "item" : "items"}</span>
            </header>
            {!isCollapsed && (
              <div className="mw-table" role="table" aria-labelledby={`mw-g-${g.id}`}>
                <div className="mw-row mw-head" role="row">
                  {COLUMNS.map((c, i) => (
                    <div key={i} className="mw-cell" role="columnheader">{c}</div>
                  ))}
                </div>
                {g.tickets.map((t) => <WorkRow key={t.key} ticket={t} done={g.id === "done"} />)}
                {g.tickets.length === 0 && <div className="mw-row mw-empty" role="row"><div role="cell">Nothing here</div></div>}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
