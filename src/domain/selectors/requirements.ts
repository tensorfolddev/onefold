// Requirements: what each status means, the next code, and how far along one is.
import type { Db } from "../../data/db.ts";
import type { Requirement, RequirementSourceKind, RequirementStatus, Ticket, Tone } from "../types.ts";
import { categoryOf } from "./product.ts";

export const REQUIREMENT_STATUS: Record<RequirementStatus, { label: string; tone: Tone; color: string }> = {
  draft: { label: "Draft", tone: "backlog", color: "#9699a6" },
  proposed: { label: "Proposed by client", tone: "sky", color: "#66ccff" },
  to_confirm: { label: "Waiting for client", tone: "review", color: "#fdab3d" },
  changes_requested: { label: "Changes asked", tone: "stuck", color: "#e2445c" },
  confirmed: { label: "Confirmed", tone: "done", color: "#00c875" },
  dropped: { label: "Dropped", tone: "cancelled", color: "#676879" },
};
/** Board order: what needs the team first, then what's with the client, then settled, then out of scope. */
export const STATUS_ORDER: RequirementStatus[] = ["proposed", "draft", "changes_requested", "to_confirm", "confirmed", "dropped"];

export const statusOfRequirement = (r: Requirement): RequirementStatus => r.status ?? "draft";

// Priorities: the company's own, or the defaults (selectors/clientLook.ts).

export const SOURCE_KINDS: Record<RequirementSourceKind, string> = {
  meeting: "Meeting", call: "Call", email: "Email", whatsapp: "WhatsApp", doc: "Document", other: "Other",
};

/** "R" and one more than the project's highest number so far (a dropped or deleted code is never reused while it's there). */
export function nextRequirementCode(db: Db, productKey: string): string {
  const highest = db.requirements
    .filter((r) => r.productKey === productKey)
    .reduce((n, r) => Math.max(n, Number(/^R(\d+)$/.exec(r.code)?.[1] ?? 0)), 0);
  return `R${highest + 1}`;
}

/** Agreed, and every ticket that builds it is done. */
export const isDelivered = (db: Db, r: Requirement) => {
  const p = requirementProgress(db, r);
  return statusOfRequirement(r) === "confirmed" && p.total > 0 && p.done === p.total;
};

/** The tasks and bugs that build it — epics only group them; archived and cancelled ones don't count — and their hours. */
export function requirementProgress(db: Db, r: Requirement) {
  const linked = db.tickets.filter((t) => t.requirementId === r.id && t.type !== "epic" && !t.archivedAt && categoryOf(db, t) !== "cancelled");
  const done = linked.filter((t) => categoryOf(db, t) === "done");
  const doing = linked.filter((t) => categoryOf(db, t) === "in_progress").length;
  const hours = (list: Ticket[]) => list.reduce((h, t) => h + (t.estimateH || 0), 0);
  return { linked, done: done.length, doing, total: linked.length, hoursDone: hours(done), hoursTotal: hours(linked) };
}
