"use client";

// A chat's details, sliding in over it: the project (how it's going, where it is, who's on it) or a request's facts —
// and, for the client, a requirement in full with its history. (The team edits a requirement in its own panel.)
import { X } from "lucide-react";
import { clientText } from "@/domain/clientView";
import type { RoomModel, RoomThread } from "@/domain/selectors/room";
import { STAGES } from "@/domain/status";
import { Markdown } from "@/ui/Markdown";
import type { RoomActions } from "./roomActions";
import { dateLabel, dayOf, eventText, isAgain, KIND, nameOf, RoomAvatar, StatusPill } from "./roomUi";

const HEALTH = { good: ["On track", "#00a35f"], watch: ["Needs attention", "#e99729"], risk: ["At risk", "#e2445c"] } as const;
const ROLE = { sponsor: "Sponsor", owner: "Product owner", tester: "Tester" } as const;

function History({ room, t }: { room: RoomModel; t: RoomThread }) {
  const events = t.messages.filter((m) => m.kind === "event");
  if (!events.length) return null;
  return (
    <section className="room-details-sec">
      <h4>History</h4>
      <ol className="room-history">{events.map((m) => <li key={m.id}>{eventText(room, m.event!, m.authorId, isAgain(t, m))}<span>{dayOf(m.at)}</span></li>)}</ol>
    </section>
  );
}

export function RoomDetails({ room, t, actions, onClose }: { room: RoomModel; t: RoomThread; actions: RoomActions; onClose: () => void }) {
  const close = <button type="button" className="room-icon-btn room-details-close" onClick={onClose} aria-label="Close details"><X aria-hidden /></button>;
  if (t.kind === "chat") {
    const step = STAGES.indexOf(room.project.stage);
    const health = HEALTH[room.project.health];
    const team = Object.values(room.people).filter((p) => p.side === "team" && (room.side === "client" || t.messages.some((m) => m.authorId === p.id)));
    return (
      <aside className="room-details" aria-label="Project details">
        {close}
        <p className="room-details-kind">Project</p>
        <h3>{room.project.name}</h3>
        <span className="room-status" style={{ "--c": health[1] } as React.CSSProperties}>{health[0]}</span>
        <section className="room-details-sec">
          <h4>Where it is <span>step {step + 1} of {STAGES.length}</span></h4>
          <div className="room-stages" aria-hidden>{STAGES.map((s, i) => <i key={s} data-state={i < step ? "done" : i === step ? "now" : undefined} />)}</div>
        </section>
        {room.side === "team" && actions.people ? actions.people() : (
          <>
            <section className="room-details-sec">
              <h4>{room.project.client || "Your side"}</h4>
              {room.clients.map((c) => { const p = room.people[c.personId]; return p && <div key={c.personId} className="room-person"><RoomAvatar person={p} side={room.side} /><span className="room-person-text">{nameOf(room, p.id, `${p.name} (you)`)}<small>{ROLE[c.role]}</small></span></div>; })}
            </section>
            <section className="room-details-sec">
              <h4>{room.companyName}</h4>
              {team.map((p) => <div key={p.id} className="room-person"><RoomAvatar person={p} side={room.side} /><span className="room-person-text">{p.name}<small>{p.title}</small></span></div>)}
            </section>
          </>
        )}
      </aside>
    );
  }
  const r = t.requirement, a = t.ask;
  return (
    <aside className="room-details" aria-label={`${t.key} details`}>
      {close}
      <p className="room-details-kind" style={{ color: KIND[r ? "req" : a!.kind].color }}>{r ? "Requirement" : `${KIND[a!.kind].label} request`} {t.key}</p>
      <h3>{t.title}</h3>
      <StatusPill room={room} t={t} />
      {r && (
        <>
          {r.description.trim() && <section className="room-details-sec"><Markdown text={clientText(r.description)} className="room-md" /></section>}
          {r.criteria.length > 0 && (
            <section className="room-details-sec">
              <h4>Done when <span>{r.criteria.filter((c) => c.done).length}/{r.criteria.length}</span></h4>
              <ul className="room-checks">{r.criteria.map((c) => <li key={c.id} data-done={c.done || undefined}><span className="room-check">{c.done && "✓"}</span>{c.text}</li>)}</ul>
            </section>
          )}
        </>
      )}
      {a && (
        <section className="room-details-sec">
          <dl className="room-fields">
            <dt>For</dt><dd>{a.assigneeId ? nameOf(room, a.assigneeId, "you") : `Anyone at ${room.project.client || "the client"}`}</dd>
            {a.due && <><dt>By</dt><dd>{dateLabel(a.due)}</dd></>}
            {a.invite && <><dt>Invite</dt><dd><code>{a.invite}</code></dd></>}
            <dt>Asked by</dt><dd>{nameOf(room, a.createdBy)}</dd>
          </dl>
          {a.details && <p className="room-card-text">{a.details}</p>}
        </section>
      )}
      <History room={room} t={t} />
    </aside>
  );
}
