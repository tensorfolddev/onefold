// `npm run db:migrate`: applies new migrations (drizzle/) as the database owner, then makes sure the app's login role
// exists, has DATABASE_URL's password, and belongs to onefold_app (rows only: no schema changes, no bypassing
// row-level security, no editing the audit log). Pending migrations run in one transaction: all or nothing.
//   DATABASE_ADMIN_URL — the owner (used only here)        DATABASE_URL — the app's own login
import { fileURLToPath } from "node:url";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const MIGRATIONS = fileURLToPath(new URL("../../../drizzle", import.meta.url));

export async function migrateDatabase(adminUrl: string, appUrl: string) {
  const role = decodeURIComponent(new URL(appUrl).username);
  const password = decodeURIComponent(new URL(appUrl).password);
  if (!role || !password) throw new Error("DATABASE_URL must include the app's user and password");
  if (role === decodeURIComponent(new URL(adminUrl).username)) throw new Error("DATABASE_URL must use its own user, not the owner");

  const pool = new pg.Pool({ connectionString: adminUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });
    // Role statements can't take parameters, so format() quotes the name (%I) and the password (%L) server-side.
    const run = async (template: string, ...args: string[]) => {
      const placeholders = args.map((_, i) => `$${i + 2}::text`).join(", ");
      const { rows } = await pool.query(`select format($1::text, ${placeholders}) as q`, [template, ...args]);
      await pool.query(rows[0].q);
    };
    const exists = (await pool.query("select 1 from pg_roles where rolname = $1", [role])).rowCount;
    await run(`${exists ? "ALTER" : "CREATE"} ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L`, role, password);
    await run("GRANT onefold_app TO %I", role);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { DATABASE_ADMIN_URL, DATABASE_URL } = process.env;
  if (!DATABASE_ADMIN_URL || !DATABASE_URL) {
    console.error("Set DATABASE_ADMIN_URL and DATABASE_URL (see .env.example)");
    process.exit(1);
  }
  migrateDatabase(DATABASE_ADMIN_URL, DATABASE_URL).then(
    () => console.log("Database is up to date"),
    (e: unknown) => { console.error("Migration failed:", e); process.exit(1); },
  );
}
