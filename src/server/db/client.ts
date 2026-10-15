// The app's database connection and its only door into data: `inScope`, one transaction with row-level security set
// to a company (and/or a signed-in user, or an invite being opened). Writes to a company take that company's lock,
// so two changes never interleave and nothing is lost.
import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.ts";

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// One pool per process; kept on globalThis so dev hot-reloads don't open a new pool each time.
const holder = globalThis as unknown as { __onefoldDb?: { pool: pg.Pool; db: Database } };

/** The connection for DATABASE_URL (the app's restricted login, never the owner). */
export function database(url = process.env.DATABASE_URL): Database {
  if (!holder.__onefoldDb) {
    if (!url) throw new Error("DATABASE_URL is not set");
    const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DATABASE_POOL_SIZE ?? 10), options: "-c TimeZone=UTC" });
    holder.__onefoldDb = { pool, db: drizzle(pool, { schema }) };
  }
  return holder.__onefoldDb.db;
}

export async function closeDatabase() {
  const current = holder.__onefoldDb;
  holder.__onefoldDb = undefined;
  await current?.pool.end();
}

export interface Scope {
  orgId?: string; // the company this transaction may see
  userId?: string; // also lets it see this user's memberships in other companies (sign-in)
  inviteTokenHash?: string; // also lets it open this one invite (invite links)
  lock?: boolean; // serialise writes to orgId
}

/** Runs `fn` in one transaction that can only see `scope`. */
export function inScope<T>(scope: Scope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return database().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${scope.orgId ?? ""}, true),
      set_config('app.user_id', ${scope.userId ?? ""}, true),
      set_config('app.invite_token_hash', ${scope.inviteTokenHash ?? ""}, true)`);
    if (scope.lock) {
      if (!scope.orgId) throw new Error("A locked scope needs an orgId");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${scope.orgId}))`);
    }
    return fn(tx);
  });
}
