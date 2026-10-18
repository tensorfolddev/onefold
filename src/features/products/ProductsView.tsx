"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CalendarDays, Clock, Columns3, FolderOpen, ListTodo, Table2, UserRound } from "lucide-react";
import { today } from "@/domain/clock";
import { visibleProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { donePct, isOpenTicket, nextMilestone } from "@/domain/selectors/product";
import { STAGES, STAGE_TONE, shortDate } from "@/domain/status";
import { Avatar, EmptyState, HealthDot, Progress, ProductTile, StagePill, Tabs } from "@/ui/primitives";
import type { Product, Ticket } from "@/domain/types";

const VIEWS = [
  { label: "Pipeline", icon: <Columns3 aria-hidden /> },
  { label: "Table", icon: <Table2 aria-hidden /> },
];

export function ProductsView() {
  const [view, setView] = useState("Pipeline");
  const { db } = useMe();
  const done = (p: Product) => donePct(db, db.tickets.filter((t: Ticket) => t.productKey === p.key));
  return (
    <>
      <Tabs items={VIEWS} active={view} onSelect={setView} ariaLabel="Products view" />
      <div role="tabpanel" aria-label={view} className="products-view">
        {view === "Pipeline" ? <Pipeline done={done} /> : <ProductTable />}
      </div>
    </>
  );
}

function Pipeline({ done }: { done: (p: Product) => number | null }) {
  const { me, db, href } = useMe();
  const products = visibleProducts(me, db.products);
  return (
    <div className="pipeline">
      {STAGES.map((stage) => {
        const inStage = products.filter((p) => p.stage === stage);
        return (
          <section key={stage} className="pipeline-col" aria-label={`${stage} stage`}>
            <header className="pipeline-col-header" style={{ "--stage": STAGE_TONE[stage] } as React.CSSProperties}>
              {stage}
              <span className="pipeline-count">{inStage.length}</span>
            </header>
            <ul className="pipeline-body">
              {inStage.map((p) => {
                const pct = done(p);
                return (
                  <li key={p.key}>
                    <Link href={href(`/products/${p.key}`)} className="pipeline-card">
                      <span className="pipeline-card-title">
                        <ProductTile product={p} />
                        {p.name}
                      </span>
                      <span className="muted">{p.type === "client" ? p.client : "Internal"}</span>
                      <span className="pipeline-card-meta">
                        <HealthDot health={p.health} />
                        <Avatar personId={p.pmId} size="sm" />
                      </span>
                      {pct !== null && (
                        <span className="pd-meter">
                          <Progress pct={pct} color="var(--color-done-green)" />
                          <span className="meter-value">{pct}%</span>
                        </span>
                      )}
                      {p.waitingApproval && (
                        <span className="chip sm waiting-chip"><Clock aria-hidden /> Waiting for approval</span>
                      )}
                    </Link>
                  </li>
                );
              })}
              {!inStage.length && <li className="pipeline-empty">No products</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function ProductTable() {
  const { me, db, href } = useMe();
  const products = visibleProducts(me, db.products);
  return (
    <table className="pd-table products-table">
      <thead>
        <tr><th>Product</th><th>Type</th><th>Stage</th><th>Health</th><th>PM</th><th>Next milestone</th></tr>
      </thead>
      <tbody>
        {products.map((p) => {
          const ms = nextMilestone(db, p.key);
          return (
            <tr key={p.key} className="row-linked">
              <td data-label="Product">
                <Link href={href(`/products/${p.key}`)} className="row-link">
                  <ProductTile product={p} /> {p.name}
                </Link>
              </td>
              <td data-label="Type">{p.type === "client" ? `Client · ${p.client}` : "Internal"}</td>
              <td data-label="Stage"><StagePill stage={p.stage} /></td>
              <td data-label="Health"><HealthDot health={p.health} /></td>
              <td data-label="PM"><Avatar personId={p.pmId} size="sm" /></td>
              <td data-label="Next milestone">
                {ms ? (
                  <>
                    {ms.name} · {shortDate(ms.due)}
                    {ms.lateDays > 0 && <span className="pd-late"> · {ms.lateDays}d late</span>}
                  </>
                ) : <span className="muted">—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Developer view of "All products": one big card per product they work on, straight into its tickets. */
export function ProductCards() {
  const { me, db } = useMe();
  const products = visibleProducts(me, db.products);
  if (!products.length) {
    return (
      <EmptyState icon={<FolderOpen aria-hidden />} title="You're not on any product yet">
        Ask your manager to add you to a product.
      </EmptyState>
    );
  }
  return (
    <ul className="product-cards">
      {products.map((p) => <li key={p.key}><ProductCard product={p} /></li>)}
    </ul>
  );
}

const TEAM_SHOWN = 5;

/** Days from the demo "today" to an ISO date (negative = late). UTC so there's no timezone drift. */
const daysUntil = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today()}T00:00:00Z`)) / 86_400_000);

/** % done as a ring in the product's colour (hand-written SVG; r chosen so the circumference is 100). */
function ProgressRing({ pct, color }: { pct: number | null; color: string }) {
  const R = 15.915;
  return (
    <span className="pc-ring" role="img" aria-label={pct === null ? "No tickets yet" : `${pct}% done`}>
      <svg viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r={R} className="pc-ring-track" />
        {pct !== null && pct > 0 && (
          <circle cx="18" cy="18" r={R} className="pc-ring-bar" style={{ stroke: color }} strokeDasharray={`${pct} ${100 - pct}`} />
        )}
      </svg>
      <span className="pc-ring-value">{pct === null ? "—" : <>{pct}<small>%</small></>}</span>
    </span>
  );
}

function ProductCard({ product: p }: { product: Product }) {
  const { me, db, href, personById } = useMe();
  const tickets = db.tickets.filter((t) => t.productKey === p.key);
  const open = tickets.filter((t) => isOpenTicket(db, t));
  const mine = open.filter((t) => t.assigneeIds?.includes(me.id)).length;
  const pct = donePct(db, tickets);
  const ms = nextMilestone(db, p.key);
  const days = ms ? daysUntil(ms.due) : null;
  const team = [...new Set([p.pmId, p.projectManagerId, ...p.memberIds])].filter((id) => personById(id)?.active);

  return (
    <Link href={href(`/products/${p.key}/tickets`)} className="pc" style={{ "--product": p.color } as React.CSSProperties}>
      <div className="pc-head">
        <ProductTile product={p} size="lg" />
        <div className="pc-title">
          <h2 className="pc-name">{p.name}</h2>
          <span className="pc-meta">
            <span>{p.type === "client" ? p.client : "Internal"}</span>
            <HealthDot health={p.health} />
          </span>
        </div>
        <ProgressRing pct={pct} color={p.color} />
      </div>

      <p className="pc-desc">{p.description}</p>

      <div className="pc-chips">
        <span className={`pc-chip${mine ? " is-mine" : ""}`}><UserRound aria-hidden /><strong>{mine}</strong> assigned to you</span>
        <span className="pc-chip"><ListTodo aria-hidden /><strong>{open.length}</strong> open {open.length === 1 ? "ticket" : "tickets"}</span>
      </div>

      <div className="pc-milestone">
        <CalendarDays aria-hidden />
        {ms ? (
          <>
            <span className="pc-ms-name">{ms.name}</span>
            <span className="muted">· {shortDate(ms.due)}</span>
            <span className={`pc-ms-when${days !== null && days < 0 ? " is-late" : ""}`}>
              {days === null ? "" : days < 0 ? `${-days} days late` : days === 0 ? "today" : `in ${days} days`}
            </span>
          </>
        ) : <span className="muted">No milestone yet</span>}
      </div>

      <footer className="pc-foot">
        <span className="avatar-stack" aria-label={`${team.length} people on this product`}>
          {team.slice(0, TEAM_SHOWN).map((id) => <Avatar key={id} personId={id} size="sm" />)}
          {team.length > TEAM_SHOWN && <span className="product-card-more">+{team.length - TEAM_SHOWN}</span>}
        </span>
        <span className="pc-cta"><span>Open board</span><span className="pc-cta-arrow" aria-hidden><ArrowRight /></span></span>
      </footer>
    </Link>
  );
}
