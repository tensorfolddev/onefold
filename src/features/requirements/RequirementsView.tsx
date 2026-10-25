"use client";

// A project's requirements (FO-13): what it must do for its client, how far along each one is, and — for whoever
// manages the project — writing, confirming and dropping them. One opens in a side panel (?req=<id>, so it can be linked).
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ListChecks, Plus } from "lucide-react";
import { useState } from "react";
import { useMe } from "@/data/StoreProvider";
import { coverage } from "@/domain/selectors/product";
import { REQUIREMENT_PRIORITY, REQUIREMENT_STATUS, requirementProgress, statusOfRequirement } from "@/domain/selectors/requirements";
import { shortDate } from "@/domain/status";
import type { Requirement, RequirementStatus } from "@/domain/types";
import { Battery, EmptyState, StatusPill } from "@/ui/primitives";
import { NewRequirement } from "./NewRequirement";
import { RequirementPanel } from "./RequirementPanel";

type Filter = "active" | "draft" | "confirmed" | "dropped";
const FILTERS: { key: Filter; label: string; shows: (s: RequirementStatus) => boolean }[] = [
  { key: "active", label: "All", shows: (s) => s !== "dropped" },
  { key: "draft", label: "Draft", shows: (s) => s === "draft" },
  { key: "confirmed", label: "Confirmed", shows: (s) => s === "confirmed" },
  { key: "dropped", label: "Dropped", shows: (s) => s === "dropped" },
];

const codeNumber = (r: Requirement) => Number(/\d+/.exec(r.code)?.[0] ?? 0);
export const hoursText = (done: number, total: number) => (total ? `${done} / ${total} h` : "—");

export function RequirementsView({ productKey }: { productKey: string }) {
  const { db, can, productByKey } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const openId = useSearchParams().get("req");
  const product = productByKey(productKey);
  const editable = !!product && can("requirement.edit", { product });
  const [filter, setFilter] = useState<Filter>("active");
  const [creating, setCreating] = useState(false);

  const all = db.requirements.filter((r) => r.productKey === productKey).sort((a, b) => codeNumber(a) - codeNumber(b));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, all.filter((r) => f.shows(statusOfRequirement(r))).length])) as Record<Filter, number>;
  const shown = all.filter((r) => FILTERS.find((f) => f.key === filter)!.shows(statusOfRequirement(r)));
  const open = openId ? all.find((r) => r.id === openId) : undefined;
  const openRequirement = (id: string | null) => router.replace(id ? `${pathname}?req=${id}` : pathname, { scroll: false });

  return (
    <div className="requirements">
      <header className="requirements-head">
        <div>
          <h2 className="requirements-title">Requirements</h2>
          <p className="requirements-sub">What this project must do for its client, and what counts as done. Link tickets to see how far along each one is.</p>
        </div>
        {editable && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus aria-hidden /> New requirement</button>}
      </header>

      {!all.length ? (
        <EmptyState icon={<ListChecks aria-hidden />} title="No requirements yet">
          {editable ? "Write down what the project must do — each with its acceptance criteria." : "Whoever manages this project writes them here."}
        </EmptyState>
      ) : (
        <>
          <div className="docs-view-switch requirements-filter" role="tablist" aria-label="Show">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}>
                {f.label} <span className="requirements-count">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          {!shown.length ? <p className="requirements-none">Nothing here.</p> : (
            <table className="pd-table requirements-table">
              <thead>
                <tr><th>Code</th><th>Requirement</th><th>Priority</th><th>Status</th><th>Progress</th><th>Hours</th><th>Updated</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => <Row key={r.id} requirement={r} onOpen={() => openRequirement(r.id)} />)}
              </tbody>
            </table>
          )}
        </>
      )}

      {open && <RequirementPanel key={open.id} requirement={open} onClose={() => openRequirement(null)} />}
      {creating && <NewRequirement productKey={productKey} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); openRequirement(id); }} />}
    </div>
  );
}

function Row({ requirement: r, onOpen }: { requirement: Requirement; onOpen: () => void }) {
  const { db } = useMe();
  const status = statusOfRequirement(r);
  const p = requirementProgress(db, r);
  const cov = coverage(db, p.linked);
  return (
    <tr className={`requirements-row${status === "dropped" ? " is-dropped" : ""}`} onClick={onOpen}>
      <td className="key">{r.code}</td>
      <td><button type="button" className="requirements-name" onClick={(e) => { e.stopPropagation(); onOpen(); }}>{r.title}</button></td>
      <td>{r.priority ? <span className="requirement-priority is-static" style={{ "--p": REQUIREMENT_PRIORITY[r.priority].color } as React.CSSProperties}>{REQUIREMENT_PRIORITY[r.priority].short}</span> : <span className="muted">—</span>}</td>
      <td><StatusPill name={REQUIREMENT_STATUS[status].label} tone={REQUIREMENT_STATUS[status].tone} /></td>
      <td>
        {p.total ? (
          <span className="requirements-progress">
            <Battery segments={cov.segments} thin label={`${r.code}: ${p.done} of ${p.total} done`} />
            <span className="muted">{p.done} / {p.total} done</span>
          </span>
        ) : <span className="muted">No tickets yet</span>}
      </td>
      <td className="muted">{hoursText(p.hoursDone, p.hoursTotal)}</td>
      <td className="muted">{shortDate(r.updatedAt)}</td>
    </tr>
  );
}
