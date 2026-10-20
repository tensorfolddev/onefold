"use client";

import Link from "next/link";
import { LayoutGrid } from "lucide-react";
import { visibleProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { today } from "@/domain/clock";
import { isBlocked, isOpen, lateMilestones } from "@/domain/selectors/dashboard";
import { longDate } from "@/domain/status";
import { KpiTile, Widget } from "@/features/home/Widget";
import { ProductsAndDecisions } from "@/features/home/ProductsAndDecisions";
import { TeamLoad } from "@/features/home/TeamLoad";
import { DonutChart } from "@/features/home/DonutChart";
import { EmptyState } from "@/ui/primitives";

export function CompanyHome() {
  const { me, db, panel, href } = useMe();
  const products = visibleProducts(me, db.products);
  const keys = products.map((p) => p.key);
  const clients = products.filter((p) => p.type === "client").length;
  const atRisk = products.filter((p) => p.health === "risk").length;
  const mine = db.tickets.filter((t) => keys.includes(t.productKey) && t.type !== "epic");
  const open = mine.filter((t) => isOpen(db, t)).length;
  const blocked = mine.filter((t) => isBlocked(db, t)).length;
  const waiting = products.filter((p) => p.waitingApproval).length + lateMilestones(db, keys).length;

  return (
    <div className="page dashboard">
      <header className="page-header">
        <div>
          <h1 className="page-title">{panel === "admin" ? "Company home" : "My products"}</h1>
          <p className="page-subtitle">Welcome back, {me.name.split(" ")[0]} · {longDate(today())} · {db.org.name}</p>
        </div>
      </header>

      {/* A new company has nothing to chart yet. */}
      {products.length === 0 && (
        <EmptyState icon={<LayoutGrid aria-hidden />} title="No products yet">
          {panel === "admin"
            ? <><p>A product gets its own board, docs and roadmap.</p><Link href={href("/products?new=1")} className="btn btn-primary">New product</Link></>
            : <p>When you&apos;re added to a product, it shows up here.</p>}
        </EmptyState>
      )}
      {products.length > 0 && <div className="dash-grid">
        <KpiTile title="Active products" value={String(products.length)} caption={`${clients} client · ${products.length - clients} internal`} />
        <KpiTile title="Products at risk" value={String(atRisk)} caption="health marked at risk"
          tone={atRisk ? "var(--color-stuck-red)" : undefined} />
        <KpiTile title="Blocked tickets" value={String(blocked)} caption={`of ${open} open`} tone={blocked ? "var(--color-stuck-red)" : undefined} />
        <KpiTile title="Waiting on a decision" value={String(waiting)} caption="approvals and slipping milestones" />

        <ProductsAndDecisions />

        <Widget title="Team load this sprint" className="span-2">
          <TeamLoad />
        </Widget>
        <Widget title="Tickets by status">
          <DonutChart />
        </Widget>
      </div>}
    </div>
  );
}
