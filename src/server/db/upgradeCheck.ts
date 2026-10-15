// Upgrade checks (design §12.4), for CI's upgrade test and deploy/restore-test.sh:
//   node src/server/db/upgradeCheck.ts seed                 — saves the sample company (CI only), so an upgrade has data
//   node src/server/db/upgradeCheck.ts count > before.json  — rows in every table
//   node src/server/db/upgradeCheck.ts verify [before.json] — no table lost rows, and with this code every company still
//                                                             loads and every member's view still builds
// DATABASE_ADMIN_URL counts and lists companies (as the owner, past row-level security); DATABASE_URL loads them the
// way the app does. Exits 1 with the problems listed.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { demoDb } from "../../data/demo.ts";
import { snapshotFor } from "../../domain/snapshot.ts";
import { loadCompany, saveCompany } from "../company/store.ts";
import { closeDatabase, inScope } from "./client.ts";
import * as s from "./schema.ts";

async function asOwner<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_ADMIN_URL;
  if (!url) throw new Error("Set DATABASE_ADMIN_URL");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

/** Rows per table in the app's schema. */
export function countRows(): Promise<Record<string, number>> {
  return asOwner(async (c) => {
    const { rows } = await c.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by tablename");
    const counts: Record<string, number> = {};
    for (const { tablename } of rows) {
      counts[tablename] = Number((await c.query<{ n: string }>(`select count(*) as n from "${tablename.replace(/"/g, '""')}"`)).rows[0].n);
    }
    return counts;
  });
}

async function seed() {
  if (process.env.NODE_ENV === "production") throw new Error("seed is for CI's upgrade test — never a real environment");
  const company = demoDb();
  const logins = Object.fromEntries(company.people.map((p) => [p.id, `usr-${randomUUID()}`]));
  await inScope({ orgId: company.org.id, lock: true }, async (tx) => {
    await tx.insert(s.users).values(company.people.map((p) => ({ id: logins[p.id], email: p.email, passwordHash: "not-a-login" })));
    await saveCompany(tx, null, company, logins);
  });
  console.log(`Saved the sample company: ${company.people.length} people, ${company.products.length} products, ${company.tickets.length} tickets`);
}

/** Problems found, or none: rows lost since `before`, companies that no longer load, views that no longer build. */
export async function verify(before?: Record<string, number>): Promise<string[]> {
  const problems: string[] = [];
  if (before) {
    const after = await countRows();
    for (const [table, n] of Object.entries(before)) {
      if (!(table in after)) problems.push(`table ${table} is gone (it had ${n} rows)`);
      else if (after[table] < n) problems.push(`${table}: ${n} rows before, ${after[table]} after`);
    }
  }
  const orgIds = await asOwner(async (c) => (await c.query<{ id: string }>("select id from orgs order by id")).rows.map((r) => r.id));
  let views = 0;
  for (const orgId of orgIds) {
    try {
      await inScope({ orgId }, async (tx) => {
        const loaded = await loadCompany(tx, orgId);
        if (!loaded) throw new Error("doesn't load");
        for (const person of loaded.db.people.filter((p) => p.active && p.panel)) {
          snapshotFor(loaded.db, person);
          views += 1;
        }
      });
    } catch (e) {
      problems.push(`company ${orgId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!problems.length) console.log(`OK: ${orgIds.length} companies load and ${views} people's views build`);
  return problems;
}

async function main(command: string | undefined, arg: string | undefined) {
  if (command === "seed") return seed();
  if (command === "count") return void console.log(JSON.stringify(await countRows(), null, 2));
  if (command === "verify") {
    const problems = await verify(arg ? JSON.parse(readFileSync(arg, "utf8")) : undefined);
    if (problems.length) {
      console.error(`Upgrade check failed:\n- ${problems.join("\n- ")}`);
      process.exitCode = 1;
    }
    return;
  }
  throw new Error("Usage: upgradeCheck.ts seed | count | verify [before.json]");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv[2], process.argv[3])
    .catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; })
    .finally(() => closeDatabase());
}
