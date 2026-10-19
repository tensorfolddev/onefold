"use client";

// A product's decision log: a timeline of decision records, by month, newest first. Search it, filter it by status,
// open one (?d=<id>, so it can be linked) to read or edit it in the side panel.
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, Scale, Search, Ticket } from "lucide-react";
import { useMe } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Decision, DecisionStatus } from "@/domain/types";
import { Avatar, EmptyState, Tabs } from "@/ui/primitives";
import { DecisionPanel, NewDecision, STATUS, StatusPill, statusOf } from "./DecisionPanel";

const FILTERS = ["All", ...(Object.keys(STATUS) as DecisionStatus[]).map((s) => STATUS[s].label)];
const month = (date: string) => new Date(`${date.slice(0, 7)}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
const haystack = (d: Decision) => [d.title, d.why, d.context, d.alternatives, d.consequences, ...(d.ticketKeys ?? [])].join(" ").toLowerCase();

function DecisionRow({ decision, replacedBy, onOpen }: { decision: Decision; replacedBy?: Decision; onOpen: () => void }) {
  const { personById } = useMe();
  const status = statusOf(decision);
  const tickets = decision.ticketKeys?.length ?? 0;
  const docs = decision.docIds?.length ?? 0;
  return (
    <li className="decision-entry" style={{ "--status": STATUS[status].color } as React.CSSProperties}>
      <button type="button" className={`decision-row${status === "superseded" || status === "rejected" ? " is-faded" : ""}`} onClick={onOpen}>
        <span className="decision-row-head">
          <span className="decision-row-title">{decision.title}</span>
          <StatusPill status={status} />
        </span>
        <span className="decision-row-why">{decision.why}</span>
        <span className="decision-row-meta">
          <Avatar personId={decision.byId} size="sm" />
          <span>{personById(decision.byId)?.name ?? "Someone"}</span>
          <span aria-hidden>·</span>
          <time dateTime={decision.date}>{shortDate(decision.date)}</time>
          {tickets > 0 && <span className="decision-row-count" data-tip={`${tickets} linked ticket${tickets === 1 ? "" : "s"}`}><Ticket aria-hidden />{tickets}</span>}
          {docs > 0 && <span className="decision-row-count" data-tip={`${docs} linked doc${docs === 1 ? "" : "s"}`}><FileText aria-hidden />{docs}</span>}
          {replacedBy && <span className="decision-row-replaced">→ {replacedBy.title}</span>}
        </span>
      </button>
    </li>
  );
}

export function DecisionLog({ productKey }: { productKey: string }) {
  const { db, can, productByKey } = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const openId = useSearchParams().get("d");
  const product = productByKey(productKey);
  const canAdd = !!product && can("decision.add", { product });
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const all = db.decisions
    .filter((d) => d.productKey === productKey)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const byId = new Map(all.map((d) => [d.id, d]));
  const count = (label: string) => (label === "All" ? all.length : all.filter((d) => STATUS[statusOf(d)].label === label).length);
  const q = query.trim().toLowerCase();
  const shown = all.filter((d) => (filter === "All" || STATUS[statusOf(d)].label === filter) && (!q || haystack(d).includes(q)));
  const months = Map.groupBy(shown, (d) => month(d.date));
  const open = openId ? byId.get(openId) : undefined;
  const openDecision = (id: string | null) => router.replace(id ? `${pathname}?d=${id}` : pathname, { scroll: false });

  return (
    <div className="decisions">
      <header className="decisions-head">
        <div>
          <h2 className="decisions-title">Decisions</h2>
          <p className="decisions-sub">Why we chose what we chose, so nobody has to ask twice.</p>
        </div>
        {canAdd && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus aria-hidden /> New decision</button>}
      </header>

      {all.length > 0 && (
        <>
          <div className="decisions-mix" role="img" aria-label={FILTERS.slice(1).map((f) => `${count(f)} ${f.toLowerCase()}`).join(", ")}>
            {(Object.keys(STATUS) as DecisionStatus[]).map((s) => {
              const n = count(STATUS[s].label);
              return n ? <span key={s} style={{ flexGrow: n, background: STATUS[s].color }} /> : null;
            })}
          </div>
          <div className="decisions-toolbar">
            <Tabs ariaLabel="Filter by status" active={filter} onSelect={setFilter} items={FILTERS.map((label) => ({ label, count: count(label) }))} />
            <label className="docs-search decisions-search">
              <Search aria-hidden />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search decisions" aria-label="Search decisions" />
            </label>
          </div>
        </>
      )}

      {!all.length ? (
        <EmptyState icon={<Scale aria-hidden />} title="No decisions yet">
          Record why the team chose one path over another — the context, the options, the trade-offs.
        </EmptyState>
      ) : !shown.length ? (
        <EmptyState icon={<Search aria-hidden />} title="Nothing matches">Try another word or status.</EmptyState>
      ) : (
        [...months].map(([label, items]) => (
          <section key={label} className="decisions-month" aria-label={label}>
            <h3 className="decisions-month-title">{label} <span className="muted">{items.length}</span></h3>
            <ol className="decisions-timeline">
              {items.map((d) => <DecisionRow key={d.id} decision={d} replacedBy={d.supersededBy ? byId.get(d.supersededBy) : undefined} onOpen={() => openDecision(d.id)} />)}
            </ol>
          </section>
        ))
      )}

      {open && <DecisionPanel key={open.id} decision={open} onClose={() => openDecision(null)} onOpen={openDecision} />}
      {creating && <NewDecision productKey={productKey} onClose={() => setCreating(false)} />}
    </div>
  );
}
