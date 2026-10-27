"use client";

// A ticket update's text as Markdown (ui/Markdown), with the app's links alive: @mentions highlighted (@@ urgent),
// [Title](doc:<id>) as a chip that opens the doc, [EN-12](ticket:EN-12) as a chip that opens the ticket, and
// ordinary [links](https://…) and bare URLs.
import Link from "next/link";
import { FileText } from "lucide-react";
import { useDb } from "@/data/StoreProvider";
import { useAppState } from "@/features/shell/state";
import { TypeIcon } from "@/features/tickets/TicketBits";
import { Markdown, withMentions } from "@/ui/Markdown";
import { safeHref } from "./editor/links";
import { docPath } from "./tree";


export function RichText({ text }: { text: string }) {
  const { db, href } = useDb();
  const { openTicket } = useAppState();
  const link = (label: string, target: string, key: string) => {
    const [kind, ...rest] = target.split(":");
    const id = rest.join(":");
    if (kind === "doc") {
      const doc = db.docs.find((d) => d.id === id && !d.archivedAt);
      if (!doc) return <span key={key} className="doc-chip is-missing">{label}</span>;
      return <Link key={key} href={href(docPath(doc))} className="doc-chip is-doc"><span aria-hidden>{doc.icon ?? <FileText />}</span><span className="doc-chip-title">{doc.title}</span></Link>;
    }
    if (kind === "ticket") {
      const t = db.tickets.find((x) => x.key === id);
      if (!t) return <span key={key} className="doc-chip is-missing">{label}</span>;
      return <button key={key} type="button" className="doc-chip is-ticket" onClick={() => openTicket(t.key)}><TypeIcon type={t.type} /><span className="doc-chip-key">{t.key}</span><span className="doc-chip-title">{t.title}</span></button>;
    }
    const url = safeHref(target);
    return url ? <a key={key} href={url} target="_blank" rel="noopener noreferrer nofollow">{label}</a> : null;
  };
  return <Markdown text={text} link={link} plain={withMentions} />;
}
