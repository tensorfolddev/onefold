// Real Postgres: needs `npm run db:up` locally (CI starts its own). Each file gets a fresh database.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "../../data/db.ts";
import { demoDb } from "../../data/demo.ts";
import { archiveTickets, deleteTickets, moveTicket, signUp, updateTicket } from "../../domain/commands/index.ts";
import { inScope } from "../db/client.ts";
import * as s from "../db/schema.ts";
import { freshDatabase } from "../testing/db.ts";
import { POSITIONED, stableJson, TABLES, toRows, type Row, type TableName } from "./rows.ts";
import { loadCompany, saveCompany } from "./store.ts";

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg.drop(); });

/** Saves a new company, creating a login for each person (what sign-up and invites will do). */
async function create(company: Db) {
  const logins = Object.fromEntries(company.people.map((p) => [p.id, `usr-${randomUUID()}`]));
  return inScope({ orgId: company.org.id, lock: true }, async (tx) => {
    await tx.insert(s.users).values(company.people.map((p) => ({ id: logins[p.id], email: p.email, passwordHash: "test" })));
    return saveCompany(tx, null, company, logins);
  });
}
const load = (orgId: string) => inScope({ orgId }, async (tx) => (await loadCompany(tx, orgId))!);
const omit = (row: Row, ...keys: string[]) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)));
const comparable = (t: TableName, rows: Row[]) =>
  (POSITIONED.has(t) ? rows : [...rows].sort((a, b) => a.id.localeCompare(b.id))).map((r) => omit(r, "position", "userId"));
const writtenInThisTransaction = sql`xmin::text = (pg_current_xact_id()::text::bigint % 4294967296)::text`;
/** Drizzle wraps Postgres errors ("Failed query: …"); the database's own reason is in `cause`. */
const refusedWith = (work: Promise<unknown>, reason: RegExp) =>
  assert.rejects(work, (e: unknown) => reason.test(String((e as { cause?: unknown }).cause ?? e)));

const demo = demoDb();
const admin = demo.people.find((p) => p.id === "u-tayyab")!;

test("a whole company goes into Postgres and comes back the same", async () => {
  assert.equal(await create(demo), 1);
  const loaded = await load(demo.org.id);
  assert.equal(loaded.version, 1);
  for (const t of TABLES) assert.equal(stableJson(comparable(t, toRows(loaded.db)[t])), stableJson(comparable(t, toRows(demo)[t])), t);
  assert.deepEqual(loaded.db.people.map((p) => p.email), demo.people.map((p) => p.email));
  assert.deepEqual(loaded.db.tickets.map((t) => t.key), demo.tickets.map((t) => t.key));
});

test("moving one card rewrites one ticket row; the version goes up", async () => {
  const before = await load(demo.org.id);
  const ticket = before.db.tickets.find((t) => t.key === "AP-12")!;
  const done = before.db.statusesByProduct.AP.find((st) => st.category === "done")!;
  const next = moveTicket(before.db, admin, ticket.key, done.id);
  const { version, ticketsWritten } = await inScope({ orgId: demo.org.id, lock: true }, async (tx) => {
    const v = await saveCompany(tx, before, next);
    const [{ n }] = (await tx.execute(sql`select count(*)::int as n from tickets where ${writtenInThisTransaction}`)).rows as { n: number }[];
    return { version: v, ticketsWritten: n };
  });
  assert.equal(version, before.version + 1);
  assert.equal(ticketsWritten, 1);
  const after = await load(demo.org.id);
  assert.equal(after.db.tickets.find((t) => t.key === "AP-12")!.statusId, done.id);
  assert.deepEqual(after.db.tickets.map((t) => t.key), next.tickets.map((t) => t.key));
});

test("one company can't read or write another's rows, even by asking for them", async () => {
  const other = signUp({ name: "Bo Lee", email: "bo@beta.example", company: "Beta Works", slug: "beta-works" }, () => false).db;
  await create(other);
  await inScope({ orgId: demo.org.id }, async (tx) => {
    const theirPeople = await tx.execute(sql`select id from members where org_id = ${other.org.id}`);
    assert.equal(theirPeople.rows.length, 0);
    const theirCompany = await tx.execute(sql`select id from orgs where id = ${other.org.id}`);
    assert.equal(theirCompany.rows.length, 0);
  });
  await refusedWith(
    inScope({ orgId: demo.org.id }, (tx) => tx.execute(sql`insert into job_titles (org_id, id, position) values (${other.org.id}, 'Spy', 1)`)),
    /row-level security/,
  );
  const unscoped = await inScope({}, (tx) => tx.execute(sql`select count(*)::int as n from tickets`));
  assert.equal((unscoped.rows[0] as { n: number }).n, 0);
});

test("the audit log can be added to, never edited or deleted", async () => {
  await inScope({ orgId: demo.org.id }, (tx) => tx.insert(s.auditLog).values({ orgId: demo.org.id, source: "system", command: "test", args: {} }));
  await refusedWith(inScope({ orgId: demo.org.id }, (tx) => tx.execute(sql`update audit_log set command = 'x'`)), /permission denied/);
  await refusedWith(inScope({ orgId: demo.org.id }, (tx) => tx.execute(sql`delete from audit_log`)), /permission denied/);
});

test("the database refuses broken links, and nothing half-saves", async () => {
  const before = await load(demo.org.id);
  const renamed = updateTicket(before.db, admin, "AP-12", { title: "Renamed" });
  const broken = { ...renamed, tickets: renamed.tickets.map((t) => (t.key === "AP-12" ? { ...t, statusId: "no-such-list" } : t)) };
  await refusedWith(inScope({ orgId: demo.org.id, lock: true }, (tx) => saveCompany(tx, before, broken)), /foreign key/);
  const after = await load(demo.org.id);
  assert.equal(after.version, before.version);
  assert.notEqual(after.db.tickets.find((t) => t.key === "AP-12")!.title, "Renamed");
});

test("deleting tickets removes their rows, comments and activity", async () => {
  const before = await load(demo.org.id);
  const victim = before.db.tickets.find((t) => before.db.comments.some((c) => c.ticketKey === t.key))!;
  await inScope({ orgId: demo.org.id, lock: true }, (tx) => saveCompany(tx, before, deleteTickets(archiveTickets(before.db, admin, [victim.key]), admin, [victim.key], `Delete ${victim.key}`)));
  const counts = await pg.asOwner<{ t: number; c: number }>(
    "select (select count(*) from tickets where id = $1)::int as t, (select count(*) from comments where ticket_id = $1)::int as c", [victim.key]);
  assert.deepEqual(counts[0], { t: 0, c: 0 });
});
