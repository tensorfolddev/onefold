// Server tests: each test file gets its own freshly migrated database, dropped afterwards.
// Needs Postgres: locally `npm run db:up`; CI provides a service container. TEST_DATABASE_ADMIN_URL overrides the default.
import { randomBytes } from "node:crypto";
import pg from "pg";
import { closeDatabase, database } from "../db/client.ts";
import { migrateDatabase } from "../db/migrate.ts";

const ADMIN = process.env.TEST_DATABASE_ADMIN_URL ?? "postgres://onefold_admin:dev-only-admin-password@127.0.0.1:5433/onefold";

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: ADMIN });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

/** Creates and migrates a throwaway database and points the app's connection at it. Call `drop` when done. */
export async function freshDatabase() {
  const name = `onefold_test_${randomBytes(4).toString("hex")}`;
  await admin((c) => c.query(`create database ${name}`));
  const adminUrl = Object.assign(new URL(ADMIN), { pathname: `/${name}` }).toString();
  const appUrl = Object.assign(new URL(adminUrl), { username: "onefold_test_app", password: "test-only-app-password" }).toString();
  await migrateDatabase(adminUrl, appUrl);
  await closeDatabase();
  database(appUrl);
  return {
    adminUrl,
    /** Runs SQL as the owner — for checks the app itself must not be able to do. */
    asOwner: async <T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) => {
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      try { return (await c.query<T>(sql, params)).rows; } finally { await c.end(); }
    },
    drop: async () => {
      await closeDatabase();
      await admin((c) => c.query(`drop database if exists ${name} with (force)`));
    },
  };
}
