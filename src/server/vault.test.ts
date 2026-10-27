// "Forgot my master password" on a real Postgres: a link to their own inbox (30 minutes, once, theirs only), and with
// it the private key their browser locked again — the recovery lock untouched, nothing readable in the audit log.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSession, signUpCompany } from "./accounts.ts";
import { applySteps, viewFor } from "./changes.ts";
import type { Email } from "./email.ts";
import { freshDatabase } from "./testing/db.ts";
import { recoverVault, sendVaultReset, vaultResetCheck } from "./vault.ts";

const outbox = await mkdtemp(join(tmpdir(), "onefold-vault-outbox-"));
process.env.EMAIL_OUTBOX_DIR = outbox;

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg.drop(); await rm(outbox, { recursive: true, force: true }); });

const APP = "https://1fold.test";
const acct = {
  salt: "c2FsdA==", iterations: 600_000, iv: "aXY=", wrappedPrivateKey: "d3JhcA==", publicKey: "cHVi",
  recoverySalt: "cnNhbHQ=", recoveryIv: "cml2", recoveryWrappedPrivateKey: "cndyYXA=",
};
const wrap = { salt: "bmV3", iterations: 600_000, iv: "bml2", wrappedPrivateKey: "bmV3d3JhcA==" };

async function lastTo(to: string): Promise<Email> {
  const files = (await readdir(outbox)).sort();
  const all = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(outbox, f), "utf8")) as Email));
  return all.filter((m) => m.to === to).at(-1)!;
}

test("forgot the master password: emailed link → recovery code + new password in the browser → only the lock changes", async () => {
  const founder = await signUpCompany({ name: "Ayla Khan", email: "ayla@acme.example", password: "Correct-Horse-42", company: "Acme", slug: "acme" });
  const ayla = (await readSession(founder.token))!;
  const stranger = (await readSession((await signUpCompany({ name: "Eve", email: "eve@evil.example", password: "Correct-Horse-42", company: "Evil", slug: "evil" })).token))!;
  await applySteps(ayla, [{ name: "setupVault", args: [acct, "v-ayla", "a2V5"] }]);

  await sendVaultReset(ayla, APP);
  const mail = await lastTo("ayla@acme.example");
  assert.equal(mail.subject, "Reset your vault master password");
  const token = mail.text.match(new RegExp(`${APP}/vault/recover/([A-Za-z0-9_-]{43})`))?.[1] ?? "";
  assert.notEqual(token, "");

  assert.deepEqual(await vaultResetCheck(ayla, token), { problem: null });
  assert.deepEqual(await vaultResetCheck(ayla, token), { problem: null }); // checking never uses it up
  assert.match((await vaultResetCheck(stranger, token)).problem!, /expired or was already used/); // someone else's link
  await assert.rejects(recoverVault(stranger, token, wrap), /expired or was already used/);
  await assert.rejects(recoverVault(ayla, "nope", wrap), /expired or was already used/);

  await recoverVault(ayla, token, wrap);
  assert.deepEqual((await viewFor(ayla)).db.vaultAccounts[founder.personId], { ...acct, ...wrap }); // recovery lock and public key kept
  await assert.rejects(recoverVault(ayla, token, wrap), /expired or was already used/); // once
  assert.match((await vaultResetCheck(ayla, token)).problem!, /expired or was already used/);

  const logged = await pg.asOwner<{ args: unknown }>(`select args from audit_log where command in ('setupVault', 'rewrapVault') order by id`);
  assert.deepEqual(logged.map((r) => r.args), [{ sealed: true }, { sealed: true }]); // no blobs in the audit log
});
