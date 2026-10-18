// The ticket and epic templates. Fixed in code on purpose: every product, every person (admins too) writes tickets
// the same way, so humans and tools (a future 1Fold MCP server, a Claude skill) can rely on the same sections.
// Section ids are a public contract — "AP-12#acceptance_criteria" — so never rename one; add a new id and bump
// TEMPLATE_VERSION instead.
import type { SectionItem, SectionValue, Ticket, TicketType } from "./types.ts";

export const TEMPLATE_VERSION = 1;

export type SectionKind =
  | "text" // free text
  | "list" // bullet points
  | "steps" // numbered lines
  | "checklist" // tickable lines
  | "done" // the fixed Definition of done: same lines for everyone, only ticks are stored
  | "dependencies" // ticket.dependsOn
  | "images" // ticket.attachments
  | "epic_tickets"; // epics: tickets whose epicKey points here (computed)

export interface SectionDef {
  id: string;
  title: string;
  /** What good looks like. Shown as guidance while the section is empty or being edited. */
  hint: string;
  kind: SectionKind;
  required?: boolean;
}

/** Same for every task and bug. Changing these lines is a template change (bump the version). */
export const DEFINITION_OF_DONE: SectionItem[] = [
  { id: "criteria_met", text: "Every acceptance criterion is met" },
  { id: "reviewed", text: "Code reviewed, approved and merged" },
  { id: "tested", text: "Tests added or updated, and passing" },
  { id: "staging", text: "Checked on staging by someone other than the author" },
  { id: "docs", text: "Docs and release notes updated, if anything changed for users" },
];

const acceptance: SectionDef = { id: "acceptance_criteria", title: "Acceptance criteria", kind: "checklist", required: true, hint: "One testable outcome per line, e.g. “A wrong password shows an error under the field”. Done when every line is ticked." };
const outOfScope: SectionDef = { id: "out_of_scope", title: "Out of scope", kind: "list", hint: "What this deliberately does not do. Stops scope creep and wrong guesses." };
const technical: SectionDef = { id: "technical_notes", title: "Technical notes", kind: "text", hint: "Approach, modules or files, APIs, data changes, risks — what the next engineer (or Claude) needs to start." };
const dependencies: SectionDef = { id: "dependencies", title: "Dependencies", kind: "dependencies", hint: "Tickets that must be finished before this one can start or ship." };
const images: SectionDef = { id: "images", title: "Images", kind: "images", hint: "Designs, screenshots, diagrams. Paste, drop or pick a file." };
const testPlan: SectionDef = { id: "test_plan", title: "Test plan", kind: "checklist", hint: "How to check it works: steps, edge cases, devices and browsers." };
const done: SectionDef = { id: "definition_of_done", title: "Definition of done", kind: "done", hint: "The same checklist for every ticket in 1Fold." };

export const TEMPLATES: Record<TicketType, SectionDef[]> = {
  task: [
    { id: "goal", title: "Goal", kind: "text", required: true, hint: "What are we building and why? One to three sentences anyone on the team understands." },
    { id: "context", title: "Context", kind: "text", hint: "Background, who it's for, and links to designs, docs or conversations." },
    acceptance, outOfScope, technical, dependencies, images, testPlan, done,
  ],
  bug: [
    { id: "summary", title: "Summary", kind: "text", required: true, hint: "What's broken, who it affects, and how badly." },
    { id: "steps_to_reproduce", title: "Steps to reproduce", kind: "steps", required: true, hint: "Exact steps from a fresh start, one per line." },
    { id: "expected_vs_actual", title: "Expected vs actual", kind: "text", required: true, hint: "Expected: what should happen. Actual: what happens instead." },
    { id: "environment", title: "Environment", kind: "text", hint: "Browser, device, app version, and the account or data used." },
    { ...acceptance, hint: "How we'll know it's fixed — one testable line each." },
    { ...technical, hint: "Root cause and the fix, once known." },
    dependencies,
    { ...images, hint: "Screenshots of the bug. Paste, drop or pick a file." },
    testPlan, done,
  ],
  epic: [
    { id: "goal", title: "Problem & goal", kind: "text", required: true, hint: "The problem, who has it, and what changes for them when this ships." },
    { id: "success_metrics", title: "Success metrics", kind: "checklist", required: true, hint: "Measurable signs it worked, e.g. “Sign-in drop-off below 5%”." },
    { id: "in_scope", title: "In scope", kind: "list", hint: "The big pieces of work. Each usually becomes one or more tickets." },
    outOfScope,
    { id: "tickets", title: "Tickets", kind: "epic_tickets", hint: "The tasks and bugs that deliver this epic." },
    { ...dependencies, hint: "Epics or tickets that must land first." },
    { id: "risks", title: "Risks & assumptions", kind: "list", hint: "What could go wrong, and what we're assuming is true." },
    { ...images, hint: "Flows, designs, architecture diagrams." },
    { id: "release_plan", title: "Release plan", kind: "text", hint: "Target date, rollout steps, and who needs to know." },
  ],
};

export const TEMPLATE_NAME: Record<TicketType, string> = { task: "Task", bug: "Bug", epic: "Epic" };
/** "task@1": what an exported ticket was written against. */
export const templateId = (type: TicketType) => `${type}@${TEMPLATE_VERSION}`;
export const sectionDef = (type: TicketType, id: string) => TEMPLATES[type].find((s) => s.id === id);
/** Kinds whose value is stored in ticket.sections; the others live on the ticket itself or are computed. */
export const isStoredKind = (k: SectionKind) => k === "text" || k === "list" || k === "steps" || k === "checklist" || k === "done";

/** Address of one section — what a link, an MCP tool or a skill points at. */
export const sectionRef = (key: string, sectionId: string) => `${key}#${sectionId}`;

export const textOf = (v?: SectionValue) => (typeof v === "string" ? v : "");
export const itemsOf = (v?: SectionValue) => (Array.isArray(v) ? v : []);

/** The ticket's one-paragraph summary: its first text section (Goal / Summary). */
export const summaryOf = (t: Ticket) => textOf(t.sections?.[TEMPLATES[t.type][0].id]);

export function isFilled(def: SectionDef, t: Ticket, childCount = 0) {
  const v = t.sections?.[def.id];
  switch (def.kind) {
    case "text": return textOf(v).trim().length > 0;
    case "list": case "steps": case "checklist": return itemsOf(v).length > 0;
    case "done": return itemsOf(v).some((i) => i.done);
    case "dependencies": return (t.dependsOn ?? []).length > 0;
    case "images": return (t.attachments ?? []).length > 0;
    case "epic_tickets": return childCount > 0;
  }
}

/** How much of the template is filled in, and which required sections are still empty. */
export function completeness(t: Ticket, tickets: Ticket[]) {
  const children = t.type === "epic" ? tickets.filter((x) => x.epicKey === t.key).length : 0;
  const defs = TEMPLATES[t.type];
  const filled = defs.filter((d) => isFilled(d, t, children));
  return { filled: filled.length, total: defs.length, missing: defs.filter((d) => d.required && !filled.includes(d)) };
}

// ---------- export: the shape an MCP server / Claude skill reads ----------
export interface ExportContext {
  tickets: Ticket[];
  statusName: (statusId: string) => string;
  isDone: (t: Ticket) => boolean;
  personName: (id?: string) => string | undefined;
}

interface TicketRef { key: string; title: string; type?: TicketType; status?: string; done: boolean }
type ExportValue = string | { text: string; done?: boolean }[] | TicketRef[] | { id: string; name: string; type: string; width: number; height: number }[];

export function ticketToJson(t: Ticket, ctx: ExportContext) {
  const ref = (k: string): TicketRef => {
    const x = ctx.tickets.find((y) => y.key === k);
    return { key: k, title: x?.title ?? "(deleted)", type: x?.type, status: x && x.type !== "epic" ? ctx.statusName(x.statusId) : undefined, done: !!x && ctx.isDone(x) };
  };
  const valueOf = (d: SectionDef): ExportValue => {
    const v = t.sections?.[d.id];
    switch (d.kind) {
      case "text": return textOf(v);
      case "done": return DEFINITION_OF_DONE.map((i) => ({ text: i.text, done: itemsOf(v).some((x) => x.id === i.id && x.done) }));
      case "dependencies": return (t.dependsOn ?? []).map(ref);
      case "images": return (t.attachments ?? []).map(({ id, name, type, width, height }) => ({ id, name, type, width, height }));
      case "epic_tickets": return ctx.tickets.filter((x) => x.epicKey === t.key).map((x) => ref(x.key));
      case "checklist": return itemsOf(v).map(({ text, done: d2 }) => ({ text, done: !!d2 }));
      default: return itemsOf(v).map(({ text }) => ({ text }));
    }
  };
  return {
    key: t.key,
    template: templateId(t.type),
    type: t.type,
    title: t.title,
    product: t.productKey,
    status: t.type === "epic" ? undefined : ctx.statusName(t.statusId),
    priority: t.priority,
    assignee: ctx.personName(t.assigneeIds?.[0]), // the first, for older readers
    assignees: (t.assigneeIds ?? []).map((pid) => ctx.personName(pid)).filter(Boolean),
    due: t.due,
    epic: t.epicKey ? ref(t.epicKey) : undefined,
    sections: TEMPLATES[t.type].map((d) => ({ id: d.id, ref: sectionRef(t.key, d.id), title: d.title, kind: d.kind, required: !!d.required, value: valueOf(d) })),
  };
}

const mdLines = (kind: SectionKind, value: ExportValue): string => {
  if (typeof value === "string") return value.trim() || "_Not filled in_";
  if (!value.length) return "_None_";
  return value.map((x, n) => {
    if ("key" in x) return `- [${x.done ? "x" : " "}] ${x.key} — ${x.title}${x.status ? ` (${x.status})` : ""}`;
    if ("name" in x) return `- ${x.name} (${x.width}×${x.height})`;
    if (kind === "steps") return `${n + 1}. ${x.text}`;
    return kind === "list" ? `- ${x.text}` : `- [${x.done ? "x" : " "}] ${x.text}`;
  }).join("\n");
};

/** Markdown with one `## Title {#id}` heading per section — easy for people and LLMs to read, quote and link. */
export function ticketToMarkdown(t: Ticket, ctx: ExportContext) {
  const j = ticketToJson(t, ctx);
  const meta = [`type: ${j.type}`, `template: ${j.template}`, j.status && `status: ${j.status}`, `priority: ${j.priority}`,
    j.assignee && `assignee: ${j.assignee}`, j.due && `due: ${j.due}`, j.epic && `epic: ${j.epic.key}`].filter(Boolean).join(" · ");
  const body = j.sections.map((s) => `## ${s.title} {#${s.id}}\n\n${mdLines(s.kind, s.value)}`);
  return `# ${t.key} · ${t.title}\n\n${meta}\n\n${body.join("\n\n")}\n`;
}
