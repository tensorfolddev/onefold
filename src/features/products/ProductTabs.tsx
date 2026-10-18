"use client";

import { usePathname } from "next/navigation";
import { useMe } from "@/data/StoreProvider";
import { isOpenTicket } from "@/domain/selectors/product";
import type { Product } from "@/domain/types";
import { Tabs, type TabItem } from "@/ui/primitives";

export function ProductTabs({ product }: { product: Product }) {
  const pathname = usePathname();
  const { db, href, panel } = useMe();
  const base = href(`/products/${product.key}`);
  const openCount = db.tickets.filter((t) => t.productKey === product.key && isOpenTicket(db, t)).length;

  const tickets: TabItem = { label: "Tickets", href: `${base}/tickets`, count: openCount };
  const items: TabItem[] = panel === "developer" ? [tickets] : [
    { label: "Overview", href: base },
    { label: "Docs", href: `${base}/docs` },
    { label: "Decisions", href: `${base}/decisions` },
    { label: "Roadmap", href: `${base}/roadmap` },
    tickets,
    { label: "Members", href: `${base}/members` },
  ]; // Settings is a button at the top right of the header (ProductHeader)
  const active = items.find((t) => t.href !== base && pathname.startsWith(t.href!))?.label ?? "Overview";

  return <Tabs items={items} active={active} ariaLabel={`${product.name} sections`} />;
}
