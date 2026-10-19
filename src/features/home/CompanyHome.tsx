"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { companyProducts } from "@/domain/permissions";
import { useMe } from "@/data/StoreProvider";
import { today } from "@/domain/clock";
import { isBlocked, isOpen, lateMilestones } from "@/domain/selectors/dashboard";
import { longDate } from "@/domain/status";
import { KpiTile, Widget } from "@/features/home/Widget";
import { InviteDialog } from "@/features/people/Invites";
import { ProductsAndDecisions } from "@/features/home/ProductsAndDecisions";
import { TeamLoad } from "@/features/home/TeamLoad";
import { DonutChart } from "@/features/home/DonutChart";

export function CompanyHome() {
  const { me, db, panel } = useMe();
  const products = companyProducts(me, db.products);
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

      {panel === "admin" && <GetStarted />}

      {/* A new company has nothing to chart yet; the checklist above is the whole page until its first product. */}
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

/** A new company's first steps; disappears once they're all done. */
function GetStarted() {
  const { db, me, href } = useMe();
  const [inviting, setInviting] = useState(false);
  const live = companyProducts(me, db.products); // archived ones don't count
  const first = live[0];
  const steps = [
    { title: "Create your company", text: `${db.org.name} is set up, with you as its admin.`, done: true },
    {
      title: "Invite your team", text: "Developers, managers and other admins join by link.",
      done: db.people.length > 1 || db.invites.length > 0,
      action: <button type="button" className="btn btn-secondary" onClick={() => setInviting(true)}>Invite people</button>,
    },
    {
      title: "Create your first product", text: "A product gets its own board, docs and roadmap.",
      done: live.length > 0,
      action: <Link href={href("/products?new=1")} className="btn btn-secondary">New product</Link>,
    },
    {
      title: "Add your first ticket", text: "Every ticket follows the same clear template.",
      done: db.tickets.some((t) => live.some((p) => p.key === t.productKey)),
      action: first && <Link href={href(`/products/${first.key}/tickets`)} className="btn btn-secondary">Open {first.name}</Link>,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <section className="get-started card" aria-labelledby="get-started-title">
      <header className="get-started-head">
        <div>
          <h2 id="get-started-title" className="get-started-title">Get {db.org.name} going</h2>
          <p className="muted">{done} of {steps.length} done</p>
        </div>
        <span className="get-started-bar" aria-hidden><span style={{ transform: `scaleX(${done / steps.length})` }} /></span>
      </header>
      <ol className="get-started-steps">
        {steps.map((s, i) => (
          <li key={s.title} className="get-started-step" data-state={s.done ? "done" : i === next ? "next" : "todo"}>
            <span className="get-started-dot" aria-hidden>{s.done ? <Check /> : i + 1}</span>
            <span className="get-started-text">
              <strong>{s.title}{s.done && <span className="visually-hidden"> (done)</span>}</strong>
              <span>{s.text}</span>
            </span>
            {!s.done && i === next && s.action}
            {!s.done && i !== next && <ArrowRight aria-hidden className="get-started-later" />}
          </li>
        ))}
      </ol>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
    </section>
  );
}
