"use client";

// A product's decision log as a monday-style table: one group per status, a coloured status cell you can change in
// place, who decided, when, and what it links to. Click a row to open the full record (?d=<id>, so it can be linked).
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, FileText, Plus, Scale, Search } from "lucide-react";
import { updateDecision } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Decision, DecisionStatus } from "@/domain/types";
import { Avatar, EmptyState } from "@/ui/primitives";
import { DecisionPanel, NewDecision, STATUS, statusOf } from "./DecisionPanel";

const GROUPS: DecisionStatus[] = ["proposed", "accepted", "rejected", "superseded"];
const SHOWN_TICKETS = 2;
const haystack = (d: Decision) => [d.title, d.why, d.context, d.alternatives, d.consequences, ...(d.ticketKeys ?? [])].join(" ").toLowerCase();
const tone = (s: DecisionStatus) => ({ "--status": STATUS[s].color, "--group": STATUS[s].color }) as React.CSSProperties;

function StatusCell({ decision, editable }: { decision: Decision; editable: boolean }) {
  const { act } = useMe();
  const status = statusOf(decision);
  if (!editable) return <span role="cell" className="decision-cell-status" style={tone(status)}>{STATUS[status].label}</span>;
  return (
    <span role="cell" className="decision-cell-status" style={tone(status)}>
      <select aria-label={`Status of ${decision.title}`} value={status} onChange={(e) => {
        const next = e.target.value as DecisionStatus;
        act((d, m) => updateDecision(d, m, decision.id, { status: next, ...(next !== "superseded" && { supersededBy: null }) }));
      }}>
        {GROUPS.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
      </select>
    </span>
  );
}

function Group({ status, items, all, editable, forceOpen, onOpen }: {
  status: DecisionStatus; items: Decision[]; all: Map<string, Decision>; editable: boolean; forceOpen: boolean; onOpen: (id: string) => void;
}) {
  const { personById } = useMe();
  const [open, setOpen] = useState(status === "proposed" || status === "accepted");
  const shown = open || forceOpen;
  const label = STATUS[status].label;
  return (
    <section className="docs-board-group decision-group" style={tone(status)} aria-label={label}>
      <button type="button" className="docs-board-head" aria-expanded={shown} onClick={() => setOpen((o) => !o)}>
        <ChevronDown aria-hidden className={shown ? undefined : "is-collapsed"} />
        <span className="docs-board-name">{label}</span>
        <span className="docs-board-count">{items.length} {items.length === 1 ? "decision" : "decisions"}</span>
      </button>
      {shown && (
        <div className="docs-board-table decision-table" role="table" aria-label={`${label} decisions`}>
          <div className="docs-board-row is-head" role="row">
            <span role="columnheader">Decision</span><span role="columnheader">Status</span><span role="columnheader">Decided by</span>
            <span role="columnheader">Date</span><span role="columnheader">Tickets</span><span role="columnheader">Docs</span>
          </div>
          {!items.length && <div className="docs-board-row is-empty" role="row"><span role="cell">No {label.toLowerCase()} decisions</span></div>}
          {items.map((d) => {
            const by = personById(d.byId);
            const keys = d.ticketKeys ?? [];
            const replacedBy = d.supersededBy ? all.get(d.supersededBy) : undefined;
            return (
              <div key={d.id} className="docs-board-row decision-row" role="row">
                <span role="cell" className="decision-cell-title">
                  <button type="button" className="decision-open" onClick={() => onOpen(d.id)}>{d.title}</button>
                  {replacedBy && <span className="decision-cell-replaced">→ {replacedBy.title}</span>}
                </span>
                <StatusCell decision={d} editable={editable} />
                <span role="cell" className="docs-board-person">{by && <><Avatar personId={by.id} size="sm" /> {by.name}</>}</span>
                <span role="cell" className="docs-board-when"><time dateTime={d.date}>{shortDate(d.date)}</time></span>
                <span role="cell" className="decision-cell-tickets">
                  {keys.slice(0, SHOWN_TICKETS).map((k) => <span key={k} className="decision-key">{k}</span>)}
                  {keys.length > SHOWN_TICKETS && <span className="decision-more" data-tip={keys.slice(SHOWN_TICKETS).join(", ")}>+{keys.length - SHOWN_TICKETS}</span>}
                </span>
                <span role="cell" className="docs-board-when">{d.docIds?.length ? <><FileText aria-hidden className="decision-doc-icon" /> {d.docIds.length}</> : null}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function DecisionLog({ productKey }: { productKey: string }) {
  const { db, can, productByKey } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const openId = useSearchParams().get("d");
  const product = productByKey(productKey);
  const canAdd = !!product && can("decision.add", { product });
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const all = db.decisions
    .filter((d) => d.productKey === productKey)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const byId = new Map(all.map((d) => [d.id, d]));
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((d) => haystack(d).includes(q)) : all;
  const open = openId ? byId.get(openId) : undefined;
  const openDecision = (id: string | null) => router.replace(id ? `${pathname}?d=${id}` : pathname, { scroll: false });

  return (
    <div className="decisions">
      <header className="decisions-head">
        <div>
          <h2 className="decisions-title">Decisions</h2>
          <p className="decisions-sub">Why we chose what we chose, so nobody has to ask twice.</p>
        </div>
        <div className="decisions-actions">
          {all.length > 0 && (
            <label className="docs-search decisions-search">
              <Search aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search decisions" aria-label="Search decisions" />
            </label>
          )}
          {canAdd && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus aria-hidden /> New decision</button>}
        </div>
      </header>

      {!all.length ? (
        <EmptyState icon={<Scale aria-hidden />} title="No decisions yet">
          Record why the team chose one path over another — the context, the options, the trade-offs.
        </EmptyState>
      ) : q && !shown.length ? (
        <EmptyState icon={<Search aria-hidden />} title="Nothing matches">Try another word.</EmptyState>
      ) : (
        <div className="docs-board">
          {GROUPS.map((s) => (
            <Group key={s} status={s} items={shown.filter((d) => statusOf(d) === s)} all={byId} editable={canAdd} forceOpen={!!q} onOpen={openDecision} />
          ))}
        </div>
      )}

      {open && <DecisionPanel key={open.id} decision={open} onClose={() => openDecision(null)} onOpen={openDecision} />}
      {creating && <NewDecision productKey={productKey} onClose={() => setCreating(false)} />}
    </div>
  );
}
