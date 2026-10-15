"use client";

// The fixed ticket / epic template: section cards in the main column, an outline (progress + jump list) in the
// sidebar. Every section has a stable id and a link (/t/AP-12#acceptance_criteria) — the address an MCP server
// or a Claude skill uses.
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeftRight, BadgeCheck, Ban, BookOpen, Bug, Check, CircleSlash, Code2, FlaskConical, GitBranch, Image as ImageIcon, Layers,
  Link2, ListChecks, ListOrdered, LockKeyhole, Monitor, Rocket, ShieldAlert, Sparkles, Target, TrendingUp, CircleCheckBig,
  type LucideIcon,
} from "lucide-react";
import { useAppState } from "@/features/shell/state";
import { setSection } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import {
  isFilled, itemsOf, sectionRef, TEMPLATE_NAME, TEMPLATE_VERSION, TEMPLATES, textOf, ticketToMarkdown, type SectionDef,
} from "@/domain/templates";
import type { Ticket } from "@/domain/types";
import { IconButton } from "@/ui/primitives";
import { DoneSection, ItemsSection } from "./TemplateItems";
import { DependenciesSection, EpicTicketsSection, useIsDone } from "./TemplateRelations";
import { ImagesSection } from "./TemplateImages";

const linkTo = (key: string, sectionId: string) => `${location.origin}/t/${key}#${sectionId}`;

/** One icon per section, so the template reads at a glance. */
const SECTION_ICON: Record<string, LucideIcon> = {
  goal: Target, context: BookOpen, acceptance_criteria: ListChecks, out_of_scope: CircleSlash, technical_notes: Code2,
  dependencies: GitBranch, images: ImageIcon, test_plan: FlaskConical, definition_of_done: BadgeCheck,
  summary: Bug, steps_to_reproduce: ListOrdered, expected_vs_actual: ArrowLeftRight, environment: Monitor,
  success_metrics: TrendingUp, in_scope: CircleCheckBig, tickets: Layers, risks: ShieldAlert, release_plan: Rocket,
};

function useTemplate(ticket: Ticket) {
  const { db } = useDb();
  const defs = TEMPLATES[ticket.type];
  const children = ticket.type === "epic" ? db.tickets.filter((t) => t.epicKey === ticket.key).length : 0;
  const filled = (d: SectionDef) => isFilled(d, ticket, children);
  return { defs, filled, missing: defs.filter((d) => d.required && !filled(d)), done: defs.filter(filled).length };
}

export const scrollToSection = (id: string) => document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** Main column: the sections, in template order. */
export function TemplateSections({ ticket, editable }: { ticket: Ticket; editable: boolean }) {
  const { db } = useDb();
  const isDone = useIsDone();
  const { defs, filled } = useTemplate(ticket);
  const blockers = (ticket.dependsOn ?? []).map((k) => db.tickets.find((t) => t.key === k)).filter((t): t is Ticket => !!t && !isDone(t));

  // Opened from a section link (/t/AP-12#test_plan): jump to that section once.
  const { openSection } = useAppState();
  useEffect(() => {
    const el = openSection && document.getElementById(`sec-${openSection}`);
    if (!el) return;
    el.scrollIntoView({ block: "start" });
    el.classList.add("is-target");
    const t = setTimeout(() => el.classList.remove("is-target"), 2400);
    return () => clearTimeout(t);
  }, [openSection, ticket.key]);

  return (
    <section className="tpl" aria-label={`${TEMPLATE_NAME[ticket.type]} template`}>
      {blockers.length > 0 && (
        <p className="tpl-blocked" role="status">
          <Ban aria-hidden />
          <span><strong>Blocked by {blockers.map((b) => b.key).join(", ")}</strong> — finish {blockers.length === 1 ? "it" : "them"} first.</span>
          <button type="button" className="btn btn-tertiary" onClick={() => scrollToSection("dependencies")}>See dependencies</button>
        </p>
      )}
      {defs.map((d) => (
        <SectionBlock key={d.id} def={d} ticket={ticket} filled={filled(d)}>
          <SectionBody def={d} ticket={ticket} editable={editable} />
        </SectionBlock>
      ))}
    </section>
  );
}

/** Sidebar card: template, progress, and every section as a jump link with its state. */
export function TemplateOutline({ ticket, onGo }: { ticket: Ticket; onGo: (sectionId: string) => void }) {
  const { defs, filled, missing, done } = useTemplate(ticket);
  return (
    <section className="tp-card tpl-outline" aria-labelledby="tpl-outline-title">
      <header className="tp-card-head">
        <h3 id="tpl-outline-title">Template</h3>
        <span className="tpl-badge" title="Every ticket in 1Fold uses this template. Nobody can change it.">
          <LockKeyhole aria-hidden /> {TEMPLATE_NAME[ticket.type]} · v{TEMPLATE_VERSION}
        </span>
      </header>
      <div className="tpl-progress-row">
        <span className="tpl-progress-bar" aria-hidden><span style={{ width: `${(done / defs.length) * 100}%` }} /></span>
        <span className="tpl-progress-num">{done}/{defs.length}</span>
      </div>
      <p className="tpl-progress-text" data-ok={!missing.length || undefined}>
        {missing.length ? <>{missing.length} required {missing.length === 1 ? "section is" : "sections are"} empty</> : <><Check aria-hidden /> All required sections filled</>}
      </p>
      <ol className="tpl-outline-list">
        {defs.map((d) => {
          const Icon = SECTION_ICON[d.id] ?? ListChecks;
          const state = filled(d) ? "filled" : d.required ? "missing" : "empty";
          return (
            <li key={d.id}>
              <button type="button" className="tpl-outline-item" data-state={state} onClick={() => onGo(d.id)}>
                <Icon className="tpl-outline-icon" aria-hidden />
                <span className="tpl-outline-name">{d.title}</span>
                {state === "filled" ? <Check className="tpl-outline-state" aria-label="Filled" />
                  : state === "missing" ? <span className="tpl-outline-req">Required</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
      <CopyForClaude ticket={ticket} />
    </section>
  );
}

function SectionBlock({ def, ticket, filled, children }: {
  def: SectionDef; ticket: Ticket; filled: boolean; children: React.ReactNode;
}) {
  const { toast } = useDb();
  const Icon = SECTION_ICON[def.id] ?? ListChecks;
  const items = itemsOf(ticket.sections?.[def.id]);
  const ticked = items.filter((i) => i.done).length;
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(linkTo(ticket.key, def.id)); toast(`Link to ${sectionRef(ticket.key, def.id)} copied`); }
    catch { toast("Couldn't copy the link"); }
  };
  return (
    <section id={`sec-${def.id}`} className="tpl-sec" data-kind={def.kind} data-filled={filled || undefined} aria-labelledby={`sec-${def.id}-title`}>
      <header className="tpl-sec-head">
        <span className="tpl-icon" aria-hidden><Icon /></span>
        <h3 id={`sec-${def.id}-title`}>{def.title}</h3>
        {def.required && <span className="tpl-req" data-ok={filled || undefined}>{filled && <Check aria-label="Filled" />}Required</span>}
        <span className="spacer" />
        {def.kind === "checklist" && items.length > 0 && (
          <span className="tpl-count" aria-label={`${ticked} of ${items.length} done`}>
            <span className="tpl-count-bar" aria-hidden><span style={{ width: `${(ticked / items.length) * 100}%` }} /></span>
            {ticked}/{items.length}
          </span>
        )}
        <span className="tpl-sec-tools">
          <span className="tpl-sec-ref" aria-hidden>#{def.id}</span>
          <IconButton label={`Copy link to ${def.title}`} onClick={copyLink}><Link2 /></IconButton>
        </span>
      </header>
      <div className="tpl-sec-body">{children}</div>
    </section>
  );
}

function SectionBody({ def, ticket, editable }: { def: SectionDef; ticket: Ticket; editable: boolean }) {
  switch (def.kind) {
    case "text": return <TextSection key={ticket.key} def={def} ticket={ticket} editable={editable} />;
    case "list": case "steps": case "checklist": return <ItemsSection def={def} ticket={ticket} editable={editable} />;
    case "done": return <DoneSection def={def} ticket={ticket} editable={editable} />;
    case "dependencies": return <DependenciesSection ticket={ticket} editable={editable} />;
    case "epic_tickets": return <EpicTicketsSection epic={ticket} editable={editable} />;
    case "images": return <ImagesSection def={def} ticket={ticket} editable={editable} />;
  }
}

/** Plain text with clickable links. */
function Linkified({ text }: { text: string }) {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, i) =>
    i % 2 ? <a key={i} href={part} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()}>{part}</a> : part);
}

/** Click to write; leaving the box saves, Esc cancels. */
function TextSection({ def, ticket, editable }: { def: SectionDef; ticket: Ticket; editable: boolean }) {
  const { act } = useDb();
  const value = textOf(ticket.sections?.[def.id]);
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  if (!editable) return value ? <p className="tpl-text"><Linkified text={value} /></p> : <p className="tpl-empty">Not filled in</p>;
  if (draft === null) {
    return value ? (
      <div className="tpl-text is-editable" role="button" tabIndex={0} aria-label={`Edit ${def.title}`}
        onClick={() => setDraft(value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDraft(value); } }}>
        <Linkified text={value} />
      </div>
    ) : (
      <button type="button" className="tpl-placeholder" onClick={() => setDraft("")}>{def.hint}</button>
    );
  }
  const save = () => {
    if (cancelled.current) { cancelled.current = false; return; }
    if (draft.trim() !== value) act((d, m) => setSection(d, m, ticket.key, def.id, draft));
    setDraft(null);
  };
  return (
    <div className="tpl-text-edit">
      <textarea
        autoFocus className="textarea tpl-textarea" aria-label={def.title} placeholder={def.hint} value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.stopPropagation(); cancelled.current = true; setDraft(null); }
          else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.blur();
        }}
      />
      <span className="tpl-keys">Saves when you click away · ⌘↵ save · Esc cancel</span>
    </div>
  );
}

/** The whole ticket as Markdown with `## Section {#id}` headings — paste it into Claude, a doc, or a PR. */
function CopyForClaude({ ticket }: { ticket: Ticket }) {
  const { db, statusById, personById, toast } = useDb();
  const isDone = useIsDone();
  const copy = async () => {
    const md = ticketToMarkdown(ticket, {
      tickets: db.tickets, isDone, statusName: (id) => statusById(id)?.name ?? "", personName: (id) => personById(id)?.name,
    });
    try { await navigator.clipboard.writeText(md); toast(`${ticket.key} copied as Markdown`); }
    catch { toast("Couldn't copy"); }
  };
  return (
    <button type="button" className="btn btn-secondary tpl-copy" onClick={copy} title="The whole ticket as Markdown, one heading per section — for Claude, a doc or a PR">
      <Sparkles aria-hidden /> Copy for Claude
    </button>
  );
}
