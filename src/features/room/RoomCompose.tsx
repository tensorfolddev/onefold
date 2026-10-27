"use client";

// The box to write in, WhatsApp's way: + inside it on the left (a file, a requirement, a request, the weekly update…),
// the lock (an internal note) and every emoji inside it on the right, and Send beside it. @ suggests who to tell —
// people, teams, everyone — and @@ makes it urgent: Send turns red, as a ticket's mention does.
import { useRef, useState } from "react";
import { AtSign, CircleHelp, ClipboardCheck, FileUp, KeyRound, Lock, Megaphone, Paperclip, Pencil, Plus, Reply, SendHorizontal, Smile, Users, X } from "lucide-react";
import type { RoomMessage, RoomModel, RoomThread } from "@/domain/selectors/room";
import type { AskKind } from "@/domain/types";
import { EmojiGrid } from "@/ui/EmojiGrid";
import { Popover } from "@/ui/Popover";
import { typingMention } from "@/ui/primitives";
import type { RoomActions } from "./roomActions";
import { KIND, nameOf, RoomAvatar } from "./roomUi";

export type Mode = { kind: "changes"; reqId: string } | { kind: "answer"; askId: string } | null;
const SHOWN = 6;
const URGENT = /(?:^|[^@\w])@@[^\s@]/;
type PlusKind = AskKind | "req" | "update" | "suggest" | "file-send";
const ICON = { req: ClipboardCheck, access: KeyRound, file: FileUp, question: CircleHelp, other: FileUp, update: Megaphone, suggest: ClipboardCheck, "file-send": Paperclip };
const COLOR = { req: KIND.req.color, access: KIND.access.color, file: KIND.file.color, question: KIND.question.color, other: KIND.other.color, update: KIND.update.color, suggest: KIND.req.color, "file-send": KIND.file.color };

/** Keyed by the chat it writes in: another chat starts with an empty box. */
export function RoomCompose({ room, t, actions, mode, replyTo, onCancel, onSent, input }: {
  room: RoomModel; t: RoomThread; actions: RoomActions; mode: Mode; replyTo: RoomMessage | null;
  onCancel: () => void; onSent: () => void; input: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState(false);
  const [plus, setPlus] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mention, setMention] = useState<ReturnType<typeof typingMention>>(null);
  const [pick, setPick] = useState(0);
  const [emojiQ, setEmojiQ] = useState("");
  const files = useRef<HTMLInputElement>(null);
  const team = room.side === "team";
  const notesOnly = team && (!room.clientFacing || t.internal); // no client here (or not yet): what the team writes stays theirs
  const writingNote = notesOnly || (team && note);
  const urgent = URGENT.test(draft);
  const matches = mention ? room.mentionables.filter((m) => m.name.toLowerCase().includes(mention.q.toLowerCase())).slice(0, SHOWN) : [];

  const watch = (value: string, caret: number) => { setMention(typingMention(value.slice(0, caret))); setPick(0); };
  /** Puts text in at the caret (or over `from`–`to`), and the caret after it. */
  const insert = (text: string, from?: number, to?: number) => {
    const el = input.current;
    const start = from ?? el?.selectionStart ?? draft.length;
    const end = to ?? el?.selectionEnd ?? start;
    setDraft(draft.slice(0, start) + text + draft.slice(end));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + text.length, start + text.length); });
  };
  const mentionPick = (name: string) => {
    if (!mention) return;
    insert(`${mention.urgent ? "@@" : "@"}${name} `, mention.at, input.current?.selectionStart ?? draft.length);
    setMention(null);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    let ok = false;
    if (mode?.kind === "changes") ok = !!(await actions.askChanges?.(mode.reqId, body));
    else if (mode?.kind === "answer") ok = !!(await actions.answer?.(mode.askId, body));
    else ok = !!(await actions.send?.(t.subject, body, { note: writingNote, ...(replyTo && { replyTo: replyTo.id }) }));
    setBusy(false);
    if (ok) { setDraft(""); onSent(); }
  };
  const upload = (list: FileList | null) => { if (list?.[0]) void actions.upload?.(t.subject, list[0], writingNote); };

  const plusItems: [PlusKind, string, string][] = team
    ? [["req", "New requirement", "Write it, then send it to confirm"],
      ...(room.clientFacing ? [["access", "Ask for access", "Logins, accounts, keys"], ["file", "Ask for a file", "Logos, content, documents"],
        ["question", "Ask a question", "Anything you need answered"], ["update", "Weekly update", "How it's going, for everyone"]] as typeof plusItems : []),
      ...(actions.upload ? [["file-send", "Attach a file", "A picture, a document — in this chat"]] as typeof plusItems : [])]
    : [...(room.myRole !== "tester" ? [["suggest", "Suggest a requirement", "Something you need built"]] as typeof plusItems : []), ["file-send", "Send a file", "Share it with the team"]];
  const plusPick = (k: PlusKind) => {
    setPlus(false);
    if (k === "req") actions.newRequirement?.();
    else if (k === "update") actions.weeklyUpdate?.();
    else if (k === "suggest") actions.suggest?.();
    else if (k === "file-send") files.current?.click();
    else actions.newRequest?.(k);
  };
  const placeholder = mode?.kind === "changes" ? "What should change?" : mode?.kind === "answer" ? "Your answer…"
    : writingNote ? "Internal note — only the team sees it" : team ? `Message ${room.project.client || "the client"}…` : "Message the team…";

  return (
    <div className="room-compose-wrap">
      {plus && (
        <div className="room-plus" role="menu">
          {plusItems.map(([k, label, hint]) => {
            const Icon = ICON[k];
            return (
              <button key={k} type="button" role="menuitem" onClick={() => plusPick(k)}>
                <span className="room-plus-ico" style={{ "--c": COLOR[k] } as React.CSSProperties}><Icon aria-hidden /></span>
                <span>{label}<small>{hint}</small></span>
              </button>
            );
          })}
        </div>
      )}
      {matches.length > 0 && (
        <div className="composer-mentions room-mentions" role="listbox" aria-label={mention?.urgent ? "Mention urgently" : "Mention someone"}>
          {mention?.urgent && <p className="composer-mentions-hint">🚨 Urgent — a louder alert for them</p>}
          {matches.map((m, i) => (
            <button key={m.name} type="button" role="option" aria-selected={i === pick} className="menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => mentionPick(m.name)}>
              {m.id && room.people[m.id] ? <RoomAvatar person={room.people[m.id]} side={room.side} size={22} />
                : <span className="room-mention-ico" aria-hidden>{m.name === "everyone" ? <AtSign /> : <Users />}</span>}
              <span className="composer-mentions-name">{m.name}</span><span className="menu-item-end">{m.hint}</span>
            </button>
          ))}
        </div>
      )}
      <form className={`room-compose${writingNote ? " is-note" : ""}`} onSubmit={(e) => { e.preventDefault(); void send(); }}>
        {(replyTo || mode) && (
          <p className="room-compose-ctx">
            {replyTo && <><Reply aria-hidden /> Replying to <b>{nameOf(room, replyTo.authorId)}</b>: {replyTo.body.slice(0, 80) || replyTo.data?.file?.name}</>}
            {mode?.kind === "changes" && <><Pencil aria-hidden /> What should change in <b>{t.title}</b>?</>}
            {mode?.kind === "answer" && <><Reply aria-hidden /> Your answer to <b>{t.title}</b></>}
            <button type="button" className="room-icon-btn" onClick={onCancel} aria-label="Cancel"><X aria-hidden /></button>
          </p>
        )}
        <div className="room-compose-line">
          <div className="room-compose-box">
            <span className="room-compose-tools">
              <button type="button" className="room-icon-btn" aria-label="Add" aria-expanded={plus} data-tip="Add a file, a requirement, a request…" onClick={() => setPlus((p) => !p)}><Plus aria-hidden /></button>
            </span>
            <input ref={files} type="file" hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <textarea ref={input} rows={1} value={draft} maxLength={4000} aria-label="Message" placeholder={placeholder}
              onChange={(e) => { setDraft(e.target.value); watch(e.target.value, e.target.selectionStart ?? 0); }}
              onClick={(e) => watch(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
              onBlur={() => setTimeout(() => setMention(null), 150)}
              onKeyDown={(e) => {
                if (matches.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setPick((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length); return; }
                  if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); mentionPick(matches[pick].name); return; }
                  if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
                }
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); }
              }} />
            <span className="room-compose-tools">
              {team && !notesOnly && !mode && (
                <button type="button" className="room-icon-btn room-note-btn" aria-pressed={note} aria-label="Internal note" data-tip={note ? "Writing a note — only the team sees it" : "Write an internal note"} onClick={() => setNote((n) => !n)}><Lock aria-hidden /></button>
              )}
              <Popover
                floating // the chat clips what overflows it
                width={340}
                align="right"
                trigger={({ open, toggle }) => (
                  <button type="button" className={`room-icon-btn${open ? " is-open" : ""}`} aria-label="Emoji" aria-haspopup="dialog" aria-expanded={open} data-tip="Emoji" onClick={toggle}><Smile aria-hidden /></button>
                )}
              >
                {() => (
                  <div className="icon-picker room-emoji">
                    <input type="search" className="input room-emoji-search" placeholder="Search emoji" aria-label="Search emoji" value={emojiQ} onChange={(e) => setEmojiQ(e.target.value)} />
                    <EmojiGrid query={emojiQ} onPick={(e) => insert(e)} />
                  </div>
                )}
              </Popover>
            </span>
          </div>
          <button type="submit" className={`room-send${urgent ? " is-urgent" : ""}`} aria-label={urgent ? "Send — urgent" : "Send"} data-tip={urgent ? "Urgent: they get a louder alert" : undefined} disabled={!draft.trim() || busy}>
            <SendHorizontal aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}
