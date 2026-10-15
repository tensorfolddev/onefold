"use client";
// Widgets computed from live tickets (useAppState), so status edits anywhere update them.

import { CircleCheck, FileText } from "lucide-react";
import { useMe } from "@/data/StoreProvider";
import { coverage, toneOf } from "@/domain/selectors/product";
import { useAppState } from "@/features/shell/state";
import { summaryOf } from "@/domain/templates";
import { Battery, EmptyState } from "@/ui/primitives";

function useRequirementRows(productKey: string) {
  const { db } = useMe();
  return db.requirements
    .filter((r) => r.productKey === productKey)
    .map((r) => {
      const linked = db.tickets.filter((t) => t.requirementId === r.id);
      return { req: r, linked, cov: coverage(db, linked) };
    });
}

function NoRequirements() {
  return (
    <EmptyState icon={<FileText aria-hidden />} title="No requirements yet">
      Requirements show up here once the Requirements doc is written.
    </EmptyState>
  );
}

function CoverageBar({ code, linkedCount, cov }: { code: string; linkedCount: number; cov: ReturnType<typeof coverage> }) {
  if (linkedCount) return <Battery segments={cov.segments} thin label={`${code} coverage: ${cov.label}`} />;
  return <span className="muted">No tickets linked yet</span>;
}

export function CoverageList({ productKey }: { productKey: string }) {
  const rows = useRequirementRows(productKey);
  if (!rows.length) return <NoRequirements />;
  return (
    <ul className="coverage-list">
      {rows.map(({ req, linked, cov }) => (
        <li key={req.id} className="coverage-row">
          <span className="coverage-name"><span className="key">{req.code}</span> {req.title}</span>
          <CoverageBar code={req.code} linkedCount={linked.length} cov={cov} />
          <span className="coverage-label">{cov.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function RequirementsTable({ productKey }: { productKey: string }) {
  const { openTicket } = useAppState();
  const { db } = useMe();
  const rows = useRequirementRows(productKey);
  if (!rows.length) return <NoRequirements />;
  return (
    <table className="pd-table">
      <thead>
        <tr><th>Code</th><th>Requirement</th><th>Linked tickets</th><th>Coverage</th></tr>
      </thead>
      <tbody>
        {rows.map(({ req, linked, cov }) => (
          <tr key={req.id}>
            <td data-label="Code"><span className="key">{req.code}</span></td>
            <td data-label="Requirement">{req.title}</td>
            <td data-label="Linked tickets">
              <span className="ticket-chips">
                {linked.length ? linked.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className="chip sm ticket-chip"
                    style={{ "--pill-tone": `var(--tone-${toneOf(db, t)})` } as React.CSSProperties}
                    onClick={() => openTicket(t.key)}
                    title={t.title}
                  >
                    {t.key}
                  </button>
                )) : <span className="muted">none</span>}
              </span>
            </td>
            <td data-label="Coverage">
              <span className="coverage-cell">
                <CoverageBar code={req.code} linkedCount={linked.length} cov={cov} />
                <span className="coverage-label">{cov.label}</span>
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BlockerList({ productKey }: { productKey: string }) {
  const { tickets, openTicket } = useAppState();
  const { db } = useMe();
  const blockers = tickets.filter((t) => t.productKey === productKey && toneOf(db, t) === "stuck");
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
