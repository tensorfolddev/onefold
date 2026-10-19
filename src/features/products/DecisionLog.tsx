"use client";

// A product's decision log, as a wall of sticky notes (the default) or a monday-style table (one group per status or
// label, a coloured status cell you can change in place, who decided, when, what it links to). Either way a click
// opens the full record (?d=<id>, so it can be linked). Notes take a colour of your choosing; statuses can be the
// team's own labels (Suspended, On hold…).
import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, FileText, Plus, Scale, Search, StickyNote, Table2 } from "lucide-react";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Decision } from "@/domain/types";
import { Avatar, EmptyState } from "@/ui/primitives";
import { DecisionPanel, NewDecision } from "./DecisionPanel";
import { groupsOf, NoteColorMenu, shownStatus, StatusMenu, tone, type Shown } from "./DecisionStatus";

type View = "table" | "notes";
const VIEW_KEY = "onefold.decisions.view";
const SHOWN_TICKETS = 2;
const CLOSED = new Set(["rejected", "superseded"]); // groups that start folded
const haystack = (d: Decision) => [d.title, d.why, d.context, d.alternatives, d.consequences, d.label?.name, ...(d.ticketKeys ?? [])].join(" ").toLowerCase();

function StatusCell({ decision, siblings, editable }: { decision: Decision; siblings: Decision[]; editable: boolean }) {
  const s = shownStatus(decision);
  return (
    <span role="cell" className="decision-cell-status" style={tone(s.color)}>
      {editable ? <StatusMenu decision={decision} siblings={siblings} variant="cell" /> : s.label}
    </span>
  );
}

function Group({ group, items, siblings, all, editable, forceOpen, onOpen }: {
  group: Shown; items: Decision[]; siblings: Decision[]; all: Map<string, Decision>; editable: boolean; forceOpen: boolean; onOpen: (id: string) => void;
}) {
  const { personById } = useMe();
  const [open, setOpen] = useState(!CLOSED.has(group.key));
  const shown = open || forceOpen;
  const label = group.label;
  return (
    <section className="docs-board-group decision-group" style={tone(group.color)} aria-label={label}>
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
                <StatusCell decision={d} siblings={siblings} editable={editable} />
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

/** The wall: one sticky note per decision, in board order (open questions first), each in its own colour. */
function StickyWall({ items, groups, all, editable, onOpen }: {
  items: Decision[]; groups: Shown[]; all: Map<string, Decision>; editable: boolean; onOpen: (id: string) => void;
}) {
  const { personById } = useMe();
  const ordered = groups.flatMap((g) => items.filter((d) => shownStatus(d).key === g.key));
  return (
    <ul className="decision-wall" aria-label="Decisions as notes">
      {ordered.map((d) => {
        const s = shownStatus(d);
        const replacedBy = d.supersededBy ? all.get(d.supersededBy) : undefined;
        const keys = d.ticketKeys ?? [];
        return (
          <li key={d.id} style={{ ...tone(s.color), "--paper": d.color ?? s.color } as React.CSSProperties}>
            <button type="button" className="decision-sticky" onClick={() => onOpen(d.id)}>
              <span className="decision-sticky-status">{s.label}</span>
              <span className="decision-sticky-title">{d.title}</span>
              <span className="decision-sticky-why">{d.why}</span>
              {replacedBy && <span className="decision-sticky-replaced">→ {replacedBy.title}</span>}
              <span className="decision-sticky-foot">
                <Avatar personId={d.byId} size="sm" />
                <span className="decision-sticky-by">{personById(d.byId)?.name.split(" ")[0]} · {shortDate(d.date)}</span>
                {keys.slice(0, SHOWN_TICKETS).map((k) => <span key={k} className="decision-key">{k}</span>)}
                {keys.length > SHOWN_TICKETS && <span className="decision-key">+{keys.length - SHOWN_TICKETS}</span>}
              </span>
            </button>
            {editable && <NoteColorMenu decision={d} />}
          </li>
        );
      })}
    </ul>
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
  const [view, setViewState] = useState<View>("notes");
  useEffect(() => {
    try { if (localStorage.getItem(VIEW_KEY) === "table") setViewState("table"); } catch { /* per-browser convenience only */ } // eslint-disable-line react-hooks/set-state-in-effect -- this browser's choice
  }, []);
  const setView = (v: View) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* per-browser convenience only */ }
  };

  const all = db.decisions
    .filter((d) => d.productKey === productKey)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const byId = new Map(all.map((d) => [d.id, d]));
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((d) => haystack(d).includes(q)) : all;
  const groups = groupsOf(all);
  const open = openId ? byId.get(openId) : undefined;
  const openDecision = (id: string | null) => router.replace(id ? `${pathname}?d=${id}` : pathname, { scroll: false });

  return (
    <div className="decisions">
      <header className="decisions-head">
        <h2 className="decisions-title">Decisions</h2>
        <p className="decisions-sub">Why we chose what we chose, so nobody has to ask twice.</p>
      </header>
      <div className="decisions-toolbar">
        {all.length > 0 && (
          <label className="docs-search decisions-search">
            <Search aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search decisions" aria-label="Search decisions" />
          </label>
        )}
        <div className="decisions-actions">
          {all.length > 0 && (
            <div className="docs-view-switch" role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={view === "table"} onClick={() => setView("table")}><Table2 aria-hidden /> Table</button>
              <button type="button" role="tab" aria-selected={view === "notes"} onClick={() => setView("notes")}><StickyNote aria-hidden /> Notes</button>
            </div>
          )}
          {canAdd && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus aria-hidden /> New decision</button>}
        </div>
      </div>

      {!all.length ? (
        <EmptyState icon={<Scale aria-hidden />} title="No decisions yet">
          Record why the team chose one path over another — the context, the options, the trade-offs.
        </EmptyState>
      ) : q && !shown.length ? (
        <EmptyState icon={<Search aria-hidden />} title="Nothing matches">Try another word.</EmptyState>
      ) : view === "notes" ? (
        <StickyWall items={shown} groups={groups} all={byId} editable={canAdd} onOpen={openDecision} />
      ) : (
        <div className="docs-board">
          {groups.map((g) => (
            <Group key={g.key} group={g} items={shown.filter((d) => shownStatus(d).key === g.key)} siblings={all} all={byId} editable={canAdd} forceOpen={!!q} onOpen={openDecision} />
          ))}
        </div>
      )}

      {open && <DecisionPanel key={open.id} decision={open} onClose={() => openDecision(null)} onOpen={openDecision} />}
      {creating && <NewDecision productKey={productKey} onClose={() => setCreating(false)} />}
    </div>
  );
}
