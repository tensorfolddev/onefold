"use client";

import { useRef, useState } from "react";
import { AtSign, Bold, ChevronRight, Clock, History, Italic, LayoutList, Link2, List, MessageSquare } from "lucide-react";
import { addComment } from "@/domain/commands";
import { useDb } from "@/data/StoreProvider";
import { useAppState } from "@/features/shell/state";
import { relativeTime } from "@/domain/status";
import type { Ticket } from "@/domain/types";
import { Avatar, EmptyState, IconButton, Tabs, WithMentions } from "@/ui/primitives";
import { TemplateSections } from "./TemplateSections";

export const OVERVIEW = "Overview";

/** The panel's tabs: Overview (the template), Updates, Activity. The panel owns which one is open. */
export function TicketPanelTabs({ ticket, editable, tab, onTab }: {
  ticket: Ticket; editable: boolean; tab: string; onTab: (tab: string) => void;
}) {
  const { db, act, personById } = useDb();
  const { activity } = useAppState();

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
              onPost={(body) =>
                act((d, m) => addComment(d, m, ticket.key, body))
              }
            />
            {updates.length === 0 ? (
              <EmptyState icon={<MessageSquare aria-hidden />} title="No updates yet">
                Share progress, mention a teammate with @, or ask a question.
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
                    <p className="update-body"><WithMentions text={c.body} /></p>
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

/** monday-style composer: focus reveals a formatting toolbar; buttons insert markdown-ish tokens. */
function Composer({ onPost }: { onPost: (body: string) => void }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className="composer">
      <div className="composer-toolbar" role="toolbar" aria-label="Formatting">
        <IconButton label="Bold" onClick={() => wrap("**", "**")}><Bold /></IconButton>
        <IconButton label="Italic" onClick={() => wrap("_", "_")}><Italic /></IconButton>
        <IconButton label="Bulleted list" onClick={() => wrap("\n- ")}><List /></IconButton>
        <IconButton label="Link" onClick={() => wrap("[", "](https://)")}><Link2 /></IconButton>
        <IconButton label="Mention someone" onClick={() => wrap("@")}><AtSign /></IconButton>
      </div>
      <textarea
        ref={ref} rows={3} value={text} aria-label="Write an update"
        placeholder="Write an update and mention others with @"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === "Enter" && post()}
      />
      <div className="composer-footer">
        <span className="muted">⌘ + Enter to post</span>
        <span className="spacer" />
        <button type="button" className="btn btn-primary" disabled={!text.trim()} onClick={post}>Update</button>
      </div>
    </div>
  );
}
