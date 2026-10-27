"use client";

import { usePathname } from "next/navigation";
import { useMe } from "@/data/StoreProvider";
import { isOpenTicket } from "@/domain/selectors/product";
import { needsMe, teamRoom } from "@/domain/selectors/room";
import type { Product } from "@/domain/types";
import { Tabs, type TabItem } from "@/ui/primitives";

export function ProductTabs({ product }: { product: Product }) {
  const pathname = usePathname();
  const { db, me, href } = useMe();
  const base = href(`/products/${product.key}`);
  const openCount = db.tickets.filter((t) => t.productKey === product.key && isOpenTicket(db, t)).length;
  // The Client tab: on a client's project with Client Space on, its chats; otherwise the team's requirements.
  const room = teamRoom(db, me, product.key);
  const waiting = room ? room.threads.filter((t) => needsMe(room, t)).length : 0;
  const clientTab = !!db.org.clientSpace && product.type === "client";

  const items: TabItem[] = [
    { label: "Overview", href: base },
    { label: "Tickets", href: `${base}/tickets`, count: openCount }, // second: it's where most of the work is
    { label: clientTab ? "Client" : "Requirements", href: `${base}/requirements`, count: waiting || undefined },
    { label: "Docs", href: `${base}/docs` },
    { label: "Decisions", href: `${base}/decisions` },
    { label: "Roadmap", href: `${base}/roadmap` },
    { label: "Members", href: `${base}/members` },
  ]; // Settings is a button at the top right of the header (ProductHeader)
  const active = items.find((t) => t.href !== base && pathname.startsWith(t.href!))?.label ?? "Overview";

  return <Tabs items={items} active={active} ariaLabel={`${product.name} sections`} />;
}
