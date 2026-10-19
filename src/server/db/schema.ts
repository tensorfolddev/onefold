// The database tables. Company data mirrors the domain types (src/domain/types.ts); every company table has
// org_id + id as its key and row-level security on org_id (drizzle/0001_security.sql adds the foreign keys,
// policies and grants). Logins live in users/sessions, outside any company.
//
// Rules (docs/specs/2026-10-15-backend-v1-design.md §12): migrations only ADD things; never drop or rename a column
// the running release uses. Times are timestamptz (UTC), dates are plain dates, ordered lists keep a `position`.
import { sql } from "drizzle-orm";
import { bigserial, boolean, doublePrecision, index, integer, jsonb, pgPolicy, pgTable, primaryKey, text, timestamp, date, uniqueIndex } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "string" });
const day = (name: string) => date(name, { mode: "string" });
/** org_id + id: every company table's key. */
const keyed = { orgId: text("org_id").notNull(), id: text("id").notNull() };
/** Order within a list (fractional, so moving one item rewrites one row). */
const position = () => doublePrecision("position").notNull();

// ---------- logins (no company) ----------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(), // lowercase
  passwordHash: text("password_hash").notNull(), // Argon2id, encoded with its own salt
  emailVerifiedAt: ts("email_verified_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("users_email").on(t.email)]);

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // SHA-256 of the cookie's token — the token itself is never stored
  userId: text("user_id").notNull().references(() => users.id),
  orgId: text("org_id").notNull(), // the company this session is signed in to
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  revokedAt: ts("revoked_at"),
}, (t) => [index("sessions_user").on(t.userId)]);

/** Links we email: "reset your password" (an hour, once) and "confirm your email" (a week). Only token hashes. */
export const emailTokens = pgTable("email_tokens", {
  id: text("id").primaryKey(), // SHA-256 of the emailed token
  userId: text("user_id").notNull().references(() => users.id),
  purpose: text("purpose").notNull(), // reset | verify
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
}, (t) => [index("email_tokens_user").on(t.userId)]);

// ---------- company ----------

export const orgs = pgTable("orgs", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  emailDomain: text("email_domain").notNull(),
  domainLock: boolean("domain_lock").notNull(),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  createdAt: day("created_at").notNull(),
  createdBy: text("created_by").notNull(),
  version: integer("version").notNull().default(0), // bumped by every change; browsers refetch when it moves
}, (t) => [uniqueIndex("orgs_slug").on(t.slug)]);

export const members = pgTable("members", {
  ...keyed,
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  color: text("color").notNull(),
  role: text("role").notNull(), // job title
  team: text("team").notNull(), // team id, "leadership", or "" for none
  capacityH: doublePrecision("capacity_h").notNull(),
  panel: text("panel"), // admin | manager | developer; null = can't sign in
  active: boolean("active").notNull(),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), uniqueIndex("members_org_user").on(t.orgId, t.userId), index("members_user").on(t.userId)]);

export const invites = pgTable("invites", {
  ...keyed,
  tokenHash: text("token_hash").notNull(),
  email: text("email").notNull(),
  panel: text("panel").notNull(),
  role: text("role").notNull(),
  invitedBy: text("invited_by").notNull(),
  createdAt: ts("created_at").notNull(),
  acceptedAt: ts("accepted_at"),
  revokedAt: ts("revoked_at"),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), uniqueIndex("invites_token_hash").on(t.tokenHash)]);

export const teams = pgTable("teams", {
  ...keyed,
  name: text("name").notNull(),
  leadId: text("lead_id"),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const jobTitles = pgTable("job_titles", { ...keyed, position: position() }, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const productGroups = pgTable("product_groups", {
  ...keyed,
  name: text("name").notNull(),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

// ---------- products ----------

export const products = pgTable("products", {
  ...keyed, // id = the product key, "AP"
  name: text("name").notNull(),
  type: text("type").notNull(),
  client: text("client"),
  stage: text("stage").notNull(),
  health: text("health").notNull(),
  pmId: text("pm_id").notNull(),
  projectManagerId: text("project_manager_id").notNull(),
  color: text("color").notNull(),
  description: text("description").notNull(),
  waitingApproval: text("waiting_approval"),
  icon: jsonb("icon"),
  priorities: jsonb("priorities"), // this project's own names/colours for the four priority levels
  groupId: text("group_id"),
  createdAt: day("created_at").notNull(),
  archivedAt: ts("archived_at"), // set = archived: read-only, hidden from developers
  archivedBy: text("archived_by"),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const productMembers = pgTable("product_members", {
  ...keyed, // id = "<product>:<member>"
  productId: text("product_id").notNull(),
  memberId: text("member_id").notNull(),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("product_members_member").on(t.orgId, t.memberId)]);

export const boardLists = pgTable("board_lists", {
  ...keyed,
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  tone: text("tone").notNull(),
  system: text("system"), // epic | backlog
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("board_lists_product").on(t.orgId, t.productId)]);

export const requirements = pgTable("requirements", {
  ...keyed,
  productId: text("product_id").notNull(),
  code: text("code").notNull(),
  title: text("title").notNull(),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const decisions = pgTable("decisions", {
  ...keyed,
  productId: text("product_id").notNull(),
  title: text("title").notNull(),
  why: text("why").notNull(),
  byId: text("by_id").notNull(),
  date: day("date").notNull(),
  status: text("status"), // proposed | accepted | rejected | superseded; NULL = accepted
  context: text("context"),
  alternatives: text("alternatives"),
  consequences: text("consequences"),
  ticketKeys: jsonb("ticket_keys"),
  docIds: jsonb("doc_ids"),
  supersededBy: text("superseded_by"),
  updatedAt: ts("updated_at"),
  body: text("body"), // the decision written freely, as Markdown; NULL = only the parts above
  labelName: text("label_name"), // the team's own status label (e.g. Suspended), with its colour
  labelColor: text("label_color"),
  color: text("color"), // the sticky note's colour
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const milestones = pgTable("milestones", {
  ...keyed,
  productId: text("product_id").notNull(),
  name: text("name").notNull(),
  due: day("due").notNull(),
  pct: doublePrecision("pct").notNull(),
  lateDays: integer("late_days").notNull(),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const docs = pgTable("docs", {
  ...keyed,
  productId: text("product_id"), // NULL = the company's own space
  parentId: text("parent_id"),
  groupId: text("group_id"),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  icon: text("icon"),
  cover: text("cover"),
  template: text("template"),
  updated: day("updated").notNull(),
  authorId: text("author_id").notNull(),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
  updatedBy: text("updated_by"),
  rev: integer("rev"),
  archivedAt: ts("archived_at"),
  archivedBy: text("archived_by"),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("docs_parent").on(t.orgId, t.parentId)]);

/** Groups of pages in a docs space's sidebar. */
export const docGroups = pgTable("doc_groups", {
  ...keyed,
  productId: text("product_id"), // NULL = the company's own space
  name: text("name").notNull(),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), companyRows()]);

function companyRows() {
  return pgPolicy("company_rows", {
    for: "all",
    using: sql`org_id = current_setting('app.org_id', true)`,
    withCheck: sql`org_id = current_setting('app.org_id', true)`,
  });
}

/** A doc's text (Markdown), one row per doc, loaded only when someone opens it. `rev` guards against overwrites. */
export const docBodies = pgTable("doc_bodies", {
  orgId: text("org_id").notNull(),
  docId: text("doc_id").notNull(),
  body: text("body").notNull(),
  rev: integer("rev").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  updatedBy: text("updated_by"),
}, (t) => [primaryKey({ columns: [t.orgId, t.docId] }), companyRows()]);

/** Images and files in docs (the bytes live on disk like ticket images): which doc each belongs to, for access. */
export const docFiles = pgTable("doc_files", {
  ...keyed,
  docId: text("doc_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // what the bytes are (images by their header); other files are served as downloads
  size: integer("size").notNull(),
  uploadedBy: text("uploaded_by"),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("doc_files_doc").on(t.orgId, t.docId), companyRows()]);

/** Images and files in a decision's text (bytes on disk, like a doc's): which decision each belongs to, for access. */
export const decisionFiles = pgTable("decision_files", {
  ...keyed,
  decisionId: text("decision_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  uploadedBy: text("uploaded_by"),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("decision_files_decision").on(t.orgId, t.decisionId), companyRows()]);

/** What each doc's body points at — people (mentions), tickets and docs — rebuilt on every save: backlinks and notices. */
export const docLinks = pgTable("doc_links", {
  orgId: text("org_id").notNull(),
  docId: text("doc_id").notNull(),
  kind: text("kind").notNull(), // person | ticket | doc
  target: text("target").notNull(),
}, (t) => [primaryKey({ columns: [t.orgId, t.docId, t.kind, t.target] }), index("doc_links_target").on(t.orgId, t.kind, t.target), companyRows()]);

/** Web page previews (title, image…) for link cards, shared by every company: the same page looks the same to all. */
export const linkPreviews = pgTable("link_previews", {
  urlHash: text("url_hash").primaryKey(), // SHA-256 of the URL
  url: text("url").notNull(),
  data: jsonb("data").notNull(),
  fetchedAt: ts("fetched_at").notNull().defaultNow(),
});

/** Earlier versions of a doc: one per author per ten minutes of editing, plus one before every overwrite or restore. */
export const docVersions = pgTable("doc_versions", {
  ...keyed,
  docId: text("doc_id").notNull(),
  rev: integer("rev").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  authorId: text("author_id"),
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("doc_versions_doc").on(t.orgId, t.docId, t.at), companyRows()]);

export const stageRequests = pgTable("stage_requests", {
  ...keyed,
  productId: text("product_id").notNull(),
  stage: text("stage").notNull(),
  requestedBy: text("requested_by").notNull(),
  at: ts("at").notNull(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

// ---------- tickets ----------

export const tickets = pgTable("tickets", {
  ...keyed, // id = the ticket key, "AP-12"
  productId: text("product_id").notNull(),
  title: text("title").notNull(),
  type: text("type").notNull(),
  statusId: text("status_id").notNull(),
  assigneeId: text("assignee_id"), // the first assignee — kept for older code
  assigneeIds: text("assignee_ids").array(), // everyone on the ticket
  priority: text("priority").notNull(),
  estimateH: doublePrecision("estimate_h").notNull(),
  due: day("due"),
  requirementId: text("requirement_id"),
  sprint: text("sprint"),
  pr: jsonb("pr"),
  createdBy: text("created_by"),
  color: text("color"),
  epicId: text("epic_id"),
  sections: jsonb("sections"), // the fixed template's filled-in sections, by section id
  archivedAt: ts("archived_at"), // set = archived: off every board, read-only, hidden from developers
  archivedBy: text("archived_by"),
  position: position(), // board order
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("tickets_product").on(t.orgId, t.productId), index("tickets_assignee").on(t.orgId, t.assigneeId)]);

export const ticketDependencies = pgTable("ticket_dependencies", {
  ...keyed, // id = "<ticket>:<depends on>"
  ticketId: text("ticket_id").notNull(),
  dependsOnId: text("depends_on_id").notNull(),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] })]);

export const attachments = pgTable("attachments", {
  ...keyed,
  ticketId: text("ticket_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  size: integer("size").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  addedBy: text("added_by").notNull(),
  addedAt: ts("added_at").notNull(),
  position: position(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("attachments_ticket").on(t.orgId, t.ticketId)]);

export const comments = pgTable("comments", {
  ...keyed,
  ticketId: text("ticket_id").notNull(),
  authorId: text("author_id").notNull(),
  at: ts("at").notNull(),
  body: text("body").notNull(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("comments_ticket").on(t.orgId, t.ticketId)]);

export const activity = pgTable("activity", {
  ...keyed,
  ticketId: text("ticket_id").notNull(),
  at: ts("at").notNull(),
  actorId: text("actor_id").notNull(),
  field: text("field").notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value").notNull(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("activity_ticket").on(t.orgId, t.ticketId)]);

export const notifications = pgTable("notifications", {
  ...keyed,
  personId: text("person_id").notNull(),
  kind: text("kind").notNull(),
  actorId: text("actor_id").notNull(),
  text: text("text").notNull(),
  target: text("target").notNull(),
  at: ts("at").notNull(),
  read: boolean("read").notNull(),
}, (t) => [primaryKey({ columns: [t.orgId, t.id] }), index("notifications_person").on(t.orgId, t.personId)]);

// ---------- platform ----------

/** The company as it was before someone's last undoable change. "Undo" puts it back — only if nothing changed since. */
export const undoPoints = pgTable("undo_points", {
  orgId: text("org_id").notNull(),
  userId: text("user_id").notNull(),
  version: integer("version").notNull(), // the company version right after that change
  before: jsonb("before").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.orgId, t.userId] }),
  pgPolicy("company_rows", {
    for: "all",
    using: sql`org_id = current_setting('app.org_id', true)`,
    withCheck: sql`org_id = current_setting('app.org_id', true)`,
  }),
]);

// ---------- MCP ----------

/**
 * Personal API tokens for MCP clients (Claude Code, Claude Desktop…): each acts as the person who made it, in that
 * company, with their permissions. Shown once; only the hash is kept. No row-level security: a request arrives with
 * only the token, before anyone knows the company — like sessions.
 */
export const apiTokens = pgTable("api_tokens", {
  id: text("id").primaryKey(), // SHA-256 of the token
  orgId: text("org_id").notNull(),
  memberId: text("member_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(), // "Claude Code on my laptop"
  hint: text("hint").notNull(), // the token's last 4 characters, to tell tokens apart
  createdAt: ts("created_at").notNull().defaultNow(),
  lastUsedAt: ts("last_used_at"),
  revokedAt: ts("revoked_at"),
}, (t) => [index("api_tokens_member").on(t.orgId, t.memberId)]);

// ---------- WhatsApp (platform tables: the worker reads them across companies, so no row-level security) ----------

/** The bot — one per environment, on its own number. What the worker last saw, and what an admin asked it to do. */
export const whatsappBot = pgTable("whatsapp_bot", {
  id: integer("id").primaryKey(), // always 1
  state: text("state").notNull(), // off | pairing | connecting | connected | logged_out
  qr: text("qr"), // while pairing: what the QR code shows
  phone: text("phone"), // the bot's own number, once connected
  request: text("request"), // pair | logout — set by a platform admin, cleared by the worker
  alertedAt: ts("alerted_at"), // when admins were last emailed that the bot lost its connection
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** A teammate's WhatsApp chat, per company they're in. Only ever made by them messaging the bot first. */
export const whatsappLinks = pgTable("whatsapp_links", {
  orgId: text("org_id").notNull(),
  memberId: text("member_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  jid: text("jid").notNull(), // the chat the bot answers in
  phone: text("phone").notNull(), // digits, for showing; "" when WhatsApp only gave us a private id
  briefs: boolean("briefs").notNull().default(true), // the daily brief (STOP / START)
  linkedAt: ts("linked_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.memberId] }), index("whatsapp_links_jid").on(t.jid)]);

/** Messages waiting for the bot to send (e.g. "Ayla mentioned you in Design spec"): the worker sends them within seconds. */
export const whatsappOutbox = pgTable("whatsapp_outbox", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  jid: text("jid").notNull(),
  text: text("text").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  sentAt: ts("sent_at"),
  attempts: integer("attempts").notNull().default(0),
}, (t) => [index("whatsapp_outbox_pending").on(t.sentAt, t.id)]);

/** The one-time code a teammate sends the bot to link their number ("1FOLD-7K2QXM"). Only its hash is kept. */
export const whatsappLinkCodes = pgTable("whatsapp_link_codes", {
  id: text("id").primaryKey(), // SHA-256 of the code
  orgId: text("org_id").notNull(),
  memberId: text("member_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

/** One daily brief per person per day, however it went — so a restart never sends it twice. */
export const briefDeliveries = pgTable("brief_deliveries", {
  orgId: text("org_id").notNull(),
  memberId: text("member_id").notNull(),
  day: day("day").notNull(), // the company's local date
  channel: text("channel").notNull(), // pending | whatsapp | email | none (nothing to tell)
  at: ts("at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.orgId, t.memberId, t.day] })]);

/** Every change, who made it and from where. Append-only: the app role can't update or delete rows. */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  orgId: text("org_id").notNull(),
  actorId: text("actor_id"), // member id; null for sign-up before the founder exists
  userId: text("user_id"),
  source: text("source").notNull(), // web | mcp | whatsapp | system
  command: text("command").notNull(),
  args: jsonb("args").notNull(),
  at: ts("at").notNull().defaultNow(),
}, (t) => [index("audit_log_org_at").on(t.orgId, t.at)]);
