// One company's backup on a real Postgres: every company table is either in it or left out on purpose, no secret is
// ever in it, and restoring it puts that company back exactly — touching no other company.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { readSession, signUpCompany, type SessionRow } from "../accounts.ts";
import { applySteps } from "../changes.ts";
import { loadCompany } from "../company/store.ts";
import { inScope } from "../db/client.ts";
import { createDoc } from "../docs.ts";
import { uploadDocFile } from "../files.ts";
import { freshDatabase } from "../testing/db.ts";
import { BACKED_UP, exportCompany, NOT_BACKED_UP, readBackup, restoreCompany } from "./companyBackup.ts";

const files = await mkdtemp(join(tmpdir(), "onefold-backup-files-"));
process.env.FILES_DIR = files;

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg.drop(); await rm(files, { recursive: true, force: true }); });

const PASSWORD = "Correct-Horse-42";
let acme: SessionRow;
let acmeToken = "";
let other: SessionRow;

const company = async (orgId: string) => {
  const loaded = await inScope({ orgId }, (tx) => loadCompany(tx, orgId));
  return loaded!.db;
};

test("every company table is either in a company's backup or left out on purpose", async () => {
  const rows = await pg.asOwner<{ t: string }>(
    "select distinct table_name as t from information_schema.columns where table_schema = 'public' and column_name = 'org_id' order by 1");
  const unplaced = rows.map((r) => r.t).filter((t) => !(BACKED_UP as readonly string[]).includes(t) && !NOT_BACKED_UP.has(t));
  assert.deepEqual(unplaced, [], "a new company table: add it to BACKED_UP, or to NOT_BACKED_UP if it's a secret or only matters while running");
  assert.deepEqual(BACKED_UP.filter((t) => NOT_BACKED_UP.has(t)), []);
});

test("a company's backup has all of its data and files, and no secret", async () => {
  const a = await signUpCompany({ name: "Ayla Khan", email: "ayla@acme.example", password: PASSWORD, company: "Acme", slug: "acme-backup" });
  acmeToken = a.token;
  acme = (await readSession(a.token))!;
  const o = await signUpCompany({ name: "Omar", email: "omar@other.example", password: PASSWORD, company: "Other", slug: "other-backup" });
  other = (await readSession(o.token))!;
  await applySteps(acme, [
    { name: "createProduct", args: [{ key: "AP", name: "Portal", type: "internal", pmId: a.personId, projectManagerId: a.personId }] },
    { name: "createTicket", args: ["AP", "Build the login", {}] },
    { name: "addComment", args: ["AP-1", "Started on it"] },
  ]);
  const doc = await createDoc(acme, { productKey: "AP", title: "Launch plan", body: "Ship it on **Friday**." });
  await uploadDocFile(acme, { docId: doc.id, name: "notes.txt" }, Buffer.from("hello from a file"));
  await applySteps(other, [{ name: "createProduct", args: [{ key: "OT", name: "Other thing", type: "internal", pmId: o.personId, projectManagerId: o.personId }] }]);

  const { zip, name, data } = await exportCompany(acme.orgId, new Date("2026-10-20T02:00:00Z"));
  assert.equal(name, `1fold-${acme.orgId}-20261020-020000.zip`);
  assert.deepEqual(data.tables.products.map((p) => p.id), ["AP"]); // Acme's — never Other's
  assert.deepEqual(data.tables.tickets.map((t) => t.title), ["Build the login"]);
  assert.equal(data.tables.docs.length, 1);
  assert.ok(data.tables.doc_bodies.length >= 1);
  assert.deepEqual(data.users, [{ id: a.userId, email: "ayla@acme.example" }]);

  const unzipped = await JSZip.loadAsync(zip);
  assert.ok(unzipped.file("README.txt"));
  const fileNames = Object.keys(unzipped.files).filter((f) => f.startsWith("files/") && !unzipped.files[f].dir);
  assert.equal(fileNames.length, 1);
  assert.equal(await unzipped.file(fileNames[0])!.async("string"), "hello from a file");

  const everything = JSON.stringify(data);
  for (const secret of ["password_hash", "$argon2", "token_hash", "refresh_token", "api_key", "Other thing", other.orgId]) {
    assert.equal(everything.includes(secret), false, `no ${secret} in Acme's backup`);
  }
});

test("restoring a backup puts that company back exactly — and no other company is touched", async () => {
  const { zip } = await exportCompany(acme.orgId);
  const before = await company(acme.orgId);
  const otherBefore = await company(other.orgId);
  const fileDir = join(files, acme.orgId);

  // Things change after the backup: renamed, a new ticket, a file gone.
  await applySteps(acme, [
    { name: "updateProduct", args: ["AP", { name: "Renamed portal" }] },
    { name: "createTicket", args: ["AP", "Made after the backup", {}] },
  ]);
  await rm(fileDir, { recursive: true, force: true });

  const done = await restoreCompany(zip, { adminUrl: pg.adminUrl });
  assert.equal(done.orgId, acme.orgId);
  assert.equal(done.files, 1);
  const after = await company(acme.orgId);
  assert.deepEqual(after, before); // just as it was
  assert.deepEqual(await company(other.orgId), otherBefore);
  const back = await readdir(fileDir, { recursive: true, withFileTypes: true });
  const restored = back.find((e) => e.isFile())!;
  assert.equal(await readFile(join(restored.parentPath, restored.name), "utf8"), "hello from a file");
  assert.equal((await readSession(acmeToken))?.orgId, acme.orgId); // still signed in
});

test("a backup that isn't one, or is from a newer 1Fold, is refused — nothing is half-restored", async () => {
  const notOne = new JSZip();
  notOne.file("data.json", JSON.stringify({ format: "something-else" }));
  await assert.rejects(readBackup(await notOne.generateAsync({ type: "nodebuffer" })), /isn't a 1Fold company backup/);

  const { data } = await exportCompany(acme.orgId);
  const newer = new JSZip();
  newer.file("data.json", JSON.stringify({ ...data, tables: { ...data.tables, products: data.tables.products.map((p) => ({ ...p, from_the_future: 1 })) } }));
  const before = await company(acme.orgId);
  await assert.rejects(restoreCompany(await newer.generateAsync({ type: "nodebuffer" }), { adminUrl: pg.adminUrl }), /products\.from_the_future/);
  assert.deepEqual(await company(acme.orgId), before);
});

test("Google Drive: an admin connects it, backups go to its own folder, only the newest 30 stay, and it can be disconnected", async () => {
  process.env.SESSION_SECRET ??= "a-test-session-secret-of-32-chars-or-more";
  process.env.GOOGLE_CLIENT_ID = "client-1";
  process.env.GOOGLE_CLIENT_SECRET = "secret-1";
  const { backUpCompany, backUpDue, connectUrl, disconnectDrive, driveStatus, finishConnect, KEEP } = await import("./drive.ts");
  const APP = "https://1fold.test";
  // A pretend Google: sign-in, tokens, a folder, uploads, listing, deleting, revoking.
  const drive = new Map<string, { id: string; name: string; size: number; createdTime: string; parent: string }>();
  let refreshOk = true;
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    calls.push(`${method} ${url.split("?")[0]}`);
    const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
    if (url === "https://oauth2.googleapis.com/token") {
      const f = new URLSearchParams(String(init.body));
      if (f.get("grant_type") === "authorization_code") {
        const idToken = `x.${Buffer.from(JSON.stringify({ email: "ayla.backups@gmail.com" })).toString("base64url")}.y`;
        return json({ refresh_token: "refresh-1", id_token: idToken, access_token: "a" });
      }
      return refreshOk ? json({ access_token: "access-1" }) : json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400);
    }
    if (url === "https://oauth2.googleapis.com/revoke") return json({});
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?fields=id") && method === "POST") return json({ id: "folder-1" });
    if (url.startsWith("https://www.googleapis.com/drive/v3/files/folder-1")) return json({ id: "folder-1", trashed: false });
    if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
      const meta = JSON.parse(String(init.body)) as { name: string; parents: string[] };
      return new Response("", { status: 200, headers: { location: `https://upload.example/${encodeURIComponent(meta.name)}|${meta.parents[0]}` } });
    }
    if (url.startsWith("https://upload.example/")) {
      const [name, parent] = decodeURIComponent(url.slice("https://upload.example/".length)).split("|");
      const id = `f-${drive.size + 1}-${Date.now()}`;
      drive.set(id, { id, name, size: (init.body as Uint8Array).length, createdTime: new Date().toISOString(), parent });
      return json({ id });
    }
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?") && method === "GET") {
      const files = [...drive.values()].sort((a, b) => b.createdTime.localeCompare(a.createdTime));
      return json({ files: files.map((f) => ({ id: f.id, name: f.name, size: String(f.size), createdTime: f.createdTime, webViewLink: `https://drive.google.com/file/d/${f.id}` })) });
    }
    if (method === "DELETE") { drive.delete(decodeURIComponent(url.split("/files/")[1])); return new Response(null, { status: 204 }); }
    throw new Error(`unexpected call to ${method} ${url}`);
  }) as typeof fetch;
  try {
    const url = new URL(await connectUrl(acme, APP));
    assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.match(url.searchParams.get("scope")!, /auth\/drive\.file/); // only the files 1Fold makes
    assert.equal(url.searchParams.get("redirect_uri"), `${APP}/api/drive/callback`);
    const state = url.searchParams.get("state")!;
    await assert.rejects(finishConnect(acme, { code: "c", state: `${state}x` }, APP), /expired/); // a forged sign-in
    await assert.rejects(finishConnect(other, { code: "c", state }, APP), /expired/); // someone else's
    assert.equal(await finishConnect(acme, { code: "c", state }, APP), "ayla.backups@gmail.com");
    const [row] = await pg.asOwner<{ refresh_token: string }>("select refresh_token from company_drive where org_id = $1", [acme.orgId]);
    assert.equal(row.refresh_token.includes("refresh-1"), false); // sealed at rest

    // Thirty old backups already there: one more, and the oldest goes.
    for (let i = 0; i < KEEP; i++) drive.set(`old-${i}`, { id: `old-${i}`, name: `1fold-old-${i}.zip`, size: 1, createdTime: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z`, parent: "folder-1" });
    const done = await backUpCompany(acme.orgId);
    assert.equal(done.ok, true);
    assert.equal(drive.size, KEEP);
    assert.equal(drive.has("old-0"), false); // the oldest
    assert.ok([...drive.values()].some((f) => f.name.startsWith(`1fold-${acme.orgId}-`) && f.size > 100));
    const status = await driveStatus(acme, true);
    assert.equal(status.connected?.email, "ayla.backups@gmail.com");
    assert.equal(status.connected?.lastError, null);
    assert.equal(status.backups.length, KEEP);
    assert.equal(await backUpDue(), undefined); // just backed up: nothing due

    refreshOk = false; // someone removed 1Fold's access in their Google account
    const failed = await backUpCompany(acme.orgId);
    assert.deepEqual(failed, { ok: false, reason: "Google Drive access was removed — connect it again" });
    assert.equal((await driveStatus(acme)).connected?.lastError, "Google Drive access was removed — connect it again");
    assert.deepEqual(await backUpDue(), { done: 0, failed: 1 }); // a failed one is tried again

    await disconnectDrive(acme);
    assert.ok(calls.includes("POST https://oauth2.googleapis.com/revoke"));
    assert.equal((await driveStatus(acme)).connected, null);
    assert.equal(drive.size, KEEP); // the backups stay in their Drive
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  }
});
