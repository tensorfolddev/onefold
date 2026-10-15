// Shared, directive-free pieces: usable from server pages and client components alike.
import { shortDate } from "@/domain/status";
import { Progress } from "@/ui/primitives";
import { Widget as BaseWidget } from "@/features/home/Widget";
import type { Milestone } from "@/domain/types";

/** The shared dashboard widget, with product-page body type (14/20). */
export function Widget({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <BaseWidget title={title} actions={action} className="product-widget">{children}</BaseWidget>;
}

export function MilestoneSummary({ milestone }: { milestone: Milestone }) {
  return (
    <div className="milestone-summary">
      <p className="milestone-line">
        <strong>{milestone.name}</strong>
        <span className="muted"> · due {shortDate(milestone.due)}</span>
        {milestone.lateDays > 0 && <span className="pd-late"> · {milestone.lateDays} days late</span>}
      </p>
      <div className="pd-meter">
        <Progress pct={milestone.pct} color={milestone.lateDays > 0 ? "var(--color-stuck-red)" : undefined} />
        <span className="meter-value">{milestone.pct}%</span>
      </div>
    </div>
  );
}
