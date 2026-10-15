"use client";

import Link from "next/link";
import { CalendarClock, ClipboardCheck, Hourglass, OctagonAlert } from "lucide-react";
import { today } from "@/domain/clock";
import { longDate } from "@/domain/status";
import { visibleProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { isBlocked, isOpen, lateMilestones } from "@/domain/selectors/dashboard";
import { EmptyState } from "@/ui/primitives";
import { KpiTile, Widget } from "@/features/home/Widget";
import { ProductsTable } from "@/features/home/ProductsTable";

/** Manager landing page: their products plus everything waiting on them. */
export function ManagerHome() {
  const { me, db } = useMe();
  const products = visibleProducts(me, db.products);
  const keys = new Set(products.map((p) => p.key));
  const atRisk = products.filter((p) => p.health === "risk").length;
  const mine = db.tickets.filter((t) => keys.has(t.productKey) && t.type !== "epic");
  const open = mine.filter((t) => isOpen(db, t)).length;
  const blocked = mine.filter((t) => isBlocked(db, t)).length;

  return (
    <div className="page dashboard">
      <header className="page-header">
        <div>
          <h1 className="page-title">My products</h1>
          <p className="page-subtitle">{longDate(today())} · {me.role}</p>
        </div>
      </header>

      <div className="dash-grid">
        <KpiTile title="Products" value={String(products.length)} caption="you lead or work on" />
        <KpiTile title="At risk" value={String(atRisk)} caption="health marked at risk"
          tone={atRisk ? "var(--color-stuck-red)" : undefined} />
        <KpiTile title="Open tickets" value={String(open)} caption="across my products" />
        <KpiTile title="Blocked" value={String(blocked)} caption="tickets marked stuck" tone={blocked ? "var(--color-stuck-red)" : undefined} />

        <Widget title="My products" className="span-2">
          <ProductsTable />
        </Widget>
        <Widget title="Waiting on me">
          <WaitingOnMe />
        </Widget>
      </div>
    </div>
  );
}

function WaitingOnMe() {
  const { me, db, href, productByKey } = useMe();
  const products = visibleProducts(me, db.products);
  const requests = db.stageRequests.filter((r) => r.requestedBy === me.id);
  const late = lateMilestones(db, products.map((p) => p.key));
  const blocked = products
    .map((p) => ({ p, n: db.tickets.filter((t) => t.productKey === p.key && isBlocked(db, t)).length }))
    .filter((x) => x.n > 0);

  if (!requests.length && !late.length && !blocked.length) {
    return <EmptyState icon={<ClipboardCheck aria-hidden />} title="Nothing needs you right now" />;
  }
  return (
    <ul className="decision-list">
      {requests.map((r) => (
        <li key={r.id} className="decision-item">
          <Hourglass className="decision-icon" aria-hidden />
          <Link href={href(`/products/${r.productKey}`)} className="decision-main decision-link">
            Waiting for admin to approve {r.stage} for {productByKey(r.productKey)?.name}
          </Link>
        </li>
      ))}
      {late.map((m) => (
        <li key={m.id} className="decision-item">
          <CalendarClock className="decision-icon is-late" aria-hidden />
          <Link href={href(`/products/${m.productKey}/roadmap`)} className="decision-main decision-link">
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
