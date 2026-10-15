import { Bug, CircleAlert, CircleCheck, GitMerge, GitPullRequest, Layers, SquareCheck } from "lucide-react";
import { today } from "@/domain/clock";
import { useDb } from "@/data/StoreProvider";
import { shortDate } from "@/domain/status";
import type { Priority, PullRequest, Requirement, Ticket, TicketType } from "@/domain/types";

export const PRIORITY_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const TYPE_LABEL: Record<TicketType, string> = { epic: "Epic", task: "Task", bug: "Bug" };

export const requirementById = (list: Requirement[], id?: string) => list.find((r) => r.id === id);
export const isOverdue = (t: Ticket, done: boolean) => !!t.due && !done && t.due < today();

export function TypeIcon({ type }: { type: TicketType }) {
  const Icon = type === "epic" ? Layers : type === "bug" ? Bug : SquareCheck;
  return <Icon className="type-icon" data-type={type} aria-label={TYPE_LABEL[type]} />;
}

/** The ticket's epic: its name on a tint of the epic's colour. Nothing when the ticket has no epic. */
export function EpicChip({ ticket }: { ticket: Ticket }) {
  const { db } = useDb();
  const epic = ticket.epicKey ? db.tickets.find((t) => t.key === ticket.epicKey) : undefined;
  if (!epic) return null;
  return (
    <span className="epic-chip" style={{ "--epic": epic.color } as React.CSSProperties} title={`Epic ${epic.key} · ${epic.title}`}>
      <Layers aria-hidden /><span className="epic-chip-name">{epic.title}</span>
    </span>
  );
}

export function PriorityCell({ priority }: { priority: Priority }) {
  return <span className="priority-cell" data-priority={priority}>{PRIORITY_LABEL[priority]}</span>;
}

/** monday-style due date: overdue → red alert, done → green check + strikethrough. */
export function DueDate({ ticket, done }: { ticket: Ticket; done: boolean }) {
  if (!ticket.due) return <span className="muted">—</span>;
  const overdue = isOverdue(ticket, done);
  return (
    <span className={`due${done ? " is-done" : ""}${overdue ? " is-overdue" : ""}`}>
      {overdue && <CircleAlert aria-label="Overdue" />}
      {done && <CircleCheck aria-label="Done" />}
      <span className="due-text">{shortDate(ticket.due)}</span>
    </span>
  );
}

export function PrBadge({ pr }: { pr?: PullRequest }) {
  if (!pr) return <span className="muted">—</span>;
  const Icon = pr.state === "merged" ? GitMerge : pr.state === "approved" ? CircleCheck : GitPullRequest;
  return (
    <span className="pr-badge" data-state={pr.state} title={`PR #${pr.number} · ${pr.state}`}>
      #{pr.number} <Icon aria-label={pr.state} />
    </span>
  );
}
