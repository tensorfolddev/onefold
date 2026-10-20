"use client";

import Link from "next/link";
import { CalendarClock, OctagonAlert } from "lucide-react";
import { visibleProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { isBlocked, lateMilestones } from "@/domain/selectors/dashboard";

/** "Needs a decision" widget body: slipping milestones, blocked work. */
export function DecisionsList() {
  const { me, db, href, productByKey } = useMe();
  const products = visibleProducts(me, db.products);
  const blocked = products
    .map((p) => ({ p, n: db.tickets.filter((t) => t.productKey === p.key && isBlocked(db, t)).length }))
    .filter((x) => x.n > 0);

  return (
    <ul className="decision-list">
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
