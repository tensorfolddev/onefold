"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, ChevronRight, Ellipsis, X } from "lucide-react";
import { useAppState } from "@/features/shell/state";
import { archiveTickets, restoreTickets } from "@/data/commands";
import type { Product, Ticket, TicketType } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { StatusCell } from "@/ui/StatusCell";
import { IconButton, ProductTile, StatusPill } from "@/ui/primitives";
import { Assignees, DueDate, EpicChip, PrBadge, PriorityCell, requirementById, TYPE_LABEL, TypeIcon } from "./TicketBits";
import {
  AssigneeField, DueField, EpicField, EstimateField, PriorityField, RequirementField, TitleField, TypeField,
} from "./TicketFields";
import { scrollToSection, TemplateOutline } from "./TemplateSections";
import { OVERVIEW, TicketPanelTabs } from "./TicketPanelTabs";
import { useDb } from "@/data/StoreProvider";
import { formatHours, shortDate } from "@/domain/status";
import { LinkedDocs } from "@/features/docs/LinkedDocs";

// The header says what the ticket is the way people say it: a task is a feature.
const CRUMB_TYPE: Record<TicketType, string> = { task: "Feature", bug: "Bug", epic: "Epic" };

/** Global ticket panel (mounted once by AppShell; opened via openTicket(key)). */
export function TicketPanelHost() {
  const { openTicketKey, openTicket, tickets } = useAppState();
  const { productByKey, can, archivedTickets } = useDb();
  // An archived ticket still opens (from Settings → Archived, or a link): read-only, with a way back.
  const ticket = tickets.find((t) => t.key === openTicketKey) ?? archivedTickets.find((t) => t.key === openTicketKey);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openTicketKey) return;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      // An open menu or confirm dialog inside the panel handles its own Escape first.
      if (e.key === "Escape" && !panelRef.current?.querySelector(".menu, dialog")) openTicket(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [openTicketKey, openTicket]);

  const product = ticket && productByKey(ticket.productKey);
  if (!ticket || !product) return null;
  const close = () => openTicket(null);

  return (
    <>
      <div className="scrim is-light" onClick={close} aria-hidden />
      <aside
        ref={panelRef} className="side-panel ticket-panel" role="dialog" aria-modal="true"
        aria-labelledby="ticket-panel-title" tabIndex={-1}
      >
        {/* keyed: another ticket opens on its Overview, scrolled to the top */}
        <TicketView key={ticket.key} ticket={ticket} product={product} editable={can("ticket.edit", { product }) && !ticket.archivedAt} onClose={close} />
      </aside>
    </>
  );
}

/** monday-style item view: header, tabs + content on the left, Details and the template outline on the right. */
function TicketView({ ticket, product, editable, onClose }: PanelProps & { onClose: () => void }) {
  const [tab, setTab] = useState(OVERVIEW);
  const go = (sectionId: string) => {
    setTab(OVERVIEW);
    requestAnimationFrame(() => scrollToSection(sectionId)); // after the Overview has rendered
  };
  return (
    <>
      <PanelHeader ticket={ticket} product={product} editable={editable} onClose={onClose} />
      <div className="tp-body">
        <div className="tp-main">
          <TicketPanelTabs ticket={ticket} editable={editable} tab={tab} onTab={setTab} />
        </div>
        <div className="tp-side" aria-label="Details">
          <section className="tp-card" aria-labelledby="tp-details-title">
            <header className="tp-card-head"><h3 id="tp-details-title">Details</h3></header>
            <MetaGrid ticket={ticket} product={product} editable={editable} onNavigate={onClose} />
          </section>
          <TemplateOutline ticket={ticket} onGo={go} />
          <LinkedDocs ticketKey={ticket.key} onNavigate={onClose} />
        </div>
      </div>
    </>
  );
}

type PanelProps = { ticket: Ticket; product: Product; editable: boolean };

function PanelHeader({ ticket, product, editable, onClose }: PanelProps & { onClose: () => void }) {
  const { href, can, act, personById } = useDb();
  const { openTicket } = useAppState();
  // Tickets are archived, never deleted from here: an admin deletes for good from product Settings → Archived.
  const canArchive = can("ticket.archive", { product });
  const archive = () => {
    const key = ticket.key;
    const what = ticket.type === "epic" ? `${key} and its tickets archived` : `${key} archived`;
    if (act((d, m) => archiveTickets(d, m, [key]), { success: `${what} — they're in Settings → Archived`, undoable: true })) onClose();
  };
  const restore = () => act((d, m) => restoreTickets(d, m, [ticket.key]), { success: `${ticket.key} restored`, undoable: true });

  return (
    <header className="ticket-panel-header tp-head">
      <div className="tp-head-bar">
        <nav className="ticket-panel-crumb" aria-label="Where this ticket lives">
          <Link href={href(`/products/${product.key}/tickets`)} className="tp-crumb-product" onClick={onClose}>
            <ProductTile product={product} /> {product.name}
          </Link>
          <ChevronRight className="tp-crumb-sep" aria-hidden />
          <span className="tp-crumb-key">
            <TypeIcon type={ticket.type} /> <span className="key">{ticket.key}</span>
            <span className="tp-crumb-type" data-type={ticket.type}>{CRUMB_TYPE[ticket.type]}</span>
          </span>
          {ticket.epicKey && (
            <>
              <ChevronRight className="tp-crumb-sep" aria-hidden />
              <button type="button" className="epic-chip-btn" onClick={() => openTicket(ticket.epicKey!)} aria-label={`Open epic ${ticket.epicKey}`}>
                <EpicChip ticket={ticket} />
              </button>
            </>
          )}
        </nav>
        <span className="spacer" />
        {canArchive && !ticket.archivedAt && (
          <Popover
            align="right" width={200} floating
            trigger={({ open, toggle }) => (
              <IconButton label="More actions" active={open} onClick={toggle}><Ellipsis /></IconButton>
            )}
          >
            {(close) => (
              <button type="button" role="menuitem" className="menu-item" onClick={() => { close(); archive(); }}>
                <Archive aria-hidden /> {ticket.type === "epic" ? "Archive epic" : "Archive ticket"}
              </button>
            )}
          </Popover>
        )}
        <IconButton label="Close" onClick={onClose}><X /></IconButton>
      </div>
      <div className="ticket-panel-heading">
        <TitleField key={ticket.key} ticket={ticket} editable={editable} />
      </div>
      {ticket.archivedAt && (
        <div className="ticket-archived-banner" role="status">
          <Archive aria-hidden />
          <p>
            <strong>Archived</strong> on {shortDate(ticket.archivedAt)}{personById(ticket.archivedBy) && ` by ${personById(ticket.archivedBy)!.name}`}.
            {" "}It&apos;s read-only and off the board.
          </p>
          {canArchive && <button type="button" className="btn btn-primary" onClick={restore}><ArchiveRestore aria-hidden /> Restore</button>}
        </div>
      )}
    </header>
  );
}

function MetaGrid({ ticket, product, editable, onNavigate }: PanelProps & { onNavigate: () => void }) {
  const { db, personById, statusById, href } = useDb();
  const { openTicket } = useAppState();
  const epic = ticket.epicKey ? db.tickets.find((t) => t.key === ticket.epicKey) : undefined;
  const status = statusById(ticket.statusId);
  const done = status?.category === "done";
  const req = requirementById(db.requirements, ticket.requirementId);

  return (
    <dl className="ticket-meta">
      <dt>Status</dt>
      <dd className="meta-status">
        {editable ? <StatusCell ticket={ticket} /> : status && <StatusPill name={status.name} tone={status.tone} filled />}
      </dd>
      {ticket.type !== "epic" && (
        <>
          <dt>Type</dt>
          <dd>{editable ? <TypeField ticket={ticket} /> : TYPE_LABEL[ticket.type]}</dd>
          <dt>Epic</dt>
          <dd>
            {editable ? <EpicField ticket={ticket} /> : epic ? (
              <button type="button" className="meta-link" onClick={() => openTicket(epic.key)}>{epic.key} · {epic.title}</button>
            ) : <span className="muted">None</span>}
          </dd>
        </>
      )}
      <dt>Assignee</dt>
      <dd>
        {editable ? <AssigneeField ticket={ticket} product={product} /> : (
          <><Assignees ids={ticket.assigneeIds} /> {(ticket.assigneeIds ?? []).map((pid) => personById(pid)?.name).filter(Boolean).join(", ") || "Unassigned"}</>
        )}
      </dd>
      <dt>Priority</dt>
      <dd className="meta-priority">{editable ? <PriorityField ticket={ticket} /> : <PriorityCell priority={ticket.priority} productKey={ticket.productKey} />}</dd>
      <dt>Due</dt>
      <dd>{editable ? <DueField ticket={ticket} done={done} /> : <DueDate ticket={ticket} done={done} />}</dd>
      <dt>Estimate</dt>
      <dd className="meta-time">
        {editable ? <EstimateField key={ticket.key} ticket={ticket} /> : ticket.estimateH ? formatHours(ticket.estimateH) : <span className="muted">None</span>}
      </dd>
      <dt>Requirement</dt>
      <dd>
        {editable ? <RequirementField ticket={ticket} /> : req ? (
          <Link href={href(`/products/${ticket.productKey}/docs`)} className="meta-link" onClick={onNavigate}>{req.code} · {req.title}</Link>
        ) : <span className="muted">None</span>}
      </dd>
      <dt>Sprint</dt>
      <dd>{ticket.sprint ?? <span className="muted">Not planned</span>}</dd>
      <dt>Pull request</dt>
      <dd><PrBadge pr={ticket.pr} /></dd>
    </dl>
  );
}
