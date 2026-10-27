"use client";

// The Client tab, laid out like the tickets board — no box, no header: the tickets board's toolbar (view, New, Search,
// Person, Filter, Sort) with the three sections on its right — Chat (first: where it opens), Requirements, Requests.
// Chat is the project's own chat, right there; the other two are the main table in status groups or the kanban. A row
// or a card opens its chat in a panel that slides in, like a ticket's. The same for the team and the client, each with
// their own buttons. The open chat is in the URL (?t=…), so links from emails and the inbox land on it. The page never
// scrolls: the section fills the window, and only it scrolls.
import { useEffect, useRef, useState } from "react";
import type { RoomModel } from "@/domain/selectors/room";
import { RoomChat } from "./RoomChat";
import { RoomDetails } from "./RoomDetails";
import { RoomGuide, RoomInvite } from "./RoomGuide";
import { filterThreads, isFiltered, NO_QUERY, type RoomQuery, type RoomView } from "./roomFilters";
import { addOf, RoomKanban, RoomTable } from "./RoomTable";
import { RoomToolbar, sortsFor, type RoomSection } from "./RoomToolbar";
import type { RoomActions } from "./roomActions";
import { useChatTone, useReadMarks } from "./useReadMarks";

/** The section runs to the bottom of the window (the tickets board's way): the page itself never scrolls. */
function useFillHeight(deps: unknown[]) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el || el.closest("dialog")) return; // in a dialog (View as client), the dialog sizes it
      const page = el.closest(".page");
      const below = page ? parseFloat(getComputedStyle(page).paddingBottom) || 0 : 16;
      const top = (el.querySelector(".room-body") ?? el).getBoundingClientRect().top; // below the toolbar
      const area = el.closest(".work-area");
      const bottom = area?.getBoundingClientRect().bottom ?? window.innerHeight; // above a phone's tab bar, inside a card
      const h = Math.max(360, bottom - top - below);
      el.style.setProperty("--room-h", `${h}px`);
      const extra = area ? area.scrollHeight - area.clientHeight : 0; // what the sum above misses (a pane's margin, a border)
      if (extra > 0) el.style.setProperty("--room-h", `${Math.max(360, h - extra)}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps -- measured again when the toolbar above it changes
  return ref;
}

export function Room({ room, actions, subject, onSubject, preview }: {
  room: RoomModel; actions: RoomActions; subject: string | null; onSubject: (subject: string | null) => void; preview?: boolean;
}) {
  const [tab, setTab] = useState<"req" | "ask">(subject?.startsWith("ask:") ? "ask" : "req");
  const [onChat, setOnChat] = useState(!subject || subject.startsWith("chat:")); // it opens on the chat
  const [view, setView] = useState<RoomView>("board"); // the kanban first, both sides; ponytail: not remembered across reloads
  const [q, setQ] = useState<RoomQuery>(NO_QUERY);
  const [details, setDetails] = useState(false);
  const [modal, setModal] = useState<"invite" | "guide" | null>(null);
  const live = preview ? { fileUrl: actions.fileUrl } : actions;
  const { unread, markRead } = useReadMarks(room, live.markRead);
  useChatTone(room);
  const chat = room.threads.find((t) => t.kind === "chat")!;
  const current = room.threads.find((t) => t.subject === subject); // the open chat, if any
  const team = room.side === "team";
  const switchTab = (kind: "req" | "ask") => { // a status, a priority or a sort of one tab means nothing on the other
    setTab(kind);
    setQ((cur) => ({ ...cur, filters: { ...cur.filters, status: [], priority: [], type: [] }, sort: sortsFor(kind).some((s) => s.id === cur.sort) ? cur.sort : "none" }));
  };
  const [shownKind, setShownKind] = useState(current?.kind);
  if (current?.kind !== shownKind) { // a link to a request shows the requests; one to the project chat, the chat
    setShownKind(current?.kind);
    if (current?.kind === "chat") setOnChat(true);
    else if (current) { setOnChat(false); if (current.kind !== tab) switchTab(current.kind); }
  }
  const open = (s: string) => { onSubject(s); setDetails(false); };
  const close = () => { onSubject(null); setDetails(false); };
  const drawer = current && current.kind !== "chat" ? current : undefined; // the project's chat isn't a panel: it's a section
  const section: RoomSection = onChat ? "chat" : tab;
  const onSection = (s: RoomSection) => {
    setDetails(false);
    if (current) onSubject(null); // the URL says where you are; a section has no chat open in it
    setOnChat(s === "chat");
    if (s !== "chat" && s !== tab) switchTab(s);
  };
  const seen = drawer ?? (section === "chat" ? chat : undefined); // the chat on screen is read
  useEffect(() => { if (seen) markRead(seen); }, [seen, markRead]);
  const body = useFillHeight([section, view]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => { // Escape closes it — unless you're typing, or something opened over it
      const el = e.target as HTMLElement;
      if (e.key !== "Escape" || el.closest("input, textarea, [contenteditable]") || document.querySelectorAll("[aria-modal='true']").length > 1) return;
      onSubject(null);
      setDetails(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, onSubject]);

  const showDetails = () => {
    if (team && drawer?.requirement && actions.openRequirement) actions.openRequirement(drawer.requirement.id);
    else setDetails((d) => !d);
  };
  const all = room.threads.filter((t) => t.kind === tab);
  // In the default order, what has news for you comes first — then the latest activity (the room's own order): a new
  // message brings its item to the top of its group or column.
  const found = filterThreads(room, all, q, unread);
  const shown = q.sort === "none" ? [...found].sort((a, b) => Number(unread(b) > 0) - Number(unread(a) > 0)) : found;
  const filtered = isFiltered(q);
  const withNews = (kind: "req" | "ask") => room.threads.filter((t) => t.kind === kind && unread(t) > 0).length;
  const counts = { chat: unread(chat), req: withNews("req"), ask: withNews("ask") }; // chat: new lines · the others: items with any
  const add = addOf(room, tab, live);
  const addLabel = tab === "req" ? (team ? "New requirement" : "Suggest a requirement") : "New request";

  const List = view === "board" ? RoomKanban : RoomTable;
  const invite = team && room.clientFacing && !preview && actions.people ? () => setModal("invite") : undefined;
  const guide = !preview && !invite ? () => setModal("guide") : undefined; // the team's guide is in the invite dialog
  return (
    <>
      <div className="room" data-side={room.side} ref={body}>
        <RoomToolbar room={room} section={section} onSection={onSection} counts={counts} onInvite={invite} onGuide={guide}
          kind={tab} all={all} shown={shown.length} view={view} onView={setView} q={q} onQ={setQ} unread={unread} add={add} addLabel={addLabel} />
        {section === "chat" ? (
          <div className="room-body is-chat">
            <div className="room-chatpane">
              <RoomChat room={room} t={chat} actions={actions} preview={preview} onDetails={() => setDetails((d) => !d)} />
              {details && <RoomDetails room={room} t={chat} actions={actions} onClose={() => setDetails(false)} />}
            </div>
          </div>
        ) : (
          <div className={`room-body is-${view}`}>
            <List key={tab} room={room} kind={tab} threads={shown} subject={current?.subject ?? null} onOpen={open} unread={unread} actions={live} filtered={filtered} />
          </div>
        )}
      </div>
      {drawer && ( // outside .room: its container queries would otherwise pin a fixed panel inside it
        <>
          <div className="scrim is-light" onClick={close} aria-hidden />
          <aside className="side-panel room-drawer" role="dialog" aria-modal="true" aria-label={`${drawer.key} ${drawer.title}`}>
            <RoomChat room={room} t={drawer} actions={actions} preview={preview} onClose={close} onDetails={showDetails} />
            {details && <RoomDetails room={room} t={drawer} actions={actions} onClose={() => setDetails(false)} />}
          </aside>
        </>
      )}
      {modal === "invite" && actions.people && <RoomInvite room={room} people={actions.people()} onClose={() => setModal(null)} />}
      {modal === "guide" && <RoomGuide room={room} onClose={() => setModal(null)} />}
    </>
  );
}
