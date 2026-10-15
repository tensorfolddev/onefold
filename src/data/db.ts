// One company's data, as the domain commands see it. The server stores it in Postgres (src/server/company) and sends
// each person their own view of it (domain/snapshot.ts).
import { TEMPLATES } from "../domain/templates.ts";
import type {
  Activity, Comment, Decision, Doc, Invite, Milestone, Notification, Org, Person, Product, ProductGroup, Requirement,
  StageRequest, Status, Team, Ticket,
} from "../domain/types.ts";

/** Bump when the shape changes in a way normalize() can't fill in. */
export const DB_VERSION = 2;

export interface Db {
  version: number;
  org: Org;
  invites: Invite[];
  people: Person[];
  teams: Team[];
  jobTitles: string[];
  productGroups: ProductGroup[];
  products: Product[];
  statusesByProduct: Record<string, Status[]>;
  tickets: Ticket[];
  requirements: Requirement[];
  decisions: Decision[];
  milestones: Milestone[];
  docs: Doc[];
  activity: Activity[];
  comments: Comment[];
  notifications: Notification[];
  stageRequests: StageRequest[];
}

/** Tile colours a product can pick (monday group palette, as design tokens). */
export const PRODUCT_COLORS = [
  "done-green", "grass_green", "bright-green", "aquamarine", "teal", "bright-blue", "river", "navy",
  "dark_indigo", "purple", "lavender", "berry", "sofia_pink", "dark-pink", "stuck-red", "dark-orange",
  "working_orange", "egg_yolk", "peach", "brown", "steel", "american_gray", "winter", "chili-blue",
].map((c) => `var(--color-${c})`);

/** Epics pick from the same 24 colours as product tiles. */
export const EPIC_COLORS = PRODUCT_COLORS;

/** The lists every new product starts with: the fixed Epic + Backlog, then a sensible flow. */
export const DEFAULT_LISTS: Omit<Status, "id">[] = [
  { name: "Epic", category: "backlog", tone: "stuck", system: "epic" },
  { name: "Backlog", category: "backlog", tone: "backlog", system: "backlog" },
  { name: "To Do", category: "todo", tone: "todo" },
  { name: "In Progress", category: "in_progress", tone: "working" },
  { name: "Review", category: "in_progress", tone: "review" },
  { name: "Done", category: "done", tone: "done" },
];
export const listsFor = (productKey: string): Status[] =>
  DEFAULT_LISTS.map((l) => ({ ...l, id: `${productKey.toLowerCase()}-${l.name.toLowerCase().replace(/\s+/g, "-")}` }));

export const DEFAULT_JOB_TITLES = ["CEO", "CTO", "Product Manager", "Project Manager", "Team Lead", "Engineer", "Designer", "QA Engineer"];

/** A brand-new company: just the founder, no products yet. */
export function emptyDb(org: Org, founder: Person): Db {
  return {
    version: DB_VERSION, org, invites: [], people: [founder], teams: [], jobTitles: [...DEFAULT_JOB_TITLES],
    productGroups: [], products: [], statusesByProduct: {}, tickets: [], requirements: [], decisions: [], milestones: [],
    docs: [], activity: [], comments: [], notifications: [], stageRequests: [],
  };
}

/** Old free-text descriptions become the first template section (Goal / Summary). */
const withTemplate = (t: Ticket): Ticket => {
  const { description, ...rest } = t as Ticket & { description?: string };
  if (description === undefined) return t;
  const first = TEMPLATES[t.type][0].id;
  return { ...rest, sections: { ...rest.sections, [first]: rest.sections?.[first] ?? description } };
};

/**
 * Keeps the rules the board relies on, whatever was saved: every product's lists start with the fixed Epic (always
 * red), then Backlog; epics live only in the Epic list and carry a colour; missing collections are filled in.
 */
export function normalize(db: Db): Db {
  const statusesByProduct = Object.fromEntries(Object.entries(db.statusesByProduct ?? {}).map(([key, lists]) => {
    const prefix = key.toLowerCase();
    const found = lists.find((s) => s.system === "epic");
    const epic = found ? { ...found, tone: "stuck" as const }
      : { id: `${prefix}-epic`, name: "Epic", category: "backlog" as const, tone: "stuck" as const, system: "epic" as const };
    const backlogAt = lists.findIndex((s) => s.system === "backlog" || (!s.system && s.name.toLowerCase() === "backlog"));
    const backlog = backlogAt >= 0 ? { ...lists[backlogAt], system: "backlog" as const }
      : { id: `${prefix}-backlog-list`, name: "Backlog", category: "backlog" as const, tone: "backlog" as const, system: "backlog" as const };
    const rest = lists.filter((s, i) => s.id !== epic.id && i !== backlogAt && !s.system);
    return [key, [epic, backlog, ...rest]];
  }));
  const epicOf = (pk: string) => statusesByProduct[pk]?.[0]?.id;
  const backlogOf = (pk: string) => statusesByProduct[pk]?.[1]?.id;
  const tickets = (db.tickets ?? []).map(withTemplate).map((t, i) => {
    if (t.type === "epic") return { ...t, statusId: epicOf(t.productKey) ?? t.statusId, color: t.color ?? EPIC_COLORS[i % EPIC_COLORS.length] };
    return t.statusId === epicOf(t.productKey) ? { ...t, statusId: backlogOf(t.productKey) ?? t.statusId } : t;
  });
  return {
    ...db,
    version: DB_VERSION,
    invites: db.invites ?? [],
    teams: db.teams ?? [],
    jobTitles: [...new Set([...(db.jobTitles ?? DEFAULT_JOB_TITLES), ...(db.people ?? []).map((p) => p.role)])],
    productGroups: db.productGroups ?? [],
    statusesByProduct,
    tickets,
    requirements: db.requirements ?? [],
    decisions: db.decisions ?? [],
    milestones: db.milestones ?? [],
    docs: db.docs ?? [],
    activity: db.activity ?? [],
    comments: db.comments ?? [],
    notifications: db.notifications ?? [],
    stageRequests: db.stageRequests ?? [],
  };
}

/** Live lookups over the current data. */
export const makeLookups = (db: Db) => ({
  personById: (id?: string) => db.people.find((p) => p.id === id),
  productByKey: (key: string) => db.products.find((p) => p.key === key),
  ticketByKey: (key: string) => db.tickets.find((t) => t.key === key),
  statusesFor: (productKey: string) => db.statusesByProduct[productKey] ?? [],
  statusById: (id: string) => Object.values(db.statusesByProduct).flat().find((s) => s.id === id),
});
export type Lookups = ReturnType<typeof makeLookups>;
