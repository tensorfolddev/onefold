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

  assert.equal((await sendVerification(founder.userId, APP)).ok, true);
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
  assert.equal((await sendVerification(founder.userId, APP)).ok, true); // already confirmed: nothing more to send
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

test("how a company's email is set up, for Integrations → Email: its own Resend, a test inbox, or not at all — never the server's", async () => {
  const { emailStatus } = await import("./email.ts");
  const saved = { key: process.env.RESEND_API_KEY, outbox: process.env.EMAIL_OUTBOX_DIR, from: process.env.EMAIL_FROM };
  try {
    process.env.RESEND_API_KEY = "re_secret"; // the platform's — for login emails only, never a company's
    process.env.EMAIL_FROM = "1Fold <hello@1fold.example>";
    delete process.env.EMAIL_OUTBOX_DIR;
    assert.deepEqual(await emailStatus(admin.orgId), { mode: "off", from: "", hint: null });
    process.env.EMAIL_OUTBOX_DIR = "/tmp/outbox";
    assert.equal((await emailStatus(admin.orgId)).mode, "outbox");
  } finally {
    restore(saved);
  }
});

test("a company's own Resend (Integrations → Email): kept encrypted, the only one its emails use, shown only as its last 4", async () => {
  process.env.SESSION_SECRET ??= "a-test-session-secret-of-32-chars-or-more";
  const { deliverEmail, emailStatus, removeCompanyResend, saveCompanyResend, sendEmail, typedResend } = await import("./email.ts");
  const { seal, unseal } = await import("./auth/secrets.ts");
  const saved = { key: process.env.RESEND_API_KEY, outbox: process.env.EMAIL_OUTBOX_DIR, from: process.env.EMAIL_FROM };
  const realFetch = globalThis.fetch;
  const sentWith: string[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const { from } = JSON.parse(String(init.body)) as { from: string };
    sentWith.push(`${(init.headers as Record<string, string>).Authorization} ${from}`);
    return from.includes("@gmail.com")
      ? new Response(JSON.stringify({ message: "The gmail.com domain is not verified.", statusCode: 403 }), { status: 403 })
      : new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    const sealed = seal("re_company_key_1234");
    assert.equal(sealed.includes("re_company"), false);
    assert.equal(unseal(sealed), "re_company_key_1234");
    // Change the first character of the ciphertext: a trailing one can be padding bits the decoder ignores.
    const at = sealed.lastIndexOf(".") + 1;
    assert.throws(() => unseal(sealed.slice(0, at) + (sealed[at] === "A" ? "B" : "A") + sealed.slice(at + 1)));

    delete process.env.EMAIL_OUTBOX_DIR; // a test inbox takes everything: these go to (a pretend) Resend
    process.env.RESEND_API_KEY = "re_server_key";
    delete process.env.EMAIL_FROM;
    const orgId = admin.orgId;
    await assert.rejects(typedResend(orgId, { key: "sk_nope", from: "Acme <hi@acme.example>" }), /start with re_/);
    await assert.rejects(typedResend(orgId, { key: "re_company_key_1234", from: "not an address" }), /From address/);
    await assert.rejects(typedResend(orgId, { from: "Acme <hi@acme.example>" }), /API key/); // nothing saved to fill it from
    assert.equal(await typedResend(orgId, { key: "", from: "" }), null);

    // Resend's reason comes back, in its own words.
    assert.deepEqual(await deliverEmail({ to: "x@acme.example", subject: "s", text: "t", html: "h" }, { via: { key: "re_k", from: "Me <me@gmail.com>" } }),
      { ok: false, reason: "Resend refused it: The gmail.com domain is not verified." });

    await saveCompanyResend(orgId, "m", (await typedResend(orgId, { key: "re_company_key_1234", from: "Acme <hi@acme.example>" }))!);
    assert.deepEqual(await emailStatus(orgId), { mode: "own", from: "Acme <hi@acme.example>", hint: "1234" });
    const [row] = await pg.asOwner(`select api_key from company_email where org_id = '${orgId}'`) as { api_key: string }[];
    assert.equal(row.api_key.includes("re_company"), false); // encrypted at rest

    // A blank key keeps the saved one.
    assert.deepEqual(await typedResend(orgId, { from: "Acme Ops <ops@acme.example>" }), { key: "re_company_key_1234", from: "Acme Ops <ops@acme.example>" });
    await saveCompanyResend(orgId, "m", (await typedResend(orgId, { from: "Acme Ops <ops@acme.example>" }))!);
    sentWith.length = 0;
    await sendEmail({ to: "x@acme.example", subject: "s", text: "t", html: "h" }, { orgId });
    await sendEmail({ to: "x@other.example", subject: "s", text: "t", html: "h" }); // no company: a login email, the platform's
    assert.deepEqual(sentWith, ["Bearer re_company_key_1234 Acme Ops <ops@acme.example>", "Bearer re_server_key 1Fold <onboarding@resend.dev>"]);

    await removeCompanyResend(orgId);
    assert.equal((await emailStatus(orgId)).mode, "off"); // never falls back to the platform's
    sentWith.length = 0;
    assert.equal(await sendEmail({ to: "x@acme.example", subject: "s", text: "t", html: "h" }, { orgId }), false);
    assert.deepEqual(sentWith, []); // a company without its own email sends nothing
  } finally {
    globalThis.fetch = realFetch;
    restore(saved);
  }
});

function restore(saved: { key?: string; outbox?: string; from?: string }) {
  for (const [k, v] of [["RESEND_API_KEY", saved.key], ["EMAIL_OUTBOX_DIR", saved.outbox], ["EMAIL_FROM", saved.from]] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}
