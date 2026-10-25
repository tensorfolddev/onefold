"use client";

// A project's requirements (FO-13): what it must do for its client, how far along each one is, and — for whoever
// manages the project — writing, confirming and dropping them. A monday-style table like the decision log's: one group
// per status (Dropped starts folded), a full-colour status cell, priority, progress from linked tickets, hours, where
// it came from — or (the default) a board like the tickets' one (RequirementBoard). A click opens one in the side
// panel (?req=<id>, so it can be linked).
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ListChecks, Plus, Search, SquareKanban, Table2 } from "lucide-react";
import { useState } from "react";
import { useMe } from "@/data/StoreProvider";
import { coverage } from "@/domain/selectors/product";
import { REQUIREMENT_PRIORITY, REQUIREMENT_STATUS, requirementProgress, SOURCE_KINDS, STATUS_ORDER, statusOfRequirement } from "@/domain/selectors/requirements";
import { shortDate } from "@/domain/status";
import type { Requirement, RequirementStatus } from "@/domain/types";
import { tone } from "@/features/products/DecisionStatus";
import { Battery, EmptyState } from "@/ui/primitives";
import { NewRequirement } from "./NewRequirement";
import { RequirementBoard } from "./RequirementBoard";
import { RequirementPanel } from "./RequirementPanel";

const codeNumber = (r: Requirement) => Number(/\d+/.exec(r.code)?.[0] ?? 0);
export const hoursText = (done: number, total: number) => (total ? `${done} / ${total} h` : "—");
const haystack = (r: Requirement) => [r.code, r.title, r.description, r.source?.note, ...(r.criteria ?? []).map((c) => c.text)].join(" ").toLowerCase();

export function RequirementsView({ productKey }: { productKey: string }) {
  const { db, can, productByKey } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const openId = useSearchParams().get("req");
  const product = productByKey(productKey);
  const editable = !!product && can("requirement.edit", { product });
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  // The board every time the tab opens; the table is a switch for this visit (like the decision log's notes).
  const [view, setView] = useState<"board" | "table">("board");

  const all = db.requirements.filter((r) => r.productKey === productKey).sort((a, b) => codeNumber(a) - codeNumber(b));
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((r) => haystack(r).includes(q)) : all;
  const open = openId ? all.find((r) => r.id === openId) : undefined;
  const openRequirement = (id: string | null) => router.replace(id ? `${pathname}?req=${id}` : pathname, { scroll: false });

  return (
    <div className="requirements decisions">
      <header className="decisions-head">
        <h2 className="decisions-title">Requirements</h2>
        <p className="decisions-sub">What this project must do for its client, and what counts as done. Link tickets to see how far along each one is.</p>
      </header>
      <div className="decisions-toolbar">
        {all.length > 0 && (
          <label className="docs-search decisions-search">
            <Search aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search requirements" aria-label="Search requirements" />
          </label>
        )}
        <div className="decisions-actions">
          {all.length > 0 && (
            <div className="docs-view-switch" role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={view === "board"} onClick={() => setView("board")}><SquareKanban aria-hidden /> Board</button>
              <button type="button" role="tab" aria-selected={view === "table"} onClick={() => setView("table")}><Table2 aria-hidden /> Table</button>
            </div>
          )}
          {editable && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus aria-hidden /> New requirement</button>}
        </div>
      </div>

      {!all.length ? (
        <EmptyState icon={<ListChecks aria-hidden />} title="No requirements yet">
          {editable ? "Write down what the project must do — each with its acceptance criteria." : "Whoever manages this project writes them here."}
        </EmptyState>
      ) : q && !shown.length ? (
        <EmptyState icon={<Search aria-hidden />} title="Nothing matches">Try another word.</EmptyState>
      ) : view === "board" ? (
        <RequirementBoard productKey={productKey} items={shown} editable={editable} onOpen={openRequirement} />
      ) : (
        <div className="docs-board">
          {STATUS_ORDER.map((status) => {
            const items = shown.filter((r) => statusOfRequirement(r) === status);
            return items.length ? <Group key={status} status={status} items={items} forceOpen={!!q} onOpen={openRequirement} /> : null;
          })}
        </div>
      )}

      {open && <RequirementPanel key={open.id} requirement={open} onClose={() => openRequirement(null)} />}
      {creating && <NewRequirement productKey={productKey} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); openRequirement(id); }} />}
    </div>
  );
}

function Group({ status, items, forceOpen, onOpen }: { status: RequirementStatus; items: Requirement[]; forceOpen: boolean; onOpen: (id: string) => void }) {
  const [open, setOpen] = useState(status !== "dropped");
  const shown = open || forceOpen;
  const { label, color } = REQUIREMENT_STATUS[status];
  return (
    <section className="docs-board-group decision-group" style={tone(color)} aria-label={label}>
      <button type="button" className="docs-board-head" aria-expanded={shown} onClick={() => setOpen((o) => !o)}>
        <ChevronDown aria-hidden className={shown ? undefined : "is-collapsed"} />
        <span className="docs-board-name">{label}</span>
        <span className="docs-board-count">{items.length} {items.length === 1 ? "requirement" : "requirements"}</span>
      </button>
      {shown && (
        <div className="docs-board-table requirement-table" role="table" aria-label={`${label} requirements`}>
          <div className="docs-board-row is-head" role="row">
            <span role="columnheader">Requirement</span><span role="columnheader">Priority</span><span role="columnheader">Status</span>
            <span role="columnheader">Progress</span><span role="columnheader">Hours</span><span role="columnheader">From</span><span role="columnheader">Updated</span>
          </div>
          {items.map((r) => <Row key={r.id} requirement={r} onOpen={() => onOpen(r.id)} />)}
        </div>
      )}
    </section>
  );
}

function Row({ requirement: r, onOpen }: { requirement: Requirement; onOpen: () => void }) {
  const { db } = useMe();
  const status = statusOfRequirement(r);
  const p = requirementProgress(db, r);
  const cov = coverage(db, p.linked);
  const priority = r.priority ? REQUIREMENT_PRIORITY[r.priority] : undefined;
  return (
    <div className={`docs-board-row decision-row requirements-row${status === "dropped" ? " is-dropped" : ""}`} role="row">
      <span role="cell" className="decision-cell-title">
        <span className="requirement-code">{r.code}</span>
        <button type="button" className="decision-open requirements-name" onClick={onOpen}>{r.title}</button>
      </span>
      <span role="cell">
        {priority ? <span className="requirement-priority is-static" style={{ "--p": priority.color } as React.CSSProperties}>{priority.short}</span> : <span className="muted">—</span>}
      </span>
      <span role="cell" className="decision-cell-status" style={tone(REQUIREMENT_STATUS[status].color)}>{REQUIREMENT_STATUS[status].label}</span>
      <span role="cell" className="requirements-progress">
        {p.total ? <><Battery segments={cov.segments} thin label={`${r.code}: ${p.done} of ${p.total} done`} /><span className="muted">{p.done}/{p.total}</span></>
          : <span className="muted">No tickets</span>}
      </span>
      <span role="cell" className="docs-board-when">{hoursText(p.hoursDone, p.hoursTotal)}</span>
      <span role="cell" className="docs-board-when requirement-from" data-tip={r.source?.note}>{r.source ? SOURCE_KINDS[r.source.kind] : "—"}</span>
      <span role="cell" className="docs-board-when">{shortDate(r.updatedAt)}</span>
    </div>
  );
}
