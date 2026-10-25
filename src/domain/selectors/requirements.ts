// Requirements: what each status means, the next code, and how far along one is.
import type { Db } from "../../data/db.ts";
import type { Requirement, RequirementStatus, Ticket, Tone } from "../types.ts";
import { categoryOf } from "./product.ts";

export const REQUIREMENT_STATUS: Record<RequirementStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "backlog" },
  proposed: { label: "Proposed by client", tone: "sky" },
  to_confirm: { label: "Waiting for client", tone: "review" },
  changes_requested: { label: "Changes asked", tone: "stuck" },
  confirmed: { label: "Confirmed", tone: "done" },
  dropped: { label: "Dropped", tone: "cancelled" },
};

export const statusOfRequirement = (r: Requirement): RequirementStatus => r.status ?? "draft";

/** "R" and one more than the project's highest number so far (a dropped or deleted code is never reused while it's there). */
export function nextRequirementCode(db: Db, productKey: string): string {
  const highest = db.requirements
    .filter((r) => r.productKey === productKey)
    .reduce((n, r) => Math.max(n, Number(/^R(\d+)$/.exec(r.code)?.[1] ?? 0)), 0);
  return `R${highest + 1}`;
}

/** The tasks and bugs that build it — epics only group them; archived and cancelled ones don't count — and their hours. */
export function requirementProgress(db: Db, r: Requirement) {
  const linked = db.tickets.filter((t) => t.requirementId === r.id && t.type !== "epic" && !t.archivedAt && categoryOf(db, t) !== "cancelled");
  const done = linked.filter((t) => categoryOf(db, t) === "done");
  const hours = (list: Ticket[]) => list.reduce((h, t) => h + (t.estimateH || 0), 0);
  return { linked, done: done.length, total: linked.length, hoursDone: hours(done), hoursTotal: hours(linked) };
}
