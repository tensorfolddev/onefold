"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { toneOf, weekLabel, weekOf } from "@/domain/selectors/mywork";
import { useAppState } from "@/features/shell/state";
import { toneVar } from "@/domain/status";
import type { Ticket, Tone } from "@/domain/types";
import { IconButton } from "@/ui/primitives";
import { useDb } from "@/data/StoreProvider";

const LEGEND: { tone: Tone; label: string }[] = [
  { tone: "working", label: "Working" },
  { tone: "stuck", label: "Blocked" },
  { tone: "review", label: "Review" },
  { tone: "todo", label: "To do" },
  { tone: "done", label: "Done" },
];

export function WeekCalendar({ tickets }: { tickets: Ticket[] }) {
  const { db } = useDb();
  const { openTicket } = useAppState();
  const week = weekOf();

  return (
    <div className="mw-cal-wrap">
      <div className="toolbar">
        <span className="spacer" />
        {/* ponytail: demo data covers one week, so paging is disabled rather than showing empty weeks. */}
        <button type="button" className="btn btn-secondary" aria-current="date">Today</button>
        <IconButton label="Previous week (demo has one week)"><ChevronLeft /></IconButton>
        <IconButton label="Next week (demo has one week)"><ChevronRight /></IconButton>
        <span className="mw-cal-range">{weekLabel(week)}</span>
      </div>

      <div className="mw-cal" role="grid" aria-label={`Week of ${weekLabel(week)}`}>
        {week.map((d) => {
          const due = tickets.filter((t) => t.due === d.iso);
          return (
            <div
              key={d.iso}
              role="gridcell"
              className={`mw-cal-day${d.isWeekend ? " is-weekend" : ""}${d.isToday ? " is-today" : ""}`}
              aria-current={d.isToday ? "date" : undefined}
            >
              <div className="mw-cal-head">
                <span className="mw-cal-dayname">{d.name}</span>
                <span className="mw-cal-daynum">{d.num}</span>
              </div>
              <div className="mw-cal-events">
                {due.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className="mw-cal-event"
                    style={{ background: toneVar(toneOf(db, t)) }}
                    onClick={() => openTicket(t.key)}
                  >
                    {t.key} | {t.title}
                  </button>
                ))}
                {due.length === 0 && <span className="mw-cal-none">No due items</span>}
              </div>
            </div>
          );
        })}
      </div>

      <ul className="mw-legend" aria-label="Legend">
        <li className="mw-legend-title">Due date · colour = status</li>
        {LEGEND.map((l) => (
          <li key={l.tone}>
            <span className="chip-dot" style={{ background: toneVar(l.tone) }} aria-hidden />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
