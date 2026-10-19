"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, FolderOpen, ListTodo, UserRound } from "lucide-react";
import { today } from "@/domain/clock";
import { useMe } from "@/data/StoreProvider";
import { donePct, isOpenTicket, nextMilestone } from "@/domain/selectors/product";
import { shortDate } from "@/domain/status";
import { Avatar, EmptyState, HealthDot, ProductTile } from "@/ui/primitives";
import type { Product } from "@/domain/types";

export function ProductsView({ products }: { products: Product[] }) {
  return <div className="products-view"><ProductTable products={products} /></div>;
}

function ProductTable({ products }: { products: Product[] }) {
  const { db, href } = useMe();
  return (
    <table className="pd-table products-table">
      <thead>
        <tr><th>Product</th><th>Type</th><th>Health</th><th>PM</th><th>Next milestone</th></tr>
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

/** One big card per product, straight into its tickets: developers' "All products", and everyone's Personal products. */
export function ProductCards({ products, empty }: { products: Product[]; empty?: React.ReactNode }) {
  if (!products.length) {
    return empty ?? (
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
