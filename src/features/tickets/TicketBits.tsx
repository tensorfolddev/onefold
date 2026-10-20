import { Flag, Bug, CircleAlert, CircleCheck, GitMerge, GitPullRequest, Layers, SquareCheck } from "lucide-react";
import { today } from "@/domain/clock";
import { useDb } from "@/data/StoreProvider";
import { Avatar } from "@/ui/primitives";
import { epicLabel } from "@/domain/selectors/epics";
import { shortDate } from "@/domain/status";
import type { Priority, Product, PullRequest, Requirement, Ticket, TicketType } from "@/domain/types";

export const PRIORITY_LABEL: Record<Priority, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
export const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
export const TYPE_LABEL: Record<TicketType, string> = { epic: "Epic", task: "Task", bug: "Bug" };

/** A priority level as this project shows it: its own name and colour (Settings → Priorities), or the defaults. */
export function priorityLook(product: Product | undefined, p: Priority): { label: string; style?: React.CSSProperties } {
  const own = product?.priorities?.[p];
  return { label: own?.name ?? PRIORITY_LABEL[p], style: own?.color ? ({ "--prio": own.color } as React.CSSProperties) : undefined };
}
export function usePriorityLook(productKey: string) {
  const { productByKey } = useDb();
  const product = productByKey(productKey);
  return (p: Priority) => priorityLook(product, p);
}

export const requirementById = (list: Requirement[], id?: string) => list.find((r) => r.id === id);
export const isOverdue = (t: Ticket, done: boolean) => !!t.due && !done && t.due < today();

/** What a ticket is, in the words people use — a task is a feature. On cards and the ticket's header. */
export const KIND_LABEL: Record<TicketType, string> = { task: "Feature", bug: "Bug", epic: "Epic" };
export function TypeTag({ type, title }: { type: TicketType; title?: string }) {
  return <span className="type-tag" data-type={type} title={title}>{KIND_LABEL[type]}</span>;
}

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
    <span className="epic-chip" style={{ "--epic": epic.color } as React.CSSProperties} title={`${epicLabel(db, epic)} · ${epic.title}`}>
      <Layers aria-hidden /><span className="epic-chip-name">{epicLabel(db, epic)}</span>
    </span>
  );
}

/** Everyone on a ticket as overlapping avatars: the first few, then "+N". */
export function Assignees({ ids, max = 3 }: { ids?: string[]; max?: number }) {
  const { personById } = useDb();
  if (!ids?.length) return <Avatar size="sm" />;
  const names = ids.map((pid) => personById(pid)?.name).filter(Boolean).join(", ");
  return (
    <span className="avatar-stack assignees" title={names} aria-label={names}>
      {ids.slice(0, max).map((pid) => <Avatar key={pid} personId={pid} size="sm" />)}
      {ids.length > max && <span className="avatar sm assignees-more" aria-hidden>+{ids.length - max}</span>}
    </span>
  );
}

/** A ticket's priority as a small tag in its colour — on board cards. */
export function PriorityChip({ priority, productKey }: { priority: Priority; productKey: string }) {
  const { label, style } = usePriorityLook(productKey)(priority);
  return (
    <span className="card-priority" data-priority={priority} style={style} title={`${label} priority`}>
      <Flag aria-hidden />{label}
    </span>
  );
}

export function PriorityCell({ priority, productKey }: { priority: Priority; productKey: string }) {
  const { label, style } = usePriorityLook(productKey)(priority);
  return <span className="priority-cell" data-priority={priority} style={style}>{label}</span>;
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
