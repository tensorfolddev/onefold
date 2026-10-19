"use client";

// A ticket update's text with its links alive: @mentions highlighted, [Title](doc:<id>) as a chip that opens the doc,
// [EN-12](ticket:EN-12) as a chip that opens the ticket, and ordinary [links](https://…). Nothing else is rendered as
// markup — the rest stays plain text.
import Link from "next/link";
import { FileText } from "lucide-react";
import { useDb } from "@/data/StoreProvider";
import { useAppState } from "@/features/shell/state";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { safeHref } from "./editor/links";
import { docPath } from "./tree";

const TOKEN = /(\[[^\]\n]+\]\((?:doc|ticket):[^)\s]+\)|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|@@?[A-Z][\w]*(?: [A-Z][\w]*)?)/g;

export function RichText({ text }: { text: string }) {
  const { db, href } = useDb();
  const { openTicket } = useAppState();
  return (
    <>
      {text.split(TOKEN).map((part, i) => {
        if (part.startsWith("@@")) return <span key={i} className="mention is-urgent" title="Urgent mention">{part.slice(1)}</span>;
        if (part.startsWith("@")) return <span key={i} className="mention">{part}</span>;
        const m = /^\[([^\]\n]+)\]\(([a-z]+):(.+)\)$/.exec(part);
        if (!m) return part;
        const [, label, kind, target] = m;
        if (kind === "doc") {
          const doc = db.docs.find((d) => d.id === target && !d.archivedAt);
          if (!doc) return <span key={i} className="doc-chip is-missing">{label}</span>;
          return <Link key={i} href={href(docPath(doc))} className="doc-chip is-doc"><span aria-hidden>{doc.icon ?? <FileText />}</span><span className="doc-chip-title">{doc.title}</span></Link>;
        }
        if (kind === "ticket") {
          const t = db.tickets.find((x) => x.key === target);
          if (!t) return <span key={i} className="doc-chip is-missing">{label}</span>;
          return <button key={i} type="button" className="doc-chip is-ticket" onClick={() => openTicket(t.key)}><TypeIcon type={t.type} /><span className="doc-chip-key">{t.key}</span><span className="doc-chip-title">{t.title}</span></button>;
        }
        const url = safeHref(`${kind}:${target}`);
        return url ? <a key={i} href={url} target="_blank" rel="noopener noreferrer nofollow">{label}</a> : label;
      })}
    </>
  );
}
