"use client";

// The Client tab, explained end to end — what each section is for, what every phase of a requirement and a request
// means (in the company's own words and colours), who does what, and the chat's tools. And the invite dialog it opens
// from: who's on the project, in the middle of the screen.
import { useEffect, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import type { RoomModel } from "@/domain/selectors/room";
import { askPhase, ASK_STATES, prioritiesOf, reqPhase, REQUIREMENT_STATUSES } from "@/domain/selectors/clientLook";
import type { AskState, RequirementStatus } from "@/domain/types";

const REQ_MEANS: Record<RequirementStatus, string> = {
  draft: "The team is writing it. The client doesn't see it yet.",
  proposed: "The client suggested it. The team takes it on (it becomes a draft to write up) or says not now.",
  to_confirm: "Sent to the client. They confirm it, or ask for changes — it's their move.",
  changes_requested: "The client asked for changes. The team updates it and sends the new version to confirm.",
  confirmed: "The client agreed to this version. The team builds it; its tickets' progress shows on the card.",
  dropped: "Not being done, with the reason. The client sees it as dropped.",
};
const ASK_MEANS: Record<AskState, string> = {
  open: "The team asked for access, a file or an answer. The client answers in the request's chat.",
  answered: "The client answered or sent the file. The team checks it, then closes it.",
  done: "Closed: the team has what it needed.",
  cancelled: "Called off: not needed any more.",
};

function Phases({ room, kind }: { room: RoomModel; kind: "req" | "ask" }) {
  const rows = kind === "req"
    ? REQUIREMENT_STATUSES.map((s) => ({ id: s, team: reqPhase(room.look, s, "team"), client: reqPhase(room.look, s, "client").label, means: REQ_MEANS[s] }))
    : ASK_STATES.map((s) => ({ id: s, team: askPhase(room.look, s, "team"), client: askPhase(room.look, s, "client").label, means: ASK_MEANS[s] }));
  return (
    <dl className="room-guide-phases">
      {rows.map((r) => (
        <div key={r.id}>
          <dt><span className="room-status" style={{ "--c": r.team.color } as React.CSSProperties}>{r.team.label}</span>{r.client !== r.team.label && <small>the client sees “{r.client}”</small>}</dt>
          <dd>{r.means}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RoomGuide({ room, onClose }: { room: RoomModel; onClose: () => void }) {
  const ref = useModal();
  const client = room.project.client || "the client";
  return (
    <dialog ref={ref} className="room-modal room-guide" aria-labelledby="room-guide-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <header className="room-modal-head">
        <h2 id="room-guide-title"><BookOpen aria-hidden /> How the Client tab works</h2>
        <button type="button" className="room-icon-btn" onClick={onClose} aria-label="Close" autoFocus><X aria-hidden /></button>
      </header>
      <div className="room-modal-body">
        <p className="room-guide-lead">One place for everything between the team and {client}: <b>the team decides scope, asks, and reports; the client confirms, answers, and follows progress.</b></p>
        <section>
          <h3>Three sections</h3>
          <ul className="room-guide-list">
            <li><b>Chat</b> — the project&apos;s conversation with {client}. The lock writes an internal note only the team sees.</li>
            <li><b>Requirements</b> — what gets built. Each one is agreed with the client before it&apos;s built, and has its own chat.</li>
            <li><b>Requests</b> — what the team needs from the client: access, a file, an answer. Each has its own chat too.</li>
          </ul>
        </section>
        <section>
          <h3>A requirement&apos;s phases</h3>
          <Phases room={room} kind="req" />
          <p className="room-muted">Priorities: {prioritiesOf(room.look).map((p) => p.name).join(", ")}. Click a priority in the table to change it.</p>
        </section>
        <section>
          <h3>A request&apos;s phases</h3>
          <Phases room={room} kind="ask" />
        </section>
        <section>
          <h3>Every week</h3>
          <p>The <b>Weekly update</b> (in the chat&apos;s + menu) posts a card for everyone: where the project is, what happened this week, what&apos;s next, and what&apos;s needed from {client}.</p>
        </section>
        <section>
          <h3>Who does what</h3>
          <ul className="room-guide-list">
            <li><b>Everyone on the project</b> reads every chat, writes notes, writes requirements and requests, and sends them to the client.</li>
            <li><b>Managers and admins</b> add the client&apos;s people, set their roles and copy their links.</li>
            <li><b>The project&apos;s Settings → Client tab</b>: rename its phases and priorities and change their colours. <b>Admins</b> make new client links in Settings → Clients.</li>
            <li><b>The client</b>: a Sponsor or Product owner confirms requirements (and can suggest new ones); a Tester follows along and answers what&apos;s asked.</li>
          </ul>
        </section>
        <section>
          <h3>In the chat</h3>
          <ul className="room-guide-list">
            <li><b>@name</b>, <b>@team</b> or <b>@everyone</b> tells them in their inbox; <b>@@name</b> is urgent and makes a sound.</li>
            <li>Hover a message to reply, star it (only you see your stars), pin it for everyone, or delete it — for you, or for everyone if you wrote it.</li>
            <li>Two ticks turn blue once the other side has read it.</li>
          </ul>
        </section>
      </div>
    </dialog>
  );
}

/** "Invite": who's on the project, in a dialog in the middle of the screen — and the guide, a click away. */
export function RoomInvite({ room, people, onClose }: { room: RoomModel; people: React.ReactNode; onClose: () => void }) {
  const ref = useModal();
  const [guide, setGuide] = useState(false);
  return (
    <dialog ref={ref} className="room-modal room-invite" aria-labelledby="room-invite-title" onCancel={(e) => { e.preventDefault(); if (!guide) onClose(); }}>
      <header className="room-modal-head">
        <h2 id="room-invite-title">People on {room.project.name}</h2>
        <button type="button" className="btn btn-tertiary btn-sm" onClick={() => setGuide(true)}><BookOpen aria-hidden /> Guide</button>
        <button type="button" className="room-icon-btn" onClick={onClose} aria-label="Close"><X aria-hidden /></button>
      </header>
      <div className="room-modal-body">{people}</div>
      {guide && <RoomGuide room={room} onClose={() => setGuide(false)} />}
    </dialog>
  );
}

function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d?.open) d?.showModal();
    return () => d?.close();
  }, []);
  return ref;
}
