"use client";

// A face on the team's screens for anyone: a teammate's avatar, or a client person's initials (ringed, so a client
// always reads as one — in the inbox, Settings → Clients and the chats' people).
import { useMe } from "@/data/StoreProvider";
import { Avatar } from "@/ui/primitives";

export function AnyAvatar({ id, size = "sm" }: { id: string; size?: "sm" | "md" }) {
  const { clientById } = useMe();
  const c = clientById(id);
  if (!c) return <Avatar personId={id} size={size} />;
  return <span className={`avatar ${size === "md" ? "" : size} is-client`} style={{ background: c.color }} title={`${c.name} (client)`} aria-label={c.name}>{c.initials}</span>;
}
