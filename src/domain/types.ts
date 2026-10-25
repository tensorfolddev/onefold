// The 1Fold domain model. Shared by the browser store today, and the backend + MCP server later.

/** The company that signed up. It is the workspace: everything below belongs to one company. */
export interface Org {
  id: string;
  slug: string; // URL-safe name, unique: "tensorfold"
  name: string;
  /** From the founder's email; invites are limited to it while domainLock is on. */
  emailDomain: string;
  domainLock: boolean;
  createdAt: string; // ISO date
  createdBy: string; // founder's person id
}

/** Someone invited to join. They accept at /invite/<token>, choosing their name and password.
 *  The token itself is a secret: only its SHA-256 hash is stored, and the server never sends it to browsers. */
export interface Invite {
  id: string;
  tokenHash: string;
  email: string;
  panel: Panel;
  role: Role;
  invitedBy: string;
  createdAt: string; // ISO datetime
  acceptedAt?: string;
  revokedAt?: string;
}

/** Job title. Admins manage the list in Settings (db.jobTitles). */
export type Role = string;
export type TeamId = string; // admins create teams
export type Panel = "admin" | "manager" | "developer";

export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string; // CSS colour token, e.g. var(--color-sofia_pink)
  role: Role;
  team: TeamId;
  capacityH: number; // hours per sprint (planning: estimates of open tickets vs this)
  email: string; // the login email; the login itself (password) lives on the server only
  panel?: Panel; // undefined = cannot sign in (client contacts)
  active: boolean;
  photo?: string; // "tpl:fox" (a ready-made one) or "file:<id>" (uploaded); none = initials (domain/avatars.ts)
}

export interface Team {
  id: TeamId;
  name: string;
  leadId: string;
}

export type Stage = "INTAKE" | "DEFINE" | "PLAN" | "BUILD" | "RELEASE";
export type Health = "good" | "watch" | "risk";

/** A product's tile: an emoji, or a lucide icon by its kebab-case name. Unset = the product's first letter. */
export type ProductIcon = { type: "emoji"; value: string } | { type: "icon"; value: string };

/** Any grouping of the company's products (client/internal, by team, by quarter…). */
export interface ProductGroup { id: string; name: string }

export interface Product {
  key: string; // ticket prefix, e.g. "AP"
  name: string;
  type: "client" | "internal";
  client?: string;
  stage: Stage;
  health: Health;
  pmId: string;
  projectManagerId: string;
  color: string; // product avatar tile colour
  description: string;
  waitingApproval?: string; // e.g. "approve intake?"
  memberIds: string[]; // besides PM + project manager, who can open this product
  icon?: ProductIcon;
  groupId?: string; // unset = "Ungrouped"
  /** This project's own names and colours for the four priority levels; a level not here keeps the default. */
  priorities?: Partial<Record<Priority, PriorityLook>>;
  createdAt: string; // ISO date
  // Archived: read-only, out of every list and everyone's work, invisible to developers — until it's restored.
  archivedAt?: string; // ISO time
  archivedBy?: string; // person id
}

export type StatusCategory = "backlog" | "todo" | "in_progress" | "done" | "cancelled";
export type Tone = "backlog" | "todo" | "working" | "review" | "stuck" | "done" | "cancelled"
  | "pink" | "teal" | "sky" | "lime" | "brown" | "navy"; // more colours for lists of your own

export interface Status {
  id: string;
  name: string;
  category: StatusCategory;
  tone: Tone;
  /** Fixed lists every product has, always first and second; they can't be renamed, moved or deleted. */
  system?: "epic" | "backlog";
}

export type TicketType = "epic" | "task" | "bug";
export type Priority = "critical" | "high" | "medium" | "low";
export interface PriorityLook { name?: string; color?: string }

export interface PullRequest {
  number: number;
  state: "open" | "approved" | "merged";
}

export interface Ticket {
  key: string; // "AP-12"
  productKey: string;
  title: string;
  type: TicketType;
  statusId: string;
  assigneeIds?: string[]; // everyone on it — any number of people; none = unassigned
  priority: Priority;
  estimateH: number;
  due?: string; // ISO date
  requirementId?: string;
  sprint?: string;
  pr?: PullRequest;
  createdBy?: string;
  /** Epics only: epics have no status (they always sit in the Epic list) — they get a colour instead. */
  color?: string;
  /** Tasks and bugs: the epic they belong to (same product). */
  epicKey?: string;
  /** Filled-in template sections, by section id (see lib/templates.ts — the template itself is fixed in code). */
  sections?: TicketSections;
  /** Tickets that must be finished first ("blocked by"). */
  dependsOn?: string[];
  /** Images; the bytes live in the browser's file store (lib/files.ts), only metadata is here. */
  attachments?: Attachment[];
  // Archived: out of every board, list and count; read-only and hidden from developers — until restored.
  archivedAt?: string; // ISO time
  archivedBy?: string; // person id
}

/** One line of a list or checklist section. */
export interface SectionItem { id: string; text: string; done?: boolean }
export type SectionValue = string | SectionItem[];
export type TicketSections = Record<string, SectionValue>;

export interface Attachment {
  id: string;
  name: string;
  type: string; // image/webp, image/png…
  size: number; // bytes, after compression
  width: number;
  height: number;
  addedBy: string;
  addedAt: string;
}

/** draft: the team's, still being written · proposed: asked for by the client · to_confirm / changes_requested:
 *  with the client · confirmed · dropped: out of scope, kept. */
export type RequirementStatus = "draft" | "proposed" | "to_confirm" | "changes_requested" | "confirmed" | "dropped";

/** What was confirmed, as it read then — kept when the requirement is changed afterwards. */
export interface RequirementVersion { rev: number; title: string; description: string; criteria: SectionItem[]; by: string; at: string }

/** Something the project must do for its client, with what counts as done; tickets link to it (ticket.requirementId). */
export interface Requirement {
  id: string; // "AP-R1"
  productKey: string;
  code: string; // "R1"
  title: string;
  description?: string; // Markdown
  criteria?: SectionItem[]; // acceptance criteria
  status?: RequirementStatus; // none = draft
  rev?: number; // bumped by every change to title, description or criteria; none = 1
  confirmed?: RequirementVersion;
  proposedBy?: string; // a client person, when the client asked for it
  droppedReason?: string;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
}

export type DecisionStatus = "proposed" | "accepted" | "rejected" | "superseded";

/** A decision record (ADR-style): what was decided, why, what else was weighed, what it means — and what it's linked to. */
export interface Decision {
  id: string;
  productKey: string;
  title: string;
  why: string; // the decision and its reasoning
  byId: string;
  date: string;
  status?: DecisionStatus; // none = accepted (decisions recorded before statuses existed)
  context?: string; // the problem or situation that called for it
  alternatives?: string; // options considered, and why not
  consequences?: string; // what it means: trade-offs, follow-ups
  ticketKeys?: string[];
  docIds?: string[];
  supersededBy?: string; // the decision that replaced this one
  updatedAt?: string;
  body?: string; // the decision written freely, as Markdown (headings, tables, images, @mentions…); none = the parts above
  label?: DecisionLabel; // a status of the team's own (e.g. Suspended), shown instead of the built-in one
  color?: string; // its sticky note's colour (#rrggbb); none = the status colour
  archivedAt?: string; // ISO time: hidden from the log, kept whole, back from Settings → Archived
  archivedBy?: string;
}

export interface DecisionLabel { name: string; color: string }

export interface Milestone {
  id: string;
  productKey: string;
  name: string;
  due: string;
  pct: number;
  lateDays: number;
}

export type DocKind = "Brief" | "Requirements" | "Design" | "Architecture" | "Meeting notes";

export interface Doc {
  id: string;
  productKey: string; // "" = the company's own space (stored as NULL)
  parentId?: string; // the page it sits under; none = top level of its space
  groupId?: string; // a top-level page's group in the sidebar (subpages go with their parent)
  kind: DocKind;
  title: string;
  icon?: string; // one emoji
  cover?: string; // a cover gradient's id
  link?: string; // the web link its body opens with (kept on save) — a Claude artifact's, say
  ownerId?: string; // a personal page (My docs): its owner's, private until shared (see docAccess.ts)
  sharedWith?: DocShare[]; // on a personal top page: the people it's shared with
  companyAccess?: "view" | "edit"; // on a personal top page: shared with everyone at the company
  isPublic?: boolean; // on a personal top page: anyone with its link can read it (the link itself is kept server side)
  template?: string; // the template it started from
  updated: string; // day of the last edit
  authorId: string;
  createdAt?: string;
  updatedAt?: string; // ISO; bumped by body saves at most every couple of minutes
  updatedBy?: string;
  rev?: number; // the body's revision as of updatedAt
  archivedAt?: string;
  archivedBy?: string;
}

/** Someone a personal page is shared with: to read it, or (edit) to write in it too. */
export interface DocShare { personId: string; edit?: boolean }

/** A named group of top-level pages in a docs space's sidebar (like project groups). */
export interface DocGroup { id: string; productKey: string; name: string }

export interface StageRequest {
  id: string;
  productKey: string;
  stage: Stage; // the stage being asked for
  requestedBy: string;
  at: string;
}

export interface Activity {
  id: string;
  ticketKey: string;
  at: string; // ISO datetime
  actorId: string;
  field: "Status" | "Assignee" | "Due date" | "Estimate" | "Created" | "Title" | "Description" | "Priority" | "Requirement" | "Colour"
    | "Type" | "Epic" | "Section" | "Dependency" | "Image" | "Archive";
  from?: string;
  to: string;
}

export interface Comment {
  id: string;
  ticketKey: string;
  authorId: string;
  at: string;
  body: string; // plain text, @Name mentions are highlighted
}

export interface Notification {
  id: string;
  personId: string; // whose inbox
  kind: "mention" | "assigned" | "approval" | "status" | "invite" | "shared";
  actorId: string;
  text: string;
  target: string; // ticket key, product key, or a page path ("/people")
  at: string;
  read: boolean;
  urgent?: boolean; // an @@mention: louder, and sent on WhatsApp too
}
