"use client";

import { notFound } from "next/navigation";
import { TriangleAlert, Users } from "lucide-react";
import { useMe } from "@/data/StoreProvider";
import { loadColor, teamLoad } from "@/domain/selectors/dashboard";
import { isOnProduct, companyProducts } from "@/domain/permissions";
import { Avatar, EmptyState } from "@/ui/primitives";
import { TeamPeople } from "@/features/home/TeamPeople";
import Link from "next/link";

export default function TeamsPage() {
  const { db, me, panel, can, personById, href } = useMe();
  if (panel === "developer") notFound();
  const isAdmin = can("teams.manage");
  const led = db.teams.filter((t) => t.leadId === me.id);
  const mine = companyProducts(me, db.products);
  // Managers see the teams they lead; a manager who leads none sees the teams of people on their products.
  const teams = isAdmin ? db.teams : led.length ? led : db.teams.filter((t) =>
    db.people.some((p) => p.team === t.id && mine.some((pr) => isOnProduct(p.id, pr))));
  const leadership = db.people.filter((p) => p.team === "leadership" && p.role !== "Client" && p.active);
  return (
    <div className="page teams-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Teams</h1>
          <p className="page-subtitle">Sprint load and open work per person</p>
        </div>
      </header>

      {isAdmin && (
        <p className="admin-settings-link">
          Add, rename or remove teams and job titles in <Link href={href("/settings")}>Settings</Link>.
        </p>
      )}

      {teams.length === 0 && (
        <EmptyState icon={<Users aria-hidden />} title="No teams yet">
          {isAdmin ? <>Create teams in <Link href={href("/settings")}>Settings</Link> to see each team&apos;s load here.</> : "Teams you lead or work with show up here."}
        </EmptyState>
      )}

      {teams.map((t) => {
        const { pct } = teamLoad(db, t.id);
        const lead = personById(t.leadId);
        return (
          <section key={t.id} className="team-section" aria-labelledby={`team-${t.id}`}>
            <header className="team-header">
              <h2 id={`team-${t.id}`} className="team-title">{t.name}</h2>
              <span className="team-lead">
                {lead ? <><Avatar personId={t.leadId} size="sm" />Lead: {lead.name}</> : <span className="dash-muted">No lead yet</span>}
              </span>
              <span className={`team-load-pct${pct > 100 ? " is-over" : ""}`}>
                {pct > 100
                  ? <TriangleAlert aria-label="Over capacity" />
                  : <span className="health-dot" style={{ "--dot": loadColor(pct) } as React.CSSProperties} />}
                {pct}% load
              </span>
            </header>
            <TeamPeople team={t.id} />
          </section>
        );
      })}

      {leadership.length > 0 && <section className="team-section" aria-labelledby="team-leadership">
        <header className="team-header">
          <h2 id="team-leadership" className="team-title">Leadership</h2>
        </header>
        <ul className="leadership-list">
          {leadership.map((p) => (
            <li key={p.id} className="card leadership-card">
              <Avatar personId={p.id} size="lg" />
              <span><strong className="leadership-name">{p.name}</strong><span className="dash-muted">{p.role}</span></span>
            </li>
          ))}
        </ul>
      </section>}
    </div>
  );
}
