// One company's backup, for its own Google Drive: everything of that company — and nothing of any other — as a .zip
// its admins can open: data.json (every table's rows, as Postgres writes them) and files/ (its uploads). No secrets
// ever: no passwords, logins, invite or API tokens, email keys or WhatsApp sessions.
// Restoring puts one company back exactly as its backup has it, in one transaction, touching no other company — a
// platform operator's job (it needs DATABASE_ADMIN_URL): src/server/backup/restore.ts.
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import JSZip from "jszip";
import pg from "pg";
import { sql } from "drizzle-orm";
import { inScope } from "../db/client.ts";
import { filesDir } from "../files.ts";

export const FORMAT = "1fold-company-backup";
export const VERSION = 1;

/** A company's tables in its backup: all of its data, parents before what refers to them (the org row and its
 * people's logins are added on their own). */
export const BACKED_UP = [
  "members", "teams", "job_titles", "product_groups", "products", "product_members", "board_lists", "requirements",
  "decisions", "decision_files", "milestones", "stage_requests", "tickets", "ticket_dependencies", "attachments",
  "comments", "activity", "notifications", "doc_groups", "docs", "doc_bodies", "doc_versions", "doc_files", "doc_links",
  "whatsapp_settings", "whatsapp_links", "brief_deliveries", "brief_sends", "audit_log",
] as const;
/** A company's tables never in its backup: secrets, and what only matters while it's running. */
export const NOT_BACKED_UP = new Set([
  "sessions", "invites", "api_tokens", "public_links", "company_email", "company_bots", "company_drive",
  "whatsapp_link_codes", "whatsapp_outbox", "undo_points",
]);

export interface CompanyBackupData {
  format: typeof FORMAT;
  version: number;
  orgId: string;
  orgName: string;
  createdAt: string;
  org: Record<string, unknown>;
  users: { id: string; email: string }[]; // its people's logins — never their passwords
  tables: Record<string, Record<string, unknown>[]>;
}

const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/;
const README = (d: CompanyBackupData) => [
  `A 1Fold backup of ${d.orgName}, made ${d.createdAt}.`,
  "",
  "data.json — every product, ticket, comment, doc (with every version), decision, milestone and person of the company.",
  "files/     — the images and files uploaded to its tickets, docs and decisions.",
  "",
  "No passwords or secrets are in it. To restore it, ask your 1Fold platform team.",
].join("\n");

async function filesOf(orgId: string): Promise<string[]> {
  const root = join(/*turbopackIgnore: true*/ filesDir(), orgId);
  try {
    const all = await readdir(/*turbopackIgnore: true*/ root, { recursive: true, withFileTypes: true });
    return all.filter((e) => e.isFile()).map((e) => relative(root, join(e.parentPath, e.name)));
  } catch {
    return []; // nothing uploaded yet
  }
}

/** One company's backup, as a .zip. */
export async function exportCompany(orgId: string, at = new Date()): Promise<{ zip: Buffer; name: string; data: CompanyBackupData }> {
  if (!ORG_ID.test(orgId)) throw new Error("Bad company id");
  const data = await inScope({ orgId }, async (tx) => {
    const one = async <T>(q: ReturnType<typeof sql>) => ((await tx.execute(q)).rows[0] as { v: T }).v;
    const org = await one<Record<string, unknown> | null>(sql`select row_to_json(o) as v from orgs o where o.id = ${orgId}`);
    if (!org) throw new Error(`No company ${orgId}`);
    const tables: CompanyBackupData["tables"] = {};
    for (const t of BACKED_UP) {
      tables[t] = await one(sql`select coalesce(json_agg(row_to_json(x)), '[]'::json) as v from ${sql.identifier(t)} x where x.org_id = ${orgId}`);
    }
    const users = await one<CompanyBackupData["users"]>(sql`select coalesce(json_agg(json_build_object('id', u.id, 'email', u.email)), '[]'::json) as v
      from users u where u.id in (select m.user_id from members m where m.org_id = ${orgId})`);
    return { format: FORMAT, version: VERSION, orgId, orgName: String(org.name), createdAt: at.toISOString(), org, users, tables } satisfies CompanyBackupData;
  });
  const zip = new JSZip();
  zip.file("data.json", JSON.stringify(data));
  zip.file("README.txt", README(data));
  for (const f of await filesOf(orgId)) zip.file(`files/${f}`, await readFile(/*turbopackIgnore: true*/ join(filesDir(), orgId, f)));
  const stamp = data.createdAt.slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return { zip: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), name: `1fold-${orgId}-${stamp}.zip`, data };
}

/** What's in a backup (to show before restoring): the company, when, and how many rows of each kind. */
export async function readBackup(bytes: Buffer): Promise<{ data: CompanyBackupData; zip: JSZip }> {
  const zip = await JSZip.loadAsync(bytes);
  const json = await zip.file("data.json")?.async("string");
  if (!json) throw new Error("This isn't a 1Fold company backup (no data.json)");
  const data = JSON.parse(json) as CompanyBackupData;
  if (data.format !== FORMAT) throw new Error("This isn't a 1Fold company backup");
  if (data.version > VERSION) throw new Error(`This backup is from a newer 1Fold (format ${data.version}) — upgrade first`);
  if (!ORG_ID.test(data.orgId)) throw new Error("This backup's company id is invalid");
  return { data, zip };
}

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
const CHUNK = 500;

/**
 * Puts one company back exactly as its backup has it — its rows replaced in one transaction (no other company's
 * touched), then its files — as the database owner. People whose logins are gone get one back with no password: they
 * set one with "Forgot password". A backup with columns this version doesn't know is refused, never half-restored.
 */
export async function restoreCompany(bytes: Buffer, opts: { adminUrl: string }): Promise<{ orgId: string; rows: number; files: number }> {
  const { data, zip } = await readBackup(bytes);
  const orgId = data.orgId;
  const client = new pg.Client({ connectionString: opts.adminUrl });
  await client.connect();
  let rows = 0;
  try {
    const { rows: cols } = await client.query<{ t: string; c: string; generated: boolean }>(
      "select table_name as t, column_name as c, is_generated = 'ALWAYS' as generated from information_schema.columns where table_schema = 'public'");
    const columns = new Map<string, Set<string>>();
    const generated = new Set<string>(); // "table.column" Postgres works out itself (doc search): never written
    for (const { t, c, generated: g } of cols) {
      columns.set(t, (columns.get(t) ?? new Set()).add(c));
      if (g) generated.add(`${t}.${c}`);
    }
    const writable = (t: string, names: string[]) => names.filter((c) => !generated.has(`${t}.${c}`)).map(quote);
    const known = (t: string, row: Record<string, unknown>) => {
      const have = columns.get(t);
      const extra = Object.keys(row).filter((k) => !have?.has(k));
      if (!have || extra.length) throw new Error(`This backup has ${t}.${extra[0] ?? "*"}, which this 1Fold doesn't — upgrade first`);
    };
    for (const t of Object.keys(data.tables)) if (!(BACKED_UP as readonly string[]).includes(t)) throw new Error(`Unknown table in the backup: ${t}`);
    known("orgs", data.org);
    for (const [t, list] of Object.entries(data.tables)) for (const row of list) known(t, row);

    await client.query("begin");
    await client.query("set constraints all deferred"); // rows reference each other: checked once, at the end
    // Logins: kept where they still exist (by id, or the same email under another id); else made again, passwordless.
    const userIds = new Map<string, string>();
    for (const u of data.users) {
      const { rows: [had] } = await client.query<{ id: string }>("select id from users where id = $1 or email = $2 order by (id = $1) desc limit 1", [u.id, u.email]);
      if (had) userIds.set(u.id, had.id);
      else {
        await client.query("insert into users (id, email, password_hash) values ($1, $2, '!')", [u.id, u.email]); // '!' never matches
        userIds.set(u.id, u.id);
      }
    }
    const fix = (row: Record<string, unknown>) => (typeof row.user_id === "string" && userIds.has(row.user_id) ? { ...row, user_id: userIds.get(row.user_id) } : row);

    const orgCols = writable("orgs", Object.keys(data.org).filter((c) => c !== "id" && c !== "version"));
    const { rowCount } = await client.query(
      `update orgs o set ${orgCols.map((c) => `${c} = r.${c}`).join(", ")}, version = o.version + 1 from json_populate_record(null::orgs, $1::json) r where o.id = $2`,
      [JSON.stringify(data.org), orgId]);
    if (!rowCount) {
      const all = writable("orgs", Object.keys(data.org)).join(", ");
      await client.query(`insert into orgs (${all}) select ${all} from json_populate_record(null::orgs, $1::json)`, [JSON.stringify(data.org)]);
    }
    await client.query("delete from undo_points where org_id = $1", [orgId]); // an undo from before the restore means nothing now
    for (const t of [...BACKED_UP].reverse()) await client.query(`delete from ${quote(t)} where org_id = $1`, [orgId]); // children first
    for (const t of BACKED_UP) { // parents first
      const list = (data.tables[t] ?? []).map(fix);
      for (let i = 0; i < list.length; i += CHUNK) {
        const part = list.slice(i, i + CHUNK);
        const names = writable(t, [...new Set(part.flatMap((r) => Object.keys(r)))]).join(", ");
        await client.query(`insert into ${quote(t)} (${names}) select ${names} from json_populate_recordset(null::${quote(t)}, $1::json)`, [JSON.stringify(part)]);
        rows += part.length;
      }
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
  // Files: written beside the company's, then swapped in — never a half-restored folder.
  const target = join(/*turbopackIgnore: true*/ filesDir(), orgId);
  const fresh = `${target}.restoring`;
  await rm(/*turbopackIgnore: true*/ fresh, { recursive: true, force: true });
  await mkdir(/*turbopackIgnore: true*/ fresh, { recursive: true, mode: 0o750 });
  let files = 0;
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.startsWith("files/")) continue;
    const rel = path.slice("files/".length);
    if (!rel || rel.split("/").some((p) => p === ".." || p === "")) throw new Error(`Unsafe file in the backup: ${path}`);
    const out = join(fresh, rel);
    await mkdir(/*turbopackIgnore: true*/ dirname(out), { recursive: true, mode: 0o750 });
    await writeFile(/*turbopackIgnore: true*/ out, await entry.async("nodebuffer"), { mode: 0o640 });
    files += 1;
  }
  await rm(/*turbopackIgnore: true*/ `${target}.old`, { recursive: true, force: true });
  await rename(/*turbopackIgnore: true*/ target, `${target}.old`).catch(() => {}); // none yet: fine
  await rename(/*turbopackIgnore: true*/ fresh, target);
  await rm(/*turbopackIgnore: true*/ `${target}.old`, { recursive: true, force: true });
  return { orgId, rows, files };
}
