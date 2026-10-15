"use client";

import Link from "next/link";
import { CalendarClock, CircleHelp, OctagonAlert } from "lucide-react";
import { visibleProducts } from "@/domain/permissions";
import { approveStage } from "@/domain/commands";
import { useMe } from "@/data/StoreProvider";
import { isBlocked, lateMilestones } from "@/domain/selectors/dashboard";

/** "Needs a decision" widget body: pending approvals, slipping milestones, blocked work. */
export function DecisionsList() {
  const { me, db, href, can, act, productByKey } = useMe();
  const products = visibleProducts(me, db.products);
  const blocked = products
    .map((p) => ({ p, n: db.tickets.filter((t) => t.productKey === p.key && isBlocked(db, t)).length }))
    .filter((x) => x.n > 0);

  return (
    <ul className="decision-list">
      {products.filter((p) => p.waitingApproval).map((p) => (
        <li key={`ap-${p.key}`} className="decision-item">
          <CircleHelp className="decision-icon" aria-hidden />
          <div className="decision-main">
            <p><strong>{p.name}:</strong> {p.waitingApproval}</p>
            <div className="decision-actions">
              {can("product.approveStage", { product: p }) && (
                <button
                  type="button" className="btn btn-primary"
                  onClick={() => act((d, m) => approveStage(d, m, p.key), { success: `${p.name} moved to the next stage`, undoable: true })}
                >
                  Approve
                </button>
              )}
              <Link href={href(`/products/${p.key}`)} className="btn btn-secondary">Review</Link>
            </div>
          </div>
        </li>
      ))}
      {lateMilestones(db, products.map((p) => p.key)).map((m) => (
        <li key={m.id} className="decision-item">
          <CalendarClock className="decision-icon is-late" aria-hidden />
          <Link href={href(`/products/${m.productKey}`)} className="decision-main decision-link">
            <strong>{productByKey(m.productKey)?.name}:</strong> {m.name} milestone slipping {m.lateDays} days
          </Link>
        </li>
      ))}
      {blocked.map(({ p, n }) => (
        <li key={`bl-${p.key}`} className="decision-item">
          <OctagonAlert className="decision-icon is-late" aria-hidden />
          <Link href={href(`/products/${p.key}/tickets`)} className="decision-main decision-link">
            <strong>{p.name}:</strong> {n} blocked {n === 1 ? "ticket" : "tickets"}
          </Link>
        </li>
      ))}
    </ul>
  );
}
