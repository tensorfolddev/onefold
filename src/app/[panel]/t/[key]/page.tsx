"use client";

// Stable ticket links: /t/AP-12#acceptance_criteria works for anyone (proxy.ts moves it into their own panel),
// opens the ticket on its product's board and scrolls to the section. The address an MCP server or skill prints.
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppState } from "@/features/shell/state";
import { useDb } from "@/data/StoreProvider";

const TICKET_KEY = /^[A-Z][A-Z0-9]*-\d+$/;

export default function TicketLinkPage() {
  const { key: raw } = useParams<{ key: string }>();
  const key = decodeURIComponent(raw).toUpperCase();
  const router = useRouter();
  const { me, href } = useDb();
  const { openTicket } = useAppState();
  const valid = TICKET_KEY.test(key);

  useEffect(() => {
    if (!me || !valid) return;
    openTicket(key, location.hash.slice(1) || undefined);
    router.replace(href(`/products/${key.split("-")[0]}/tickets`));
  }, [me, valid, key, href, openTicket, router]);

  return <div className="page"><p className="muted">{valid ? `Opening ${key}…` : `“${key}” isn't a ticket link.`}</p></div>;
}
