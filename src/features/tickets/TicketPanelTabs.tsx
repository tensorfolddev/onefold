"use client";

import { useRef, useState } from "react";
import { AtSign, Bold, ChevronRight, Clock, FileText, History, Italic, LayoutList, Link2, List, MessageSquare } from "lucide-react";
import { addComment } from "@/data/commands";
import { reachable } from "@/domain/commands/notify";
import { useDb } from "@/data/StoreProvider";
import { useAppState } from "@/features/shell/state";
import { relativeTime } from "@/domain/status";
import type { Ticket } from "@/domain/types";
import { RichText } from "@/features/docs/RichText";
import { Avatar, EmptyState, IconButton, Tabs } from "@/ui/primitives";
import { TemplateSections } from "./TemplateSections";

export const OVERVIEW = "Overview";

/** The panel's tabs: Overview (the template), Updates, Activity. The panel owns which one is open. */
export function TicketPanelTabs({ ticket, editable, tab, onTab }: {
  ticket: Ticket; editable: boolean; tab: string; onTab: (tab: string) => void;
}) {
  const { db, me, act, personById, productByKey } = useDb();
  const { activity } = useAppState();
  // Whom an update can @mention: whoever can see this ticket (not you).
  const mentionable = reachable(db, me, productByKey(ticket.productKey)).map((p) => ({ id: p.id, name: p.name, role: p.role }));

  const updates = db.comments
    .filter((c) => c.ticketKey === ticket.key)
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
  const log = activity.filter((a) => a.ticketKey === ticket.key).sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="ticket-tabs">
      <Tabs
        ariaLabel="Ticket views" active={tab} onSelect={onTab}
        items={[
          { label: OVERVIEW, icon: <LayoutList aria-hidden /> },
          { label: "Updates", count: updates.length, icon: <MessageSquare aria-hidden /> },
          { label: "Activity", count: log.length, icon: <History aria-hidden /> },
        ]}
      />
      <div className="ticket-tab-panel" role="tabpanel" aria-label={tab}>
        {tab === OVERVIEW && <TemplateSections ticket={ticket} editable={editable} />}
        {tab === "Updates" && (
          <>
            <Composer
              people={mentionable}
              onPost={(body) =>
                act((d, m) => addComment(d, m, ticket.key, body))
              }
            />
            {updates.length === 0 ? (
              <EmptyState icon={<MessageSquare aria-hidden />} title="No updates yet">
                Share progress, mention a teammate with @ (or @@ when it&apos;s urgent), or ask a question.
              </EmptyState>
            ) : (
              <ul className="update-list">
                {updates.map((c) => (
                  <li key={c.id} className="update-card">
                    <header>
                      <Avatar personId={c.authorId} size="lg" />
                      <span className="update-author">{personById(c.authorId)?.name}</span>
                      <span className="spacer" />
                      <span className="update-time"><Clock aria-hidden /> {relativeTime(c.at)}</span>
                    </header>
                    <p className="update-body"><RichText text={c.body} /></p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {tab === "Activity" && (
          log.length === 0 ? (
            <EmptyState icon={<History aria-hidden />} title="No activity yet" />
          ) : (
            <ul className="activity-log">
              {log.map((a) => (
                <li key={a.id} className="activity-row">
                  <span className="activity-when"><Clock aria-hidden /> {relativeTime(a.at)}</span>
                  <Avatar personId={a.actorId} size="sm" />
                  <span className="activity-field">{a.field}</span>
                  <span className="activity-change">
                    {a.from && <><span className="activity-from">{a.from}</span><ChevronRight aria-label="changed to" /></>}
                    <span className="activity-to">{a.to}</span>
                  </span>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}

const SHOWN_PEOPLE = 6;
/** The "@name" (or "@@name") being typed right before the caret, if any. */
const typingMention = (before: string) => {
  const m = /(?:^|\s)(@@?)([^\s@][^@\n]{0,30}|)$/.exec(before);
  return m && !/\s{2}$/.test(m[2]) ? { urgent: m[1] === "@@", q: m[2], at: before.length - m[1].length - m[2].length } : null;
};

/** monday-style composer: focus reveals a formatting toolbar; buttons insert markdown-ish tokens. @ (or @@ for urgent)
 * lists the people who can see the ticket; a pick goes in as "@Full Name", which is what tells them. */
function Composer({ onPost, people }: { onPost: (body: string) => void; people: { id: string; name: string; role?: string }[] }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mention, setMention] = useState<{ urgent: boolean; q: string; at: number } | null>(null);
  const [pick, setPick] = useState(0);
  const matches = mention ? people.filter((p) => p.name.toLowerCase().includes(mention.q.toLowerCase())).slice(0, SHOWN_PEOPLE) : [];
  const watch = (value: string, caret: number) => { setMention(typingMention(value.slice(0, caret))); setPick(0); };
  const insertPerson = (p: { name: string }) => {
    const el = ref.current;
    if (!el || !mention) return;
    const caret = el.selectionStart ?? text.length;
    const token = `${mention.urgent ? "@@" : "@"}${p.name} `;
    setText(text.slice(0, mention.at) + token + text.slice(caret));
    setMention(null);
    const at = mention.at + token.length;
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(at, at); });
  };

  const wrap = (before: string, after = "") => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    setText(text.slice(0, s) + before + text.slice(s, e) + after + text.slice(e));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, e + before.length);
    });
  };
  const post = () => {
    if (!text.trim()) return;
    onPost(text.trim());
    setText("");
  };
  // Link a doc: from the toolbar, or by typing "[[" — a small list of pages; the pick goes in as [Title](doc:<id>).
  const [picking, setPicking] = useState(false);
  const insertDoc = (doc: { id: string; title: string }) => {
    const el = ref.current;
    const at = el?.selectionStart ?? text.length;
    const before = text.slice(0, at).replace(/\[\[$/, "");
    const link = `[${doc.title.replace(/[[\]]/g, "")}](doc:${doc.id}) `;
    setText(before + link + text.slice(at));
    setPicking(false);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length + link.length, before.length + link.length); });
  };

  return (
    <div className="composer">
      <div className="composer-toolbar" role="toolbar" aria-label="Formatting">
        <IconButton label="Bold" onClick={() => wrap("**", "**")}><Bold /></IconButton>
        <IconButton label="Italic" onClick={() => wrap("_", "_")}><Italic /></IconButton>
        <IconButton label="Bulleted list" onClick={() => wrap("\n- ")}><List /></IconButton>
        <IconButton label="Link" onClick={() => wrap("[", "](https://)")}><Link2 /></IconButton>
        <IconButton label="Mention someone" onClick={() => wrap("@")}><AtSign /></IconButton>
        <IconButton label="Link a doc" active={picking} onClick={() => setPicking((p) => !p)}><FileText /></IconButton>
      </div>
      {picking && <DocPicker onPick={insertDoc} onClose={() => setPicking(false)} />}
      <textarea
        ref={ref} rows={3} value={text} aria-label="Write an update"
        placeholder="Write an update and mention others with @"
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value.slice(0, e.target.selectionStart ?? 0).endsWith("[[")) setPicking(true);
          watch(e.target.value, e.target.selectionStart ?? 0);
        }}
        onClick={(e) => watch(e.currentTarget.value, e.currentTarget.selectionStart ?? 0)}
        onBlur={() => setTimeout(() => setMention(null), 150)}
        onKeyDown={(e) => {
          if (matches.length) {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setPick((i) => (i + (e.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length); return; }
            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertPerson(matches[pick]); return; }
            if (e.key === "Escape") { e.preventDefault(); setMention(null); return; }
          }
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") post();
        }}
      />
      {matches.length > 0 && (
        <div className="composer-mentions" role="listbox" aria-label={mention?.urgent ? "Mention urgently" : "Mention someone"}>
          {mention?.urgent && <p className="composer-mentions-hint">🚨 Urgent — a louder alert for them</p>}
          {matches.map((p, i) => (
            <button key={p.id} type="button" role="option" aria-selected={i === pick} className="menu-item" onMouseDown={(e) => e.preventDefault()} onClick={() => insertPerson(p)}>
              <Avatar personId={p.id} size="sm" /> <span className="composer-mentions-name">{p.name}</span><span className="menu-item-end">{p.role}</span>
            </button>
          ))}
        </div>
      )}
      <div className="composer-footer">
        <span className="muted">⌘ + Enter to post · @ to mention · @@ when it&apos;s urgent</span>
        <span className="spacer" />
        <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={post}>Update</button>
      </div>
    </div>
  );
}

/** The docs you can link from an update: this ticket's project's first, then the company's, then the rest. */
function DocPicker({ onPick, onClose }: { onPick: (doc: { id: string; title: string }) => void; onClose: () => void }) {
  const { db, href } = useDb();
  const [q, setQ] = useState("");
  const docs = db.docs.filter((d) => !d.archivedAt && d.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  return (
    <div className="composer-picker" role="dialog" aria-label="Link a doc">
      <input autoFocus className="composer-picker-search" placeholder="Search docs to link…" aria-label="Search docs" value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); if (e.key === "Enter" && docs[0]) { e.preventDefault(); onPick(docs[0]); } }} />
      {docs.length ? docs.map((d) => (
        <button key={d.id} type="button" className="menu-item" onClick={() => onPick(d)}>
          <span aria-hidden>{d.icon ?? <FileText />}</span> {d.title}
          <span className="menu-item-end">{d.productKey ? db.products.find((p) => p.key === d.productKey)?.name ?? d.productKey : "Company"}</span>
        </button>
      )) : <p className="sidebar-empty">No doc matches{q ? ` “${q}”` : ""} — <a href={href("/docs")}>open Docs</a></p>}
    </div>
  );
}
