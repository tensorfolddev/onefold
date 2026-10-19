"use client";

import Link from "next/link";
import { companyProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { donePct, nextMilestone } from "@/domain/selectors/dashboard";
import { shortDate } from "@/domain/status";
import { HealthDot, Progress, ProductTile } from "@/ui/primitives";

function Metric({ pct, color }: { pct: number | null; color?: string }) {
  if (pct === null) return <span className="dash-muted">—</span>;
  return (
    <span className="dash-metric">
      <Progress pct={pct} color={color} />
      <span className="meter-value">{pct}%</span>
    </span>
  );
}

/** Products widget body: the products the signed-in person can see. */
export function ProductsTable() {
  const { me, db, href } = useMe();
  const { tickets } = db;
  return (
    <table className="dash-table">
      <thead>
        <tr>
          <th scope="col">Product</th>
          <th scope="col">Type</th>
          <th scope="col">Health</th>
          <th scope="col">Done</th>
          <th scope="col">Next milestone</th>
        </tr>
      </thead>
      <tbody>
        {companyProducts(me, db.products).map((p) => {
          const m = nextMilestone(db, p.key);
          return (
            <tr key={p.key} className="dash-row">
              <th scope="row" className="dash-name">
                <Link href={href(`/products/${p.key}`)} className="dash-row-link">
                  <ProductTile product={p} />
                  {p.name}
                </Link>
              </th>
              <td data-label="Type"><span className="chip sm">{p.type === "client" ? "Client" : "Internal"}</span></td>
                <td data-label="Health"><HealthDot health={p.health} /></td>
                <td data-label="Done"><Metric pct={donePct(db, tickets, p.key)} color="var(--color-done-green)" /></td>
                <td data-label="Next milestone">
                  {m ? (
                    <span className="dash-milestone">
                      <span>{m.name} · {shortDate(m.due)}</span>
                      {m.lateDays > 0 && <span className="dash-late">{m.lateDays} days late</span>}
                    </span>
                  ) : <span className="dash-muted">—</span>}
                </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
