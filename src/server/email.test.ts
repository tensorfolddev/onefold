// Emailed links on a real Postgres, with emails caught in an outbox folder: confirming an email (invites wait for it),
// invite emails, and password resets (once, an hour, every device signed out).
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  confirmEmail, readSession, requestPasswordReset, resetLinkProblem, resetPassword, sendVerification, signIn, signUpCompany,
  type SessionRow, type SignedIn,
} from "./accounts.ts";
import { createInvites, viewFor } from "./changes.ts";
import type { Email } from "./email.ts";
import { freshDatabase } from "./testing/db.ts";

const outbox = await mkdtemp(join(tmpdir(), "onefold-outbox-"));
process.env.EMAIL_OUTBOX_DIR = outbox; // "email is set up": confirmations are required, messages land here

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg.drop(); await rm(outbox, { recursive: true, force: true }); });

const APP = "https://1fold.test";
const PASSWORD = "Correct-Horse-42";
const NEW_PASSWORD = "Battery-Staple-77";

async function emailsTo(to: string): Promise<Email[]> {
  const files = (await readdir(outbox)).sort();
  const all = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(outbox, f), "utf8")) as Email));
  return all.filter((m) => m.to === to);
}
const lastTo = async (to: string) => (await emailsTo(to)).at(-1)!;
const linkToken = (m: Email, page: string) => m.text.match(new RegExp(`${APP}/${page}/([A-Za-z0-9_-]{43})`))?.[1] ?? "";

let founder: SignedIn;
let admin: SessionRow;

test("invites wait until the founder confirms their email; the link works more than once and only for that", async () => {
  founder = await signUpCompany({ name: "Ayla Khan", email: "ayla@acme.example", password: PASSWORD, company: "Acme & Sons", slug: "acme-sons" });
  admin = (await readSession(founder.token))!;
  assert.equal((await viewFor(admin)).emailUnverified, true);
  await assert.rejects(createInvites(admin, [{ email: "sam@acme.example", panel: "developer" }], APP), /Confirm your email first/);

  assert.equal(await sendVerification(founder.userId, APP), true);
  const mail = await lastTo("ayla@acme.example");
  assert.equal(mail.subject, "Confirm your email for 1Fold");
  const token = linkToken(mail, "verify");
  assert.notEqual(token, "");
  assert.notEqual(await resetLinkProblem(token), null); // a confirm link is not a reset link
  await confirmEmail(token);
  await confirmEmail(token); // opening it again is harmless
  assert.equal((await viewFor(admin)).emailUnverified, false);
  await assert.rejects(confirmEmail("not-a-real-token"), /expired or was already used/);

  const before = (await emailsTo("ayla@acme.example")).length;
  assert.equal(await sendVerification(founder.userId, APP), true); // already confirmed: nothing more to send
  assert.equal((await emailsTo("ayla@acme.example")).length, before);
});

test("each invitee is emailed the same link the admin sees; names are escaped in the HTML", async () => {
  const { invites } = await createInvites(admin, [{ email: "sam@acme.example", panel: "developer" }], APP);
  assert.equal(invites[0].emailed, true);
  const mail = await lastTo("sam@acme.example");
  assert.equal(mail.subject, "Ayla Khan invited you to Acme & Sons on 1Fold");
  assert.ok(mail.text.includes(invites[0].link));
  assert.ok(mail.html.includes("Acme &amp; Sons") && !mail.html.includes("Acme & Sons"));
});

test("a reset link works once, signs every device out, and replaces the old password", async () => {
  await requestPasswordReset("nobody@acme.example", APP);
  assert.equal((await emailsTo("nobody@acme.example")).length, 0); // unknown emails get nothing (and the API says the same)

  await requestPasswordReset("AYLA@acme.example", APP);
  const token = linkToken(await lastTo("ayla@acme.example"), "reset");
  assert.equal(await resetLinkProblem(token), null);
  await assert.rejects(resetPassword(token, "short"), /at least 8/);
  assert.equal(await resetLinkProblem(token), null); // a refused password doesn't use the link up

  await resetPassword(token, NEW_PASSWORD);
  assert.equal(await readSession(founder.token), null);
  await assert.rejects(signIn("ayla@acme.example", PASSWORD), /Wrong email or password/);
  assert.equal((await signIn("ayla@acme.example", NEW_PASSWORD)).kind, "signed-in");
  assert.match((await resetLinkProblem(token))!, /expired or was already used/);
  await assert.rejects(resetPassword(token, "Another-Pass-88"), /expired or was already used/);
});

test("using one reset link kills the others; an expired link is refused", async () => {
  await requestPasswordReset("ayla@acme.example", APP);
  const first = linkToken(await lastTo("ayla@acme.example"), "reset");
  await requestPasswordReset("ayla@acme.example", APP);
  const second = linkToken(await lastTo("ayla@acme.example"), "reset");
  await resetPassword(second, PASSWORD);
  assert.match((await resetLinkProblem(first))!, /expired or was already used/);

  await requestPasswordReset("ayla@acme.example", APP);
  const old = linkToken(await lastTo("ayla@acme.example"), "reset");
  await pg.asOwner(`update email_tokens set expires_at = now() - interval '1 minute' where used_at is null`);
  assert.match((await resetLinkProblem(old))!, /expired or was already used/);
  await assert.rejects(resetPassword(old, NEW_PASSWORD), /expired or was already used/);
});
