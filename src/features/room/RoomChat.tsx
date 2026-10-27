"use client";

// One chat: its head (what it is, where it stands, the next step), what's pinned, its lines — messages (Markdown,
// @mentions), notes only the team sees, files, the app's own lines ("Ali confirmed version 2") and the card, where it
// was sent — and the box to write in (RoomCompose). A line can be replied to, starred (yours only), pinned (for
// everyone) or deleted — for you, or for everyone if you wrote it; two ticks turn blue once the other side has read it.
import { Fragment, useEffect, useRef, useState } from "react";
import { Archive, Bell, CheckCheck, ClipboardCheck, Copy, KeyRound, Lock, Megaphone, MoreHorizontal, Pencil, Pin, PinOff, Reply, Star, StarOff, Ticket, Trash2, X } from "lucide-react";
import { seenByOtherSide, whoseMove, type RoomMessage, type RoomModel, type RoomThread } from "@/domain/selectors/room";
import { Markdown, withMentions } from "@/ui/Markdown";
import { Popover } from "@/ui/Popover";
import { AskCard, FileView, RequirementCard, SentVersionCard, UpdateCard } from "./RoomCards";
import { RoomCompose, type Mode } from "./RoomCompose";
import { ThreadIcon } from "./RoomTable";
import type { RoomActions } from "./roomActions";
import { clock, dayOf, eventText, isAgain, KIND, nameOf, RoomAvatar, StatusPill } from "./roomUi";

const GROUP_MS = 5 * 60_000; // lines from one person this close together share their name

/** Where the card sits: at the line that last sent it (sent to confirm, suggested, asked) — or, with none, on top. */
function cardAt(t: RoomThread) {
  const events = t.kind === "req" ? ["sent", "proposed"] : ["asked"];
  return t.messages.map((m) => m.kind === "event" && events.includes(m.event!)).lastIndexOf(true);
}

/** Read by whoever it's for: the other side — or, for a note (or a chat with no client), another teammate. */
function seen(room: RoomModel, t: RoomThread, m: RoomMessage) {
  if (m.kind !== "note" && room.clientFacing) return seenByOtherSide(room, t.subject, m);
  return room.reads.some((r) => r.subject === t.subject && r.personId !== room.meId && room.people[r.personId]?.side === room.side && Date.parse(r.at) >= Date.parse(m.at));
}
const gist = (m: RoomMessage) => (m.body.replace(/[*_`>#[\]]/g, "").trim() || m.data?.file?.name || "…").slice(0, 120);

function HeadActions({ room, t, actions, onMode }: { room: RoomModel; t: RoomThread; actions: RoomActions; onMode: (m: Mode) => void }) {
  const r = t.requirement, a = t.ask;
  if (room.side === "client") {
    if (r?.status === "to_confirm" && room.myRole !== "tester" && actions.confirm) return <button type="button" className="btn btn-primary btn-sm" onClick={() => void actions.confirm!(r.id)}>Confirm</button>;
    if (a?.state === "open" && actions.answer) return <button type="button" className="btn btn-primary btn-sm" onClick={() => onMode({ kind: "answer", askId: a.id })}>Answer</button>;
    return null;
  }
  const waiting = whoseMove(room, t)?.side === "client";
  return (
    <>
      {waiting && actions.remind && <button type="button" className="btn btn-tertiary btn-sm" onClick={() => actions.remind!(t.subject)}><Bell aria-hidden /> Remind</button>}
      {r && actions.createTicket && r.status !== "dropped" && <button type="button" className="btn btn-secondary btn-sm" onClick={() => actions.createTicket!(t)}><Ticket aria-hidden /> Create ticket</button>}
      {r && actions.openRequirement && <button type="button" className="btn btn-secondary btn-sm" onClick={() => actions.openRequirement!(r.id)}><Pencil aria-hidden /> Edit</button>}
      {r && actions.archive && <button type="button" className="btn btn-tertiary btn-sm" onClick={() => actions.archive!(r.id)}><Archive aria-hidden /> Archive</button>}
      {t.kind === "chat" && room.clientFacing && actions.weeklyUpdate && <button type="button" className="btn btn-primary btn-sm" onClick={actions.weeklyUpdate}><Megaphone aria-hidden /> Weekly update</button>}
    </>
  );
}

/** What's pinned, newest first: a click goes to it (and on to the next); anyone can unpin. */
function Pinned({ t, actions }: { t: RoomThread; actions: RoomActions }) {
  const [at, setAt] = useState(0);
  const pins = t.messages.filter((m) => m.pinnedAt && !m.deletedAt).sort((a, b) => b.pinnedAt!.localeCompare(a.pinnedAt!));
  if (!pins.length) return null;
  const m = pins[at % pins.length];
  const go = () => {
    document.getElementById(`line-${m.id}`)?.scrollIntoView({ block: "center" });
    setAt((i) => i + 1);
  };
  return (
    <div className="room-pins">
      <button type="button" className="room-pins-main" onClick={go} aria-label={`Pinned: ${gist(m)} — go to it`}>
        <Pin aria-hidden />
        <span><b>{pins.length > 1 ? `Pinned · ${(at % pins.length) + 1} of ${pins.length}` : "Pinned"}</b><span>{gist(m)}</span></span>
      </button>
      {actions.pin && <button type="button" className="room-icon-btn" aria-label="Unpin" data-tip="Unpin" onClick={() => actions.pin!(m.id, false)}><PinOff aria-hidden /></button>}
    </div>
  );
}

/** "Delete for everyone" (yours only) or "Delete for me" — asked first, as WhatsApp does. */
function DeleteDialog({ mine, onDelete, onClose }: { mine: boolean; onDelete: (everyone: boolean) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d?.open) d?.showModal(); return () => d?.close(); }, []);
  return (
    <dialog ref={ref} className="confirm-dialog room-delete" aria-labelledby="room-delete-title" onCancel={(e) => { e.preventDefault(); onClose(); }}>
      <h2 id="room-delete-title" className="confirm-title">Delete this message?</h2>
      <p className="confirm-body">{mine ? "For everyone: it shows as “This message was deleted” for everyone in the chat. For you: only you stop seeing it." : "Only you stop seeing it — everyone else still has it."}</p>
      <div className="room-delete-actions">
        {mine && <button type="button" className="btn btn-primary btn-danger" onClick={() => onDelete(true)}>Delete for everyone</button>}
        <button type="button" className={mine ? "btn btn-secondary" : "btn btn-primary btn-danger"} onClick={() => onDelete(false)}>Delete for me</button>
        <button type="button" className="btn btn-tertiary" onClick={onClose} autoFocus>Cancel</button>
      </div>
    </dialog>
  );
}

function Line({ room, t, m, prev, actions, onReply, mine }: {
  room: RoomModel; t: RoomThread; m: RoomMessage; prev?: RoomMessage; actions: RoomActions; onReply: (m: RoomMessage) => void; mine: boolean;
}) {
  const [deleting, setDeleting] = useState(false);
  const author = room.people[m.authorId];
  const grouped = !!prev && prev.authorId === m.authorId && prev.kind !== "event" && (prev.kind === "note") === (m.kind === "note")
    && Date.parse(m.at) - Date.parse(prev.at) < GROUP_MS && !prev.data?.update;
  const quoted = m.data?.replyTo ? t.messages.find((x) => x.id === m.data!.replyTo) : undefined;
  const team = room.side === "team";
  const text = m.body.trim();
  const gone = !!m.deletedAt;
  const more = !!(actions.star || actions.pin || actions.deleteMessage);
  const tools = (actions.send || more) && (
    <span className="room-line-tools">
      {!gone && actions.send && <button type="button" onClick={() => onReply(m)} aria-label="Reply" data-tip="Reply" data-tip-pos="top"><Reply aria-hidden /></button>}
      {!gone && team && text && actions.makeRequirement && <button type="button" onClick={() => actions.makeRequirement!(text.slice(0, 200))} aria-label="Make it a requirement" data-tip="Make it a requirement" data-tip-pos="top"><ClipboardCheck aria-hidden /></button>}
      {!gone && team && text && actions.makeRequest && room.clientFacing && <button type="button" onClick={() => actions.makeRequest!(text.slice(0, 200))} aria-label="Make it a request" data-tip="Ask the client for it" data-tip-pos="top"><KeyRound aria-hidden /></button>}
      {!gone && team && text && actions.createTicket && <button type="button" onClick={() => actions.createTicket!(t, text.slice(0, 200))} aria-label="Make it a ticket" data-tip="Make it a ticket" data-tip-pos="top"><Ticket aria-hidden /></button>}
      {more && (
        <Popover
          floating // the chat clips what overflows it
          width={210}
          align={mine ? "left" : "right"}
          trigger={({ open, toggle }) => <button type="button" onClick={toggle} aria-label="More" aria-haspopup="menu" aria-expanded={open} data-tip="More" data-tip-pos="top"><MoreHorizontal aria-hidden /></button>}
        >
          {(close) => (
            <div role="menu" aria-label="Message">
              {!gone && actions.star && <button type="button" role="menuitem" className="menu-item" onClick={() => { actions.star!(m.id, !m.starred); close(); }}>{m.starred ? <><StarOff aria-hidden /> Unstar</> : <><Star aria-hidden /> Star — just for you</>}</button>}
              {!gone && actions.pin && <button type="button" role="menuitem" className="menu-item" onClick={() => { actions.pin!(m.id, !m.pinnedAt); close(); }}>{m.pinnedAt ? <><PinOff aria-hidden /> Unpin</> : <><Pin aria-hidden /> Pin for everyone</>}</button>}
              {!gone && text && <button type="button" role="menuitem" className="menu-item" onClick={() => { void navigator.clipboard.writeText(text).catch(() => {}); close(); }}><Copy aria-hidden /> Copy text</button>}
              {actions.deleteMessage && <button type="button" role="menuitem" className="menu-item is-danger" onClick={() => { close(); setDeleting(true); }}><Trash2 aria-hidden /> Delete…</button>}
            </div>
          )}
        </Popover>
      )}
    </span>
  );
  return (
    <div id={`line-${m.id}`} className={`room-line${mine ? " is-mine" : ""}${grouped ? " is-grouped" : ""}`}>
      {!mine && <RoomAvatar person={author} side={room.side} size={28} />}
      <div className={`room-bubble${m.kind === "note" ? " is-note" : ""}${m.data?.update && !gone ? " is-bare" : ""}${gone ? " is-gone" : ""}`}>
        {tools}
        {!mine && !grouped && <p className="room-who">{author?.name ?? "Someone"}<span>{author?.side === "client" ? author.company ?? "Client" : author?.title}</span></p>}
        {gone ? <span className="room-gone">{mine ? "You deleted this message" : "This message was deleted"}</span> : (
          <>
            {m.kind === "note" && <p className="room-note-tag"><Lock aria-hidden /> Internal note — {room.project.client || "the client"} can&apos;t see this</p>}
            {quoted && <p className="room-quote"><b>{nameOf(room, quoted.authorId)}</b>{quoted.deletedAt ? "This message was deleted" : gist(quoted)}</p>}
            {m.data?.update ? <UpdateCard update={m.data.update} at={m.at} /> : null}
            {m.data?.file && <FileView file={m.data.file} actions={actions} />}
            {text && <Markdown text={text} plain={withMentions} className="room-text" />}
          </>
        )}
        <span className="room-meta">
          {m.starred && <Star aria-label="Starred" className="room-meta-star" />}
          {m.pinnedAt && !gone && <Pin aria-label="Pinned" />}
          {m.via === "whatsapp" ? "WhatsApp · " : ""}{clock(m.at)}
          {mine && !gone && <CheckCheck className={seen(room, t, m) ? "room-ticks is-seen" : "room-ticks"} aria-label={seen(room, t, m) ? "Read" : "Sent"} />}
        </span>
      </div>
      {deleting && <DeleteDialog mine={mine && !gone} onClose={() => setDeleting(false)} onDelete={(everyone) => { setDeleting(false); actions.deleteMessage!(m.id, everyone); }} />}
    </div>
  );
}

export function RoomChat({ room, t, actions, onClose, onDetails, preview }: {
  room: RoomModel; t: RoomThread; actions: RoomActions; onClose?: () => void; onDetails: () => void; preview?: boolean;
}) {
  const [replyTo, setReplyTo] = useState<RoomMessage | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const lines = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true); // following the newest line — until you scroll up to read
  useEffect(() => {
    const el = lines.current;
    if (!el) return;
    const follow = () => { if (atBottom.current) end.current?.scrollIntoView({ block: "end" }); };
    el.addEventListener("load", follow, true); // an image arriving makes the chat taller
    return () => el.removeEventListener("load", follow, true);
  }, []);
  useEffect(() => { atBottom.current = true; end.current?.scrollIntoView({ block: "end" }); }, [t.subject, t.messages.length]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- a different chat starts with nothing being replied to
  useEffect(() => { setReplyTo(null); setMode(null); }, [t.subject]);
  const start = (m: Mode) => { setMode(m); setReplyTo(null); input.current?.focus(); };

  const at = cardAt(t);
  const card = t.requirement
    ? <RequirementCard room={room} t={t} actions={actions} onChanges={() => start({ kind: "changes", reqId: t.requirement!.id })} />
    : t.ask ? <AskCard room={room} t={t} actions={actions} onAnswer={() => start({ kind: "answer", askId: t.ask!.id })} /> : null;
  const newDay = t.messages.map((m, i) => i === 0 || dayOf(m.at) !== dayOf(t.messages[i - 1].at)); // a day's first line gets its date
  const canWrite = !!actions.send && !preview;
  const lineActions = preview ? { fileUrl: actions.fileUrl } : actions;
  const subtitle = t.kind === "chat"
    ? [...room.clients.map((c) => room.people[c.personId]?.name).filter(Boolean), room.side === "team" ? "and the team" : `and ${room.companyName}`].join(", ")
    : `${t.kind === "req" ? "Requirement" : KIND[t.ask!.kind].label} ${t.key}${t.internal ? " · only the team sees it" : ""}`;

  return (
    <section className="room-chat" aria-label={t.title}>
      <header className="room-chat-head">
        <button type="button" className="room-chat-title" onClick={onDetails} aria-label={`${t.title} — details`}>
          <ThreadIcon room={room} t={t} />
          <span><b>{t.title}</b><span className="room-chat-sub">{t.kind !== "chat" && <StatusPill room={room} t={t} />}{subtitle}</span></span>
        </button>
        <span className="room-chat-actions">{!preview && <HeadActions room={room} t={t} actions={actions} onMode={start} />}</span>
        {onClose && <button type="button" className="room-icon-btn room-chat-close" onClick={onClose} aria-label="Close chat" data-tip="Close"><X aria-hidden /></button>}
      </header>
      <Pinned t={t} actions={lineActions} />

      <div className="room-lines" aria-live="polite" ref={lines}
        onScroll={(e) => { const el = e.currentTarget; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {at < 0 && card && <div className="room-card-line is-pinned">{card}</div>}
        {t.messages.map((m, i) => (
          <Fragment key={m.id}>
            {newDay[i] && <p className="room-day">{dayOf(m.at)}</p>}
            {i === at && card ? (
              <div className={`room-card-line${m.authorId === room.meId ? " is-mine" : ""}`}>
                <p className="room-card-by">{eventText(room, m.event!, m.authorId, isAgain(t, m))} · {clock(m.at)}</p>
                {card}
              </div>
            ) : m.kind === "event" && m.event === "sent" && m.data?.sent ? (
              <div className={`room-card-line${m.authorId === room.meId ? " is-mine" : ""}`}>
                <p className="room-card-by">{eventText(room, m.event, m.authorId, isAgain(t, m))} · {clock(m.at)}</p>
                <SentVersionCard t={t} m={m} />
              </div>
            ) : m.kind === "event" ? (
              <p className="room-event">{eventText(room, m.event!, m.authorId, isAgain(t, m))} · {clock(m.at)}</p>
            ) : (
              <Line room={room} t={t} m={m} prev={t.messages[i - 1]} actions={lineActions} onReply={(x) => { setReplyTo(x); setMode(null); input.current?.focus(); }} mine={m.authorId === room.meId} />
            )}
          </Fragment>
        ))}
        {!t.messages.length && !card && <p className="room-empty">{t.kind === "chat" ? (room.clientFacing ? `Write to ${room.project.client || "the client"} — everyone on their side sees this chat.` : "Talk it through with the team here.") : "Nothing here yet."}</p>}
        <div ref={end} />
      </div>

      {canWrite && <RoomCompose key={t.subject} room={room} t={t} actions={actions} mode={mode} replyTo={replyTo} input={input}
        onCancel={() => { setReplyTo(null); setMode(null); }} onSent={() => { setReplyTo(null); setMode(null); }} />}
    </section>
  );
}
