"use client";

// A project's overview: the numbers that matter up top (progress, open, overdue, due soon), then the status mix,
// what's coming up, who carries what, each epic's progress, blockers, the latest activity, decisions and docs.
import Link from "next/link";
import { Activity as ActivityIcon, AlertTriangle, CalendarClock, CheckCircle2, CircleDot, FileText, Flag, Scale, Users } from "lucide-react";
import { useMe } from "@/data/StoreProvider";
import { today } from "@/domain/clock";
import { projectOverview } from "@/domain/selectors/overview";
import { nextMilestone } from "@/domain/selectors/product";
import { relativeTime, shortDate, toneVar } from "@/domain/status";
import type { Activity, Ticket } from "@/domain/types";
import { docPath } from "@/features/docs/tree";
import { useAppState } from "@/features/shell/state";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { Avatar } from "@/ui/primitives";
import { StatusPill } from "./DecisionStatus";
import { BlockerList, CoverageList } from "./LiveWidgets";
import { MilestoneSummary } from "./Widgets";

const RING = 2 * Math.PI * 26;
const SHOWN_UPCOMING = 8;
const SHOWN_AVATARS = 2;

function Card({ title, icon, action, span = 4, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; span?: 4 | 6 | 8 | 12; children: React.ReactNode }) {
  const id = `ov-${title.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section className={`ov-card span-${span}`} aria-labelledby={id}>
      <header className="ov-card-head"><span className="ov-card-icon" aria-hidden>{icon}</span><h3 id={id}>{title}</h3>{action}</header>
      <div className="ov-card-body">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint, tone, children }: { label: string; value: string; hint: string; tone?: "bad" | "good"; children?: React.ReactNode }) {
  return (
    <div className={`ov-kpi${tone ? ` is-${tone}` : ""}`}>
      {children}
      <div><p className="ov-kpi-label">{label}</p><p className="ov-kpi-value">{value}</p><p className="ov-kpi-hint">{hint}</p></div>
    </div>
  );
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
function DueChip({ due, day }: { due: string; day: string }) {
  const n = daysBetween(day, due);
  const text = n < 0 ? `${-n}d late` : n === 0 ? "Today" : n === 1 ? "Tomorrow" : n < 7 ? `In ${n}d` : shortDate(due);
  return <span className={`ov-due${n < 0 ? " is-late" : n <= 1 ? " is-soon" : ""}`}>{text}</span>;
}

function TicketRow({ t, day }: { t: Ticket; day: string }) {
  const { openTicket } = useAppState();
  const ids = t.assigneeIds ?? [];
  return (
    <li>
      <button type="button" className="ov-row" onClick={() => openTicket(t.key)}>
        <TypeIcon type={t.type} /><span className="key">{t.key}</span><span className="ov-row-title">{t.title}</span>
        <span className="ov-avatars">{ids.slice(0, SHOWN_AVATARS).map((id) => <Avatar key={id} personId={id} size="sm" />)}{ids.length > SHOWN_AVATARS && <span className="ov-more">+{ids.length - SHOWN_AVATARS}</span>}</span>
        {t.due && <DueChip due={t.due} day={day} />}
      </button>
    </li>
  );
}

const did = (a: Activity) => {
  switch (a.field) {
    case "Created": return "created";
    case "Status": return `moved to ${a.to}`;
    case "Assignee": return a.to ? `assigned ${a.to}` : "unassigned";
    case "Priority": return `set priority ${a.to}`;
    case "Due date": return a.to && a.to !== "—" ? `set due ${a.to}` : "cleared the due date";
    case "Archive": return a.to ? "archived" : "restored";
    default: return `changed the ${a.field.toLowerCase()}`;
  }
};

export function ProjectOverview({ productKey }: { productKey: string }) {
  const { db, href, personById } = useMe();
  const { openTicket } = useAppState();
  const day = today();
  const o = projectOverview(db, productKey, day);
  const milestone = nextMilestone(db, productKey);
  const decisions = db.decisions.filter((d) => d.productKey === productKey).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 4);
  const docs = db.docs.filter((d) => d.productKey === productKey && !d.archivedAt)
    .sort((a, b) => (b.updatedAt ?? b.updated).localeCompare(a.updatedAt ?? a.updated)).slice(0, 4);
  const hasRequirements = db.requirements.some((r) => r.productKey === productKey);
  const ticketTitle = (key: string) => db.tickets.find((t) => t.key === key)?.title ?? "";
  const busiest = Math.max(1, ...o.team.map((m) => m.open));
  const upcoming = [...o.overdue, ...o.dueSoon].slice(0, SHOWN_UPCOMING);
  const seeAll = (path: string, label = "See all") => <Link href={href(`/products/${productKey}/${path}`)} className="ov-card-link">{label}</Link>;

  return (
    <div className="ov">
      <section className="ov-kpis" aria-label="At a glance">
        <Kpi label="Progress" value={`${o.pct}%`} hint={o.total ? `${o.done} of ${o.total} done` : "No tickets yet"}>
          <svg className="ov-ring" viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r="26" className="ov-ring-track" />
            <circle cx="32" cy="32" r="26" className="ov-ring-fill" strokeDasharray={`${(o.pct / 100) * RING} ${RING}`} />
          </svg>
        </Kpi>
        <Kpi label="Open" value={String(o.open)} hint={`${o.inProgress} in progress`}><span className="ov-kpi-icon" aria-hidden><CircleDot /></span></Kpi>
        <Kpi label="Overdue" value={String(o.overdue.length)} hint={o.overdue.length ? "Past due" : "All on time"} tone={o.overdue.length ? "bad" : "good"}>
          <span className="ov-kpi-icon" aria-hidden>{o.overdue.length ? <AlertTriangle /> : <CheckCircle2 />}</span>
        </Kpi>
        <Kpi label="Due soon" value={String(o.dueSoon.length)} hint="Next 14 days"><span className="ov-kpi-icon" aria-hidden><CalendarClock /></span></Kpi>
      </section>

      <div className="ov-grid">
        <Card title="Status" icon={<CircleDot />} span={8} action={seeAll("tickets", "Open board")}>
          {o.byStatus.length ? (
            <>
              <div className="ov-stack" role="img" aria-label={o.byStatus.map((s) => `${s.count} ${s.status.name}`).join(", ")}>
                {o.byStatus.map((s) => <span key={s.status.id} style={{ flexGrow: s.count, background: toneVar(s.status.tone) }} />)}
              </div>
              <ul className="ov-legend">
                {o.byStatus.map((s) => <li key={s.status.id}><span className="ov-dot" style={{ background: toneVar(s.status.tone) }} />{s.status.name}<strong>{s.count}</strong></li>)}
              </ul>
            </>
          ) : <p className="ov-empty">No tickets yet — add them on the Tickets tab.</p>}
        </Card>

        <Card title={milestone ? `Milestone · ${milestone.name}` : "Milestone"} icon={<Flag />} span={4} action={seeAll("roadmap", "Roadmap")}>
          {milestone ? <MilestoneSummary milestone={milestone} /> : <p className="ov-empty">No milestones yet — plan them on the Roadmap.</p>}
        </Card>

        <Card title="Coming up" icon={<CalendarClock />} span={8} action={seeAll("tickets")}>
          {upcoming.length ? <ul className="ov-list">{upcoming.map((t) => <TicketRow key={t.key} t={t} day={day} />)}</ul>
            : <p className="ov-empty">Nothing due in the next two weeks.</p>}
        </Card>

        <Card title="Team" icon={<Users />} span={4} action={seeAll("members", "Members")}>
          {o.team.length ? (
            <ul className="ov-team">
              {o.team.map((m) => (
                <li key={m.person.id}>
                  <Avatar personId={m.person.id} size="sm" />
                  <span className="ov-team-name">{m.person.name}</span>
                  <span className="ov-team-bar" aria-hidden><span style={{ width: `${(m.open / busiest) * 100}%` }} /></span>
                  <span className="ov-team-count">{m.open} open · {m.done} done</span>
                </li>
              ))}
            </ul>
          ) : <p className="ov-empty">No one on this project yet.</p>}
        </Card>

        <Card title="Epics" icon={<Flag />} span={6} action={seeAll("tickets")}>
          {o.epics.length ? (
            <ul className="ov-epics">
              {o.epics.map(({ epic, done, total }) => {
                const pct = total ? Math.round((done / total) * 100) : 0;
                return (
                  <li key={epic.key}>
                    <button type="button" className="ov-epic" onClick={() => openTicket(epic.key)} style={{ "--epic": epic.color ?? "var(--primary-color)" } as React.CSSProperties}>
                      <span className="ov-epic-title">{epic.title}</span>
                      <span className="ov-epic-bar" aria-hidden><span style={{ width: `${pct}%` }} /></span>
                      <span className="ov-epic-count">{done}/{total}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="ov-empty">No epics yet — group related tickets under one.</p>}
        </Card>

        <Card title="Blockers" icon={<AlertTriangle />} span={6}><BlockerList productKey={productKey} /></Card>

        <Card title="Recent activity" icon={<ActivityIcon />} span={8}>
          {o.activity.length ? (
            <ul className="ov-feed">
              {o.activity.map((a) => (
                <li key={a.id}>
                  <Avatar personId={a.actorId} size="sm" />
                  <p><strong>{personById(a.actorId)?.name.split(" ")[0] ?? "Someone"}</strong> {did(a)}{" "}
                    <button type="button" className="ov-feed-ticket" onClick={() => openTicket(a.ticketKey)}>{a.ticketKey} {ticketTitle(a.ticketKey)}</button>
                  </p>
                  <time dateTime={a.at}>{relativeTime(a.at)} ago</time>
                </li>
              ))}
            </ul>
          ) : <p className="ov-empty">Nothing has happened here yet.</p>}
        </Card>

        <div className="ov-side span-4">
          <Card title="Latest decisions" icon={<Scale />} span={12} action={seeAll("decisions")}>
            {decisions.length ? (
              <ul className="ov-mini">
                {decisions.map((d) => (
                  <li key={d.id}><Link href={href(`/products/${productKey}/decisions?d=${d.id}`)}><span className="ov-mini-title">{d.title}</span><StatusPill decision={d} /></Link></li>
                ))}
              </ul>
            ) : <p className="ov-empty">No decisions recorded yet.</p>}
          </Card>
          <Card title="Recent docs" icon={<FileText />} span={12} action={seeAll("docs")}>
            {docs.length ? (
              <ul className="ov-mini">
                {docs.map((d) => (
                  <li key={d.id}><Link href={href(docPath(d))}><span aria-hidden>{d.icon ?? <FileText />}</span><span className="ov-mini-title">{d.title}</span><span className="muted">{relativeTime(d.updatedAt ?? `${d.updated}T12:00:00Z`)}</span></Link></li>
                ))}
              </ul>
            ) : <p className="ov-empty">No docs yet.</p>}
          </Card>
        </div>

        {hasRequirements && <Card title="Requirements coverage" icon={<CheckCircle2 />} span={12}><CoverageList productKey={productKey} /></Card>}
      </div>
    </div>
  );
}
