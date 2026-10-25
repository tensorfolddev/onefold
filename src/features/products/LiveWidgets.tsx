"use client";
// Widgets computed from live tickets (useAppState), so status edits anywhere update them. (Requirements: the Requirements tab.)

import { CircleCheck } from "lucide-react";
import { useMe } from "@/data/StoreProvider";
import { isBlocked } from "@/domain/selectors/dashboard";
import { useAppState } from "@/features/shell/state";
import { summaryOf } from "@/domain/templates";
import { EmptyState } from "@/ui/primitives";

export function BlockerList({ productKey }: { productKey: string }) {
  const { tickets, openTicket } = useAppState();
  const { db } = useMe();
  const blockers = tickets.filter((t) => t.productKey === productKey && isBlocked(db, t));
  if (!blockers.length) {
    return <EmptyState icon={<CircleCheck aria-hidden />} title="No blockers">Nothing is stuck right now.</EmptyState>;
  }
  return (
    <ul className="blocker-list">
      {blockers.map((t) => (
        <li key={t.key}>
          <button type="button" className="blocker-row" onClick={() => openTicket(t.key)}>
            <span className="blocker-title"><span className="key">{t.key}</span> {t.title}</span>
            {summaryOf(t) && <span className="blocker-desc">{summaryOf(t)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
