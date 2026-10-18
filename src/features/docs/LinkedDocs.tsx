"use client";

// The ticket panel's "Mentioned in docs": the docs (you can see) that link to this ticket.
import Link from "next/link";
import { useEffect, useState } from "react";
import { useDb } from "@/data/StoreProvider";
import { docsLinkingTicket, type DocLink } from "./api";
import { docPath } from "./tree";

export function LinkedDocs({ ticketKey, onNavigate }: { ticketKey: string; onNavigate?: () => void }) {
  const { href } = useDb();
  const [docs, setDocs] = useState<DocLink[]>([]);
  useEffect(() => {
    let alive = true;
    docsLinkingTicket(ticketKey).then((d) => alive && setDocs(d)).catch(() => {});
    return () => { alive = false; };
  }, [ticketKey]);
  if (!docs.length) return null;
  return (
    <section className="tp-card" aria-labelledby="tp-docs-title">
      <header className="tp-card-head"><h3 id="tp-docs-title">Mentioned in docs</h3></header>
      <ul className="linked-docs">
        {docs.map((d) => (
          <li key={d.id}>
            <Link href={href(docPath(d))} className="doc-chip is-doc" onClick={onNavigate}><span aria-hidden>{d.icon ?? "📄"}</span><span className="doc-chip-title">{d.title}</span></Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
