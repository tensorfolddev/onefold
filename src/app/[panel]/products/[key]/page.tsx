"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Flag, Scale } from "lucide-react";
import { countByCategory } from "@/domain/selectors/dashboard";
import { nextMilestone } from "@/domain/selectors/product";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import { EmptyState, Progress } from "@/ui/primitives";
import { MilestoneSummary, Widget } from "@/features/products/Widgets";
import { BlockerList, CoverageList } from "@/features/products/LiveWidgets";

export default function ProductOverview() {
  const { key } = useParams<{ key: string }>();
  const { db, href } = useMe();
  const milestone = nextMilestone(db, key);
  const recent = db.decisions
    .filter((d) => d.productKey === key)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  return (
    <div className="product-grid">
      <div className="product-col">
        <Widget title="Requirements coverage">
          <CoverageList productKey={key} />
        </Widget>
        <Widget
          title="Recent decisions"
          action={<Link href={href(`/products/${key}/decisions`)} className="btn btn-tertiary">See all</Link>}
        >
          {recent.length ? (
            <ul className="decision-mini-list">
              {recent.map((d) => (
                <li key={d.id}>
                  <Link href={href(`/products/${key}/decisions?d=${d.id}`)} className="decision-mini">
                    <span>{d.title}</span>
                    <span className="muted">{shortDate(d.date)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Scale aria-hidden />} title="No decisions yet">Record the first one from the Decisions tab.</EmptyState>
          )}
        </Widget>
      </div>
      <div className="product-col">
        <Widget title={milestone ? `Milestone ${milestone.name}` : "Milestone"}>
          {milestone ? (
            <MilestoneSummary milestone={milestone} />
          ) : (
            <EmptyState icon={<Flag aria-hidden />} title="No milestones yet">Milestones are set in the PLAN stage.</EmptyState>
          )}
        </Widget>
        <Widget title="Progress">
          <ProductProgress productKey={key} />
        </Widget>
        <Widget title="Blockers">
          <BlockerList productKey={key} />
        </Widget>
      </div>
    </div>
  );
}

/** Tasks and bugs by state (epics are containers, so they don't count). */
function ProductProgress({ productKey }: { productKey: string }) {
  const { db } = useMe();
  const tickets = db.tickets.filter((t) => t.productKey === productKey && t.type !== "epic");
  const c = countByCategory(db, tickets);
  const total = tickets.length - c.cancelled;
  if (!total) return <p className="muted">No tickets yet — add them on the Tickets tab.</p>;
  const pct = Math.round((c.done / total) * 100);
  return (
    <div className="progress-meter">
      <p><strong>{c.done}</strong> of {total} done · {c.in_progress} in progress · {c.todo + c.backlog} to do</p>
      <div className="pd-meter">
        <Progress pct={pct} color="var(--color-done-green)" />
        <span className="meter-value">{pct}%</span>
      </div>
    </div>
  );
}
