// The Client tab's words and colours: what each phase of a requirement or a request is called — to the team, and to
// the client — with its colour, and the requirement priorities. A project's own (its Settings → Client tab) win over the
// defaults; both sides see a project's own names.
import type { AskState, ClientPhases, PriorityDef, Product, RequirementStatus } from "../types.ts";

export type LookSide = "team" | "client";
export interface PhaseLabel { team: string; client: string; color: string }

export const REQ_PHASES: Record<RequirementStatus, PhaseLabel> = {
  draft: { team: "Draft", client: "Draft", color: "#676879" },
  proposed: { team: "Suggested by client", client: "You suggested", color: "#579bfc" },
  to_confirm: { team: "Waiting for client", client: "Waiting for you", color: "#e99729" },
  changes_requested: { team: "Changes asked", client: "Changes asked", color: "#e2445c" },
  confirmed: { team: "Confirmed", client: "Confirmed", color: "#00a35f" },
  dropped: { team: "Dropped", client: "Dropped", color: "#9699a6" },
};
export const ASK_PHASES: Record<AskState, PhaseLabel> = {
  open: { team: "Waiting for client", client: "Waiting for you", color: "#e99729" },
  answered: { team: "Answered", client: "Answered", color: "#579bfc" },
  done: { team: "Done", client: "Done", color: "#00a35f" },
  cancelled: { team: "Called off", client: "Called off", color: "#9699a6" },
};
/** Must: it doesn't launch without it · Should: expected, but launch can happen without it · Nice: if there's time. */
export const DEFAULT_PRIORITIES: PriorityDef[] = [
  { id: "must", name: "Must have", color: "#1f5fd1" },
  { id: "should", name: "Should have", color: "#7b4fd6" },
  { id: "nice", name: "Nice to have", color: "#178a6a" },
];

/** What a project set for its Client tab (none: the defaults). Travels with each room, to the client too. */
export interface ClientLook { phases?: ClientPhases; priorities?: PriorityDef[] }
export const lookOf = (product: Pick<Product, "clientPhases" | "requirementPriorities"> | undefined): ClientLook =>
  ({ ...(product?.clientPhases && { phases: product.clientPhases }), ...(product?.requirementPriorities?.length && { priorities: product.requirementPriorities }) });

export function reqPhase(look: ClientLook, status: RequirementStatus, side: LookSide): { label: string; color: string } {
  const own = look.phases?.req?.[status];
  return { label: own?.name || REQ_PHASES[status][side], color: own?.color || REQ_PHASES[status].color };
}
export function askPhase(look: ClientLook, state: AskState, side: LookSide): { label: string; color: string } {
  const own = look.phases?.ask?.[state];
  return { label: own?.name || ASK_PHASES[state][side], color: own?.color || ASK_PHASES[state].color };
}

export const prioritiesOf = (look: ClientLook): PriorityDef[] => (look.priorities?.length ? look.priorities : DEFAULT_PRIORITIES);
/** "Must have" → "Must", "Nice to have" → "Nice"; a project's own "Critical" stays "Critical". */
export const shortName = (name: string) => name.replace(/\s+(to\s+)?have$/i, "") || name;
/** A requirement's priority as it shows; one that isn't in the project's list any more shows by its id, in grey. */
export function priorityLook(look: ClientLook, id: string | undefined): (PriorityDef & { short: string }) | undefined {
  if (!id) return undefined;
  const p = prioritiesOf(look).find((x) => x.id === id) ?? { id, name: id, color: "#9699a6" };
  return { ...p, short: shortName(p.name) };
}

export const REQUIREMENT_STATUSES = Object.keys(REQ_PHASES) as RequirementStatus[];
export const ASK_STATES = Object.keys(ASK_PHASES) as AskState[];
