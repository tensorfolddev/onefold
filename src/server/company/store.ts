// Load a company from the database, and save a changed copy back — writing only the rows that changed (a reordered
// list rewrites only what moved). Both run inside an `inScope` transaction for that company; saving needs the lock.
import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "../../data/db.ts";
import type { Tx } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { assignPositions } from "./positions.ts";
import { fromRows, instant, orgRow, POSITIONED, stableJson, TABLES, toRows, type OrgRow, type Row, type TableName } from "./rows.ts";

/** Every company table has org_id + id; the rest of its columns vary, so rows are handled generically here. */
type CompanyTable = PgTable & { orgId: AnyPgColumn; id: AnyPgColumn };
const TABLE = {
  members: s.members, invites: s.invites, teams: s.teams, jobTitles: s.jobTitles, productGroups: s.productGroups,
  products: s.products, productMembers: s.productMembers, boardLists: s.boardLists, requirements: s.requirements,
  decisions: s.decisions, milestones: s.milestones, docs: s.docs, stageRequests: s.stageRequests, tickets: s.tickets,
  ticketDependencies: s.ticketDependencies, attachments: s.attachments, comments: s.comments, activity: s.activity,
  notifications: s.notifications,
} as unknown as Record<TableName, CompanyTable>;
const CHUNK = 500; // rows per insert statement (well under Postgres' parameter limit)

/** A loaded company: its data, plus the rows as stored (to diff against when saving). */
export interface Loaded {
  db: Db;
  version: number;
  org: OrgRow;
  rows: Record<TableName, Row[]>;
  /** member id → login (users.id) */
  userIds: ReadonlyMap<string, string>;
}

// Postgres returns timestamptz as "2026-10-15 04:41:07+00"; keep the one spelling the app uses everywhere.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;
const tidy = (row: Record<string, unknown>): Row =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" && TIMESTAMP.test(v) ? instant(v) : v])) as Row;

export async function loadCompany(tx: Tx, orgId: string): Promise<Loaded | null> {
  const [org] = await tx.select().from(s.orgs).where(eq(s.orgs.id, orgId));
  if (!org) return null;
  const rows = {} as Record<TableName, Row[]>;
  for (const t of TABLES) {
    const table = TABLE[t];
    rows[t] = (await tx.select().from(table).where(eq(table.orgId, orgId)) as Record<string, unknown>[]).map(tidy);
  }
  const logins = await tx.select({ id: s.members.id, userId: s.users.id, email: s.users.email })
    .from(s.members).innerJoin(s.users, eq(s.users.id, s.members.userId)).where(eq(s.members.orgId, orgId));
  const orgData: OrgRow = {
    id: org.id, slug: org.slug, name: org.name, emailDomain: org.emailDomain, domainLock: org.domainLock,
    createdAt: org.createdAt, createdBy: org.createdBy,
  };
  return {
    db: fromRows(orgData, rows, new Map(logins.map((l) => [l.id, l.email]))),
    version: org.version, org: orgData, rows,
    userIds: new Map(logins.map((l) => [l.id, l.userId])),
  };
}

/**
 * Saves `next` over `before` (null for a brand-new company) and returns the company's new version.
 * `newLogins` gives the login (users.id) of each person who wasn't in `before` — sign-up and invite acceptance.
 */
export async function saveCompany(tx: Tx, before: Loaded | null, next: Db, newLogins: Readonly<Record<string, string>> = {}): Promise<number> {
  const orgId = next.org.id;
  if (before && before.org.id !== orgId) throw new Error("Can't save one company over another");
  const org = orgRow(next);
  if (!before) await tx.insert(s.orgs).values({ ...org, version: 0 });
  else if (stableJson(before.org) !== stableJson(org)) await tx.update(s.orgs).set(org).where(eq(s.orgs.id, orgId));

  const target = toRows(next);
  for (const t of TABLES) {
    const old = before?.rows[t] ?? [];
    let rows = target[t];
    if (t === "members") {
      rows = rows.map((r) => {
        const userId = before?.userIds.get(r.id) ?? newLogins[r.id];
        if (!userId) throw new Error(`No login for new person ${r.id}`);
        return { ...r, userId };
      });
    }
    if (POSITIONED.has(t)) {
      const positions = assignPositions(rows.map((r) => r.id), new Map(old.map((r) => [r.id, r.position as number])));
      rows = rows.map((r) => ({ ...r, position: positions.get(r.id) }));
    }
    const oldById = new Map(old.map((r) => [r.id, stableJson(r)]));
    const keep = new Set(rows.map((r) => r.id));
    const gone = old.filter((r) => !keep.has(r.id)).map((r) => r.id);
    const changed = rows.filter((r) => oldById.get(r.id) !== stableJson(r));
    const table = TABLE[t];
    if (gone.length) await tx.delete(table).where(and(eq(table.orgId, orgId), inArray(table.id, gone)));
    for (let i = 0; i < changed.length; i += CHUNK) {
      await tx.insert(table).values(changed.slice(i, i + CHUNK) as never).onConflictDoUpdate({ target: [table.orgId, table.id], set: excludedColumns(table) });
    }
  }

  const [{ version }] = await tx.update(s.orgs).set({ version: sql`${s.orgs.version} + 1` }).where(eq(s.orgs.id, orgId)).returning({ version: s.orgs.version });
  return version;
}

/** `SET col = excluded.col` for every column except the key — an upsert that replaces the row. */
function excludedColumns(table: PgTable) {
  return Object.fromEntries(Object.entries(getTableColumns(table))
    .filter(([key]) => key !== "orgId" && key !== "id")
    .map(([key, column]) => [key, sql.raw(`excluded."${column.name}"`)]));
}
