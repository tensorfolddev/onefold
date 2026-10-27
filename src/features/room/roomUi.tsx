"use client";

// The small shared pieces of the Client tab: what each status (domain/selectors/clientLook.ts: the company's own words)
// and kind is called, their colours and icons, a person's face, and when something happened.
import { ClipboardCheck, CircleHelp, FileUp, Inbox, KeyRound, Megaphone, MessagesSquare } from "lucide-react";
import { templateOf, photoFileOf } from "@/domain/avatars";
import type { RoomModel, RoomPerson, RoomThread, Side } from "@/domain/selectors/room";
import { askPhase, reqPhase } from "@/domain/selectors/clientLook";
import type { AskKind, ClientEvent } from "@/domain/types";
import { rem } from "@/ui/primitives";

export const KIND: Record<"req" | AskKind | "update" | "chat", { label: string; color: string }> = {
  req: { label: "Requirement", color: "#9d50dd" },
  access: { label: "Access", color: "#00a9a5" },
  file: { label: "File", color: "#579bfc" },
  question: { label: "Question", color: "#e99729" },
  other: { label: "Request", color: "#7f5347" },
  update: { label: "Weekly update", color: "#00a35f" },
  chat: { label: "Project chat", color: "#00c875" },
};
export const kindOf = (t: RoomThread) => (t.kind === "req" ? "req" : t.kind === "ask" ? t.ask!.kind : "chat");

export function KindIcon({ kind, size = 16 }: { kind: keyof typeof KIND; size?: number }) {
  const props = { width: size, height: size, style: { width: rem(size), height: rem(size) }, "aria-hidden": true };
  if (kind === "req") return <ClipboardCheck {...props} />;
  if (kind === "access") return <KeyRound {...props} />;
  if (kind === "file") return <FileUp {...props} />;
  if (kind === "question") return <CircleHelp {...props} />;
  if (kind === "update") return <Megaphone {...props} />;
  if (kind === "chat") return <MessagesSquare {...props} />;
  return <Inbox {...props} />;
}

/** A thread's phase, in the company's words for whoever is looking. */
export function statusOf(room: RoomModel, t: RoomThread): { label: string; color: string } | null {
  return t.requirement ? reqPhase(room.look, t.requirement.status, room.side) : t.ask ? askPhase(room.look, t.ask.state, room.side) : null;
}
export function StatusPill({ room, t }: { room: RoomModel; t: RoomThread }) {
  const s = statusOf(room, t);
  return s ? <span className="room-status" style={{ "--c": s.color } as React.CSSProperties}>{s.label}</span> : null;
}
export function TypeTag({ kind }: { kind: keyof typeof KIND }) {
  return <span className="room-type" style={{ "--t": KIND[kind].color } as React.CSSProperties}><KindIcon kind={kind} size={13} />{KIND[kind].label}</span>;
}

/** A face: their photo (the team's side only — files are the team's), a ready-made picture, or initials. */
export function RoomAvatar({ person, side, size = 32 }: { person?: RoomPerson; side: Side; size?: number }) {
  const style = { width: rem(size), height: rem(size), fontSize: rem(Math.round(size * 0.38)) } as React.CSSProperties;
  if (!person) return <span className="room-avatar is-empty" style={style} aria-hidden />;
  const tpl = templateOf(person.photo);
  const file = side === "team" ? photoFileOf(person.photo) : undefined;
  if (file) {
    // eslint-disable-next-line @next/next/no-img-element -- a small private image the API serves
    return <span className="room-avatar" style={style} title={person.name}><img src={`/api/files/${file}`} alt="" loading="lazy" /></span>;
  }
  if (tpl) return <span className="room-avatar" style={{ ...style, background: tpl.bg }} title={person.name} role="img" aria-label={person.name}>{tpl.emoji}</span>;
  return <span className="room-avatar" style={{ ...style, background: person.color }} title={person.name} role="img" aria-label={person.name}>{person.initials}</span>;
}

export const nameOf = (room: RoomModel, id: string, you = "You") => (id === room.meId ? you : room.people[id]?.name ?? "Someone");
export const firstName = (room: RoomModel, id: string) => (id === room.meId ? "You" : (room.people[id]?.name ?? "Someone").split(" ")[0]);

const EVENT: Record<ClientEvent, (who: string, again: boolean) => string> = {
  sent: (who, again) => `${who} sent ${again ? "the updated version" : "this"} to confirm`,
  confirmed: (who, again) => `${who} confirmed ${again ? "the updated version" : "it"}`,
  changes: (who) => `${who} asked for changes`,
  proposed: (who) => `${who} suggested this`,
  taken: (who) => `${who} took it on`,
  asked: (who) => `${who} asked for this`,
  answered: (who) => `${who} answered`,
  done: (who) => `${who} marked it done`,
  cancelled: (who) => `${who} called it off`,
  reopened: (who) => `${who} opened it again`,
  reminded: (who) => `${who} sent a reminder`,
};
/** An app line in words. `again`: the same kind came before in this chat (a second send, a second confirmation). */
export const eventText = (room: RoomModel, event: ClientEvent, authorId: string, again = false) => EVENT[event](nameOf(room, authorId), again);
/** Whether an event line repeats one earlier in its chat. */
export const isAgain = (t: RoomThread, m: { id: string; event?: ClientEvent }) => {
  const i = t.messages.findIndex((x) => x.id === m.id);
  return t.messages.slice(0, i).some((x) => x.kind === "event" && x.event === m.event);
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
/** "Today", "Yesterday", "Thu, Oct 22". */
export function dayOf(iso: string) {
  const d = new Date(iso), now = new Date(), y = new Date(now.getTime() - 86_400_000);
  if (sameDay(d, now)) return "Today";
  if (sameDay(d, y)) return "Yesterday";
  return d.toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric", ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }) });
}
/** In the list: a time today, else the day. */
export const shortWhen = (iso: string) => (iso ? (sameDay(new Date(iso), new Date()) ? clock(iso) : dayOf(iso)) : "");
/** "Oct 30" from "2026-10-30". */
export const dateLabel = (day: string) => { const [, m, d] = day.split("-").map(Number); return `${MONTHS[m - 1]} ${d}`; };
/** How long something has waited: "now", "4h", "2d". */
export function waited(iso: string) {
  const h = Math.max(0, (Date.now() - Date.parse(iso)) / 36e5);
  return h < 1 ? "now" : h < 24 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}
export const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
