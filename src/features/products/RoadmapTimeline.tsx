import { Flag, Pencil } from "lucide-react";
import { today } from "@/domain/clock";
import { shortDate } from "@/domain/status";
import { EmptyState, IconButton } from "@/ui/primitives";
import { MilestoneSummary } from "./Widgets";
import type { Milestone } from "@/domain/types";

const START = "2026-09-01"; // a month of history so "Today" (Oct 1) isn't pinned to the left edge
const END = "2027-01-01"; // exclusive
const MONTHS = [
  { label: "September", from: "2026-09-01" },
  { label: "October", from: "2026-10-01" },
  { label: "November", from: "2026-11-01" },
  { label: "December", from: "2026-12-01" },
];

/** Days since START, parsed from parts so there is no timezone drift. */
const dayOf = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const [sy, sm, sd] = START.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86_400_000;
};
const SPAN = dayOf(END);
const pctOf = (iso: string) => Math.min(100, Math.max(0, (dayOf(iso) / SPAN) * 100));

/** Sep–Dec 2026 timeline (visual) + the same milestones as a list (screen readers, mobile). `onEdit` adds a pencil per row. */
export function RoadmapTimeline({ milestones, onEdit }: { milestones: Milestone[]; onEdit?: (m: Milestone) => void }) {
  if (!milestones.length) {
    return <EmptyState icon={<Flag aria-hidden />} title="No milestones yet">Milestones are set in the PLAN stage.</EmptyState>;
  }
  return (
    <div className="roadmap">
      <div className="roadmap-timeline" aria-hidden>
        <div className="roadmap-months">
          {MONTHS.map((m, i) => {
            const to = MONTHS[i + 1]?.from ?? END;
            return (
              <span key={m.label} className="roadmap-month" style={{ width: `${pctOf(to) - pctOf(m.from)}%` }}>
                {m.label}
              </span>
            );
          })}
        </div>
        <div className="roadmap-lanes">
          {milestones.map((m, i) => {
            // A milestone's bar runs from the previous milestone's due date (or the window start) to its own.
            const left = i ? pctOf(milestones[i - 1].due) : 0;
            const width = Math.max(pctOf(m.due) - left, 4);
            return (
              <div key={m.id} className="roadmap-lane">
                <div className={`roadmap-bar${m.lateDays > 0 ? " is-late" : ""}`} style={{ left: `${left}%`, width: `${width}%` }}>
                  <span className="roadmap-fill" style={{ width: `${m.pct}%` }} />
                  <span className="roadmap-bar-label">{m.name} · {shortDate(m.due)}</span>
                </div>
              </div>
            );
          })}
          <span className="roadmap-today" style={{ left: `${pctOf(today())}%` }}>
            <span className="roadmap-today-label">Today</span>
          </span>
        </div>
      </div>

      <ul className="roadmap-list" aria-label="Milestones">
        {milestones.map((m) => (
          <li key={m.id} className="roadmap-list-row">
            <MilestoneSummary milestone={m} />
            {onEdit && (
              <IconButton label={`Edit ${m.name}`} onClick={() => onEdit(m)}>
                <Pencil aria-hidden />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
