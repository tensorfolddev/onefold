"use client";

// The cards in the chats — one template per kind, built like 1Fold's ticket cards: a requirement (what, done when,
// how far the build is, who confirmed which version), a request (access, a file, a question), a weekly update. Their
// buttons are the next step for whoever is looking.
import { useRef } from "react";
import { Bell, CalendarDays, Check, CircleCheck, Download, FileText, Flag, Lock, RotateCcw, Upload } from "lucide-react";
import { clientText } from "@/domain/clientView";
import { priorityLook } from "@/domain/selectors/clientLook";
import { STAGES } from "@/domain/status";
import type { RoomMessage, RoomModel, RoomThread } from "@/domain/selectors/room";
import { today } from "@/domain/clock"; // the local day, like everywhere else — not UTC's
import type { Stage, ThreadFile, WeeklyUpdate } from "@/domain/types";
import { Markdown, withMentions } from "@/ui/Markdown";
import type { RoomActions } from "./roomActions";
import { dateLabel, dayOf, fileSize, KIND, nameOf, RoomAvatar, StatusPill, TypeTag } from "./roomUi";

export const STAGE_NAME: Record<Stage, string> = { INTAKE: "Getting started", DEFINE: "Defining", PLAN: "Planning", BUILD: "Building", RELEASE: "Releasing" };

function Bar({ done, doing, total }: { done: number; doing: number; total: number }) {
  return (
    <span className="room-bar" role="img" aria-label={`${done} of ${total} done`}>
      <i style={{ width: `${(done / total) * 100}%` }} />
      <i className="is-doing" style={{ width: `${(doing / total) * 100}%` }} />
    </span>
  );
}

/** The next step on a requirement, for whoever is looking. */
function requirementButtons(room: RoomModel, t: RoomThread, actions: RoomActions, onChanges: () => void) {
  const r = t.requirement!;
  if (room.side === "client") {
    if (r.status !== "to_confirm" || room.myRole === "tester" || !actions.confirm) return null;
    return (
      <>
        <button type="button" className="btn btn-primary" onClick={() => void actions.confirm!(r.id)}><Check aria-hidden /> Confirm</button>
        <button type="button" className="btn btn-secondary" onClick={onChanges}>Ask for changes</button>
      </>
    );
  }
  if (r.status === "proposed" && actions.takeOn) {
    return (
      <>
        <button type="button" className="btn btn-primary" onClick={() => actions.takeOn!(r.id)}>Take it on</button>
        <button type="button" className="btn btn-secondary" onClick={() => actions.decline?.(r.id)}>Not now</button>
      </>
    );
  }
  if ((r.status === "draft" || r.status === "changes_requested") && room.clientFacing && actions.sendToClient) {
    return <button type="button" className="btn btn-primary" onClick={() => actions.sendToClient!(r.id)}>{r.confirmed || r.status === "changes_requested" ? "Send the new version" : "Send to client"}</button>;
  }
  return null;
}

export function RequirementCard({ room, t, actions, onChanges }: { room: RoomModel; t: RoomThread; actions: RoomActions; onChanges: () => void }) {
  const r = t.requirement!;
  const p = priorityLook(room.look, r.priority);
  const ticked = r.criteria.filter((c) => c.done).length;
  const buttons = requirementButtons(room, t, actions, onChanges);
  return (
    <article className="room-card" style={{ "--c": KIND.req.color } as React.CSSProperties} aria-label={`Requirement ${r.code}`}>
      <header className="room-card-top">
        <TypeTag kind="req" /><span className="room-card-key">{r.code}</span>
        {t.internal && <span className="room-chip"><Lock aria-hidden /> Only the team</span>}
        <span className="spacer" />
        {p && <span className="card-priority" style={{ "--prio": p.color } as React.CSSProperties}><Flag aria-hidden />{p.short}</span>}
      </header>
      <div className="room-card-body">
        <h3 className="room-card-title">{r.title}</h3>
        {r.description.trim() && <Markdown text={clientText(r.description)} className="room-md" />}
        {r.beingUpdated && <p className="room-callout">We&apos;re updating this. You&apos;ll be asked to confirm the new version — until then, this is what you agreed.</p>}
        {r.criteria.length > 0 && (
          <section className="room-card-sec">
            <div className="room-card-lab">Done when <span>{ticked}/{r.criteria.length}</span></div>
            <ul className="room-checks">
              {r.criteria.map((c) => <li key={c.id} data-done={c.done || undefined}><span className="room-check" aria-label={c.done ? "Done" : "Not done yet"}>{c.done && <Check aria-hidden />}</span>{c.text}</li>)}
            </ul>
          </section>
        )}
        {r.status === "confirmed" && r.progress.total > 0 && (
          <section className="room-card-sec">
            <div className="room-card-lab">Being built <span>{r.progress.done} of {r.progress.total} parts done</span></div>
            <div className="room-progress"><Bar {...r.progress} /><b>{Math.round((r.progress.done / r.progress.total) * 100)}%</b></div>
          </section>
        )}
        {r.confirmed && <p className="room-stamp"><CircleCheck aria-hidden /> Confirmed by {nameOf(room, r.confirmed.by, "you")} · {dayOf(r.confirmed.at)}</p>}
        {r.droppedReason && r.status === "dropped" && <p className="room-callout">Dropped: {r.droppedReason}</p>}
      </div>
      <footer className="room-card-foot">
        <StatusPill room={room} t={t} />
        <span className="spacer" />
        {room.side === "team" && !!r.tickets?.length && <span className="room-muted">{r.tickets.length} {r.tickets.length === 1 ? "ticket" : "tickets"}</span>}
        {r.proposedBy && <span className="room-muted">Suggested by {nameOf(room, r.proposedBy, "you")}</span>}
      </footer>
      {buttons && <div className="room-card-actions">{buttons}</div>}
    </article>
  );
}

/** A version sent before the newest: what the client was asked to confirm then. The chat keeps every one. */
export function SentVersionCard({ t, m }: { t: RoomThread; m: RoomMessage }) {
  const v = m.data!.sent!;
  return (
    <article className="room-card is-earlier" style={{ "--c": KIND.req.color } as React.CSSProperties} aria-label={`${t.key} version ${m.rev ?? 1}`}>
      <header className="room-card-top">
        <TypeTag kind="req" /><span className="room-card-key">{t.key}</span>
        <span className="room-chip">Version {m.rev ?? 1}</span>
        <span className="spacer" />
        <span className="room-muted">Earlier version</span>
      </header>
      <div className="room-card-body">
        <h3 className="room-card-title">{v.title}</h3>
        {v.description.trim() && <Markdown text={clientText(v.description)} className="room-md" />}
        {v.criteria.length > 0 && (
          <section className="room-card-sec">
            <div className="room-card-lab">Done when</div>
            <ul className="room-checks">{v.criteria.map((c, i) => <li key={i}><span className="room-check" aria-hidden />{c}</li>)}</ul>
          </section>
        )}
      </div>
    </article>
  );
}

export function AskCard({ room, t, actions, onAnswer }: { room: RoomModel; t: RoomThread; actions: RoomActions; onAnswer: () => void }) {
  const a = t.ask!;
  const fileInput = useRef<HTMLInputElement>(null);
  const forWhom = a.assigneeId ? room.people[a.assigneeId] : undefined;
  const overdue = !!a.due && a.state === "open" && a.due < today();
  const client = room.side === "client";
  const pick = (files: FileList | null) => { if (files?.[0]) void actions.upload?.(t.subject, files[0], false); };
  let buttons: React.ReactNode = null;
  if (client && a.state === "open") {
    buttons = (
      <>
        {a.kind === "file" && actions.upload
          ? <button type="button" className="btn btn-primary" onClick={() => fileInput.current?.click()}><Upload aria-hidden /> Send the file</button>
          : actions.answer && <button type="button" className="btn btn-primary" onClick={onAnswer}>Answer</button>}
        {actions.markDone && <button type="button" className="btn btn-secondary" onClick={() => void actions.markDone!(a.id)}><Check aria-hidden /> Mark done</button>}
      </>
    );
  }
  if (!client && actions.setAskState) {
    if (a.state === "answered") buttons = <button type="button" className="btn btn-primary" onClick={() => actions.setAskState!(a.id, "done")}><Check aria-hidden /> Got it — close</button>;
    else if (a.state === "open" && actions.remind) buttons = <button type="button" className="btn btn-secondary" onClick={() => actions.remind!(t.subject)}><Bell aria-hidden /> Remind</button>;
    else if (a.state === "done" || a.state === "cancelled") buttons = <button type="button" className="btn btn-tertiary" onClick={() => actions.setAskState!(a.id, "open")}><RotateCcw aria-hidden /> Open again</button>;
  }
  return (
    <article className="room-card" style={{ "--c": KIND[a.kind].color } as React.CSSProperties} aria-label={`Request ${a.code}`}>
      <header className="room-card-top">
        <TypeTag kind={a.kind} /><span className="room-card-key">{a.code}</span><span className="spacer" /><StatusPill room={room} t={t} />
      </header>
      <div className="room-card-body">
        <h3 className={a.kind === "question" ? "room-card-title is-question" : "room-card-title"}>{a.title}</h3>
        {a.kind === "access" ? (
          <dl className="room-fields">
            {a.invite && <><dt>Invite</dt><dd><code>{a.invite}</code></dd></>}
            {a.details && <><dt>Why</dt><dd>{a.details}</dd></>}
          </dl>
        ) : a.details && <p className="room-card-text">{a.details}</p>}
        {client && a.kind === "file" && a.state === "open" && actions.upload && (
          <label className="room-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}>
            <Upload aria-hidden /> Drop the file here, or <b>choose one</b>
            <input ref={fileInput} type="file" hidden onChange={(e) => pick(e.target.files)} />
          </label>
        )}
      </div>
      <footer className="room-card-foot">
        {forWhom ? <><RoomAvatar person={forWhom} side={room.side} size={20} /> For {nameOf(room, forWhom.id, "you")}</> : <span>For anyone at {room.project.client || "the client"}</span>}
        <span className="spacer" />
        {a.due && <span className={overdue ? "room-due is-late" : "room-due"}><CalendarDays aria-hidden /> by {dateLabel(a.due)}</span>}
      </footer>
      {buttons && <div className="room-card-actions">{buttons}</div>}
    </article>
  );
}

export function UpdateCard({ update, at }: { update: WeeklyUpdate; at: string }) {
  const step = STAGES.indexOf(update.stage);
  const health = { good: ["On track", "#00a35f"], watch: ["Needs attention", "#e99729"], risk: ["At risk", "#e2445c"] }[update.health];
  return (
    <article className="room-card" style={{ "--c": KIND.update.color } as React.CSSProperties} aria-label="Weekly update">
      <header className="room-card-top">
        <TypeTag kind="update" /><span className="room-card-key">{dayOf(at)}</span><span className="spacer" />
        <span className="room-status" style={{ "--c": health[1] } as React.CSSProperties}>{health[0]}</span>
      </header>
      <div className="room-card-body">
        <div className="room-card-lab">Where it is <span>{STAGE_NAME[update.stage]} · step {step + 1} of {STAGES.length}</span></div>
        <div className="room-stages" aria-hidden>{STAGES.map((s, i) => <i key={s} data-state={i < step ? "done" : i === step ? "now" : undefined} />)}</div>
        <dl className="room-fields is-wide">
          <dt>This week</dt><dd><Markdown text={update.week} plain={withMentions} /></dd>
          {update.next && <><dt>Next</dt><dd><Markdown text={update.next} plain={withMentions} /></dd></>}
          {update.needs && <><dt>Needs from you</dt><dd><Markdown text={update.needs} plain={withMentions} /></dd></>}
        </dl>
      </div>
    </article>
  );
}

/** A file in a message: an image shows; anything else is a chip to download. */
export function FileView({ file, actions }: { file: ThreadFile; actions: RoomActions }) {
  if (file.type.startsWith("image/")) {
    return (
      <a href={actions.fileUrl(file.id)} target="_blank" rel="noopener noreferrer" className="room-image">
        {/* eslint-disable-next-line @next/next/no-img-element -- a private file the API serves */}
        <img src={actions.fileUrl(file.id)} alt={file.name} loading="lazy" />
      </a>
    );
  }
  return (
    <a href={actions.fileUrl(file.id, true)} className="room-file">
      <span className="room-file-ico"><FileText aria-hidden /></span>
      <span className="room-file-name">{file.name}<small>{fileSize(file.size)}</small></span>
      <Download aria-hidden className="room-file-dl" />
    </a>
  );
}
