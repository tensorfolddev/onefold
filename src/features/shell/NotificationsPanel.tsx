"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, BellOff, CheckCheck, CircleCheck, UserPlus, Users, X } from "lucide-react";
import { useMe } from "@/data/StoreProvider";
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
};

export function NotificationsPanel() {
  const { notificationsOpen, setNotificationsOpen, openTicket } = useAppState();
  const [tab, setTab] = useState("All");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { db, me, personById, href, toast } = useMe();
  const router = useRouter();
  // The list is live (new notices appear as they arrive). ponytail: "read" lives in this panel only; it resets on sign-in.
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const items = db.notifications.filter((n) => n.personId === me.id).map((n) => (readIds.has(n.id) ? { ...n, read: true } : n));

  useEffect(() => {
    if (!notificationsOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setNotificationsOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [notificationsOpen, setNotificationsOpen]);

  // A new mention while you're here pops up right away ("Ayla mentioned you in Design spec"); what was already there
  // when you signed in isn't news.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const mine = db.notifications.filter((n) => n.personId === me.id);
    if (!seen.current) { seen.current = new Set(mine.map((n) => n.id)); return; }
    for (const n of mine) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (n.kind === "mention") toast(`🔔 ${personById(n.actorId)?.name ?? "Someone"} ${n.text}`, undefined, "info");
    }
  }, [db.notifications, me.id, personById, toast]);

  if (!notificationsOpen) return null;

  const visible = items.filter(
    (n) => (tab === "All" || (tab === "Mentioned" ? n.kind === "mention" : n.kind === "assigned")) && (!unreadOnly || !n.read),
  );

  const open = (n: Notification) => {
    setReadIds((prev) => new Set(prev).add(n.id));
    if (/^[A-Z]+-\d+$/.test(n.target)) {
      setNotificationsOpen(false);
      openTicket(n.target);
    } else if (n.target.startsWith("/")) { // a page, e.g. "/people" when someone joins
      setNotificationsOpen(false);
      router.push(href(n.target));
    }
  };

  return (
    <>
      <div className="scrim is-light" onClick={() => setNotificationsOpen(false)} />
      <section className="slide-over" role="dialog" aria-modal="true" aria-label="Notifications">
        <div className="panel-header" style={{ marginBottom: 16 }}>
          <h2 className="panel-title">Notifications</h2>
          <span className="spacer" />
          <IconButton label="Mark all as read" onClick={() => setReadIds(new Set(items.map((x) => x.id)))}>
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
              <li key={n.id}>
                <button type="button" className="notification-row" data-unread={!n.read} onClick={() => open(n)}>
                  <Avatar personId={n.actorId} />
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <strong style={{ fontWeight: 500 }}>{personById(n.actorId)?.name}</strong> {n.text}
                    <span className="notification-meta">
                      {KIND_ICON[n.kind]} {relativeTime(n.at)}
                    </span>
                  </span>
                  {!n.read && <span className="unread-dot" aria-label="Unread" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
