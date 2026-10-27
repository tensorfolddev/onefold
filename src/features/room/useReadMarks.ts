"use client";

// What's unread in the Client tab: how far you've read each chat — kept on the server (so it follows you between
// devices, and gives the other side its blue ticks) and in this browser (the first visit counts everything as read, so
// only what arrives after shows as new). And the tone when someone else's line arrives.
import { useCallback, useEffect, useRef, useState } from "react";
import { myReadAt, type RoomModel, type RoomThread } from "@/domain/selectors/room";
import { playNotice } from "@/features/shell/noticeSounds";

type Marks = Record<string, string>;
const load = (key: string): Marks | null => {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as Marks) : null; } catch { return null; }
};
const save = (key: string, marks: Marks) => { try { localStorage.setItem(key, JSON.stringify(marks)); } catch { /* private mode: unread just isn't kept */ } };
const latest = (t: RoomThread) => t.messages.at(-1)?.at ?? "";
const later = (a: string, b: string) => (Date.parse(a || "0") >= Date.parse(b || "0") ? a : b);

export function useReadMarks(room: RoomModel, markServer?: (subject: string, at: string) => void) {
  const key = `onefold-room-read:${room.side}:${room.meId}:${room.project.key}`;
  const [marks, setMarks] = useState<Marks | null>(null); // null until this browser's marks are read
  const server = useRef(markServer);
  const sent = useRef<Marks>({}); // what we've told the server, so a re-render doesn't tell it again
  useEffect(() => { server.current = markServer; }, [markServer]);
  useEffect(() => {
    const saved = load(key);
    const first = saved ?? Object.fromEntries(room.threads.map((t) => [t.subject, latest(t)]));
    if (!saved) save(key, first);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- this browser's marks, read once it's in the browser
    setMarks(first);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- the first visit's baseline is the room as it is then
  const seenAt = useCallback((t: RoomThread) => later(marks?.[t.subject] ?? "", myReadAt(room, t.subject) ?? ""), [marks, room]);
  const markRead = useCallback((t: RoomThread) => {
    const at = latest(t);
    if (!at) return;
    setMarks((m) => {
      if (!m || (m[t.subject] ?? "") >= at) return m;
      const next = { ...m, [t.subject]: at };
      save(key, next);
      return next;
    });
    const told = later(sent.current[t.subject] ?? "", myReadAt(room, t.subject) ?? "");
    if (server.current && Date.parse(at) > Date.parse(told || "0")) {
      sent.current[t.subject] = at;
      server.current(t.subject, at);
    }
  }, [key, room]);
  /** New to you: what others wrote since you last read it (a chat that's new since your first visit: all of it). */
  const unread = useCallback((t: RoomThread) => {
    if (!marks) return 0;
    const seen = Date.parse(seenAt(t) || "0");
    return t.messages.filter((m) => Date.parse(m.at) > seen && m.authorId !== room.meId).length;
  }, [marks, seenAt, room.meId]);
  return { unread, markRead };
}

/** A soft tone when a line from someone else arrives in any of the room's chats — no notification, just the sound. */
export function useChatTone(room: RoomModel) {
  const newest = room.threads.reduce((max, t) => {
    const m = t.messages.findLast((x) => x.authorId !== room.meId);
    return m && m.at > max ? m.at : max;
  }, "");
  const heard = useRef<string | null>(null); // null: the room just opened — what's there already makes no sound
  useEffect(() => {
    if (heard.current !== null && newest > heard.current) playNotice("chat");
    heard.current = newest;
  }, [newest]);
}
