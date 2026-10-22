"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, BellOff, BellRing, CheckCheck, CircleCheck, MonitorOff, Share2, Trash2, UserPlus, Users, X } from "lucide-react";
import { deleteNotifications, markNotificationsRead } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import { playNotice } from "./noticeSounds";
import { alertDesktop, desktopOn, desktopSupported, setDesktop } from "./desktopAlerts";
import { useAppState } from "@/features/shell/state";
import { relativeTime } from "@/domain/status";
import { Avatar, EmptyState, IconButton, Tabs } from "@/ui/primitives";
import type { Notification } from "@/domain/types";

const KIND_ICON: Record<Notification["kind"], React.ReactNode> = {
  mention: <AtSign />,
  assigned: <UserPlus />,
  approval: <CircleCheck />,
  status: <CheckCheck />,
  invite: <Users />,
  shared: <Share2 />,
};

export function NotificationsPanel() {
  const { notificationsOpen, setNotificationsOpen, openTicket } = useAppState();
  const [tab, setTab] = useState("All");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { db, me, act, personById, href, toast } = useMe();
  const router = useRouter();
  const [desktop, setDesktopState] = useState(false);
  useEffect(() => setDesktopState(desktopOn()), []); // eslint-disable-line react-hooks/set-state-in-effect -- the browser's permission
  // The list is live (new notices appear as they arrive), newest first; read stays read.
  const items = db.notifications.filter((n) => n.personId === me.id).sort((a, b) => b.at.localeCompare(a.at));
  const markRead = (ids: string[] | "all") => act((d, m) => markNotificationsRead(d, m, ids));
  const remove = (id: string) => act((d, m) => deleteNotifications(d, m, [id]));

  const open = (n: Notification) => {
    if (!n.read) markRead([n.id]);
    if (/^[A-Z]+-\d+$/.test(n.target)) {
      setNotificationsOpen(false);
      openTicket(n.target);
    } else if (n.target.startsWith("/")) { // a page, e.g. "/people" when someone joins
      setNotificationsOpen(false);
      router.push(href(n.target));
    }
  };
  const openRef = useRef(open);
  useEffect(() => { openRef.current = open; });

  useEffect(() => {
    if (!notificationsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNotificationsOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [notificationsOpen, setNotificationsOpen]);

  // Something new for you while 1Fold is open: a chime (a louder one when it's urgent), a toast, and — if you're in
  // another tab or app — a desktop alert. What was already there when you signed in isn't news.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const mine = db.notifications.filter((n) => n.personId === me.id);
    if (!seen.current) { seen.current = new Set(mine.map((n) => n.id)); return; }
    for (const n of mine) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (n.read) continue;
      const who = personById(n.actorId)?.name ?? "Someone";
      playNotice(n.urgent ? "urgent" : "notify");
      toast(`${n.urgent ? "🚨 Urgent: " : "🔔 "}${who} ${n.text}`, undefined, n.urgent ? "error" : "info");
      alertDesktop(n.urgent ? `🚨 ${who} needs you` : `${who} · 1Fold`, n.text, n.id, () => openRef.current(n));
    }
  }, [db.notifications, me.id, personById, toast]);

  if (!notificationsOpen) return null;

  const visible = items.filter(
    (n) => (tab === "All" || (tab === "Mentioned" ? n.kind === "mention" : n.kind === "assigned")) && (!unreadOnly || !n.read),
  );


  return (
    <>
      <div className="scrim is-light" onClick={() => setNotificationsOpen(false)} />
      <section className="slide-over" role="dialog" aria-modal="true" aria-label="Notifications">
        <div className="panel-header" style={{ marginBottom: 16 }}>
          <h2 className="panel-title">Notifications</h2>
          <span className="spacer" />
          {desktopSupported() && (
            <IconButton label={desktop ? "Desktop alerts are on — turn off" : "Turn on desktop alerts"}
              onClick={async () => setDesktopState(await setDesktop(!desktop))}>{desktop ? <BellRing /> : <MonitorOff />}</IconButton>
          )}
          <IconButton label="Mark all as read" onClick={() => markRead("all")}>
            <CheckCheck />
          </IconButton>
          <IconButton label="Close" onClick={() => setNotificationsOpen(false)}><X /></IconButton>
        </div>
        <Tabs ariaLabel="Notification filter" items={[{ label: "All" }, { label: "Mentioned" }, { label: "Assigned to me" }]} active={tab} onSelect={setTab} />
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, padding: "12px 0", fontSize: 14 }}>
          <button type="button" role="switch" aria-checked={unreadOnly} aria-label="Unread only" className="switch" onClick={() => setUnreadOnly((u) => !u)} />
          Unread only
        </div>
        {visible.length === 0 ? (
          <EmptyState icon={<BellOff />} title="No notifications to show">
            You&apos;ll get notified here whenever someone @mentions you or assigns you work.
          </EmptyState>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {visible.map((n) => (
              <li key={n.id} className="notification-item">
                <button type="button" className="notification-row" data-unread={!n.read} onClick={() => open(n)}>
                  <Avatar personId={n.actorId} />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    {n.urgent && <span className="notification-urgent">Urgent</span>}
                    <strong style={{ fontWeight: 500 }}>{personById(n.actorId)?.name}</strong> {n.text}
                    <span className="notification-meta">
                      {KIND_ICON[n.kind]} {relativeTime(n.at)}
                    </span>
                  </span>
                  {!n.read && <span className="unread-dot" aria-label="Unread" />}
                </button>
                <IconButton label="Delete notification" className="btn btn-tertiary btn-icon notification-delete" onClick={() => remove(n.id)}>
                  <Trash2 />
                </IconButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
