// End-to-end server flows on a real Postgres: accounts, invites, changes, undo, permissions, audit.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { AccessError, ValidationError } from "../domain/commands/index.ts";
import { acceptInvitation, lookupInvite, readSession, setPassword, signIn, signUpCompany, type SessionRow, type SignedIn } from "./accounts.ts";
import { applySteps, createInvites, undoLast, viewFor } from "./changes.ts";
import { inScope } from "./db/client.ts";
import { freshDatabase } from "./testing/db.ts";

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg.drop(); });

const PASSWORD = "Correct-Horse-42";
const who = async (s: SignedIn): Promise<SessionRow> => (await readSession(s.token))!;
let admin: SessionRow;
let founder: SignedIn;
let dev: SessionRow;
let devPersonId = "";
let devToken = "";

test("sign-up creates the company and a working session; nothing secret reaches the browser's view", async () => {
  founder = await signUpCompany({ name: "Ayla Khan", email: "Ayla@Acme.example", password: PASSWORD, company: "Acme Labs", slug: "acme-labs" });
  assert.equal(founder.panel, "admin");
  admin = await who(founder);
  const view = await viewFor(admin);
  assert.deepEqual([view.db.org.name, view.db.people.length, view.version, view.panel], ["Acme Labs", 1, 1, "admin"]);
  assert.ok(!/password|\$argon2/i.test(JSON.stringify(view)));
  await assert.rejects(signUpCompany({ name: "X", email: "x@other.example", password: PASSWORD, company: "Acme 2", slug: "acme-labs" }), /taken/);
});

test("sign-in: wrong password refused the same way as an unknown email; right password works", async () => {
  await assert.rejects(signIn("ayla@acme.example", "wrong-password"), /Wrong email or password/);
  await assert.rejects(signIn("nobody@acme.example", "wrong-password"), /Wrong email or password/);
  const result = await signIn("AYLA@acme.example", PASSWORD);
  assert.equal(result.kind, "signed-in");
});

test("invites: the link opens once, for that email, and the new person lands with the invited role", async () => {
  const { invites } = await createInvites(admin, [{ email: "sam@acme.example", panel: "developer" }]);
  const token = invites[0].token;
  const view = await lookupInvite(token);
  assert.deepEqual([view.problem, view.orgName, view.inviterName, view.email, view.panel, view.hasLogin], [null, "Acme Labs", "Ayla Khan", "sam@acme.example", "developer", false]);
  const joined = await acceptInvitation(token, { name: "Sam Dev", password: PASSWORD });
  assert.equal(joined.panel, "developer");
  devToken = joined.token;
  devPersonId = joined.personId;
  dev = await who(joined);
  assert.match((await lookupInvite(token)).problem!, /already used/);
  await assert.rejects(acceptInvitation(token, { name: "Again", password: PASSWORD }), /already used/);
  assert.equal((await lookupInvite("not-a-real-token")).problem, "This invite link isn't valid.");
  assert.ok(!JSON.stringify(await viewFor(admin)).includes(token)); // the admin's view never carries invite secrets
});

test("changes: a batch is one version; permissions and the step allow-list are enforced", async () => {
  const before = (await viewFor(admin)).version;
  const me = founder.personId;
  const { version, key } = await applySteps(admin, [
    { name: "createProduct", args: [{ key: "CH", name: "Checkout", type: "internal", pmId: me, projectManagerId: me }] },
    { name: "setMember", args: ["CH", devPersonId, true] },
    { name: "createTicket", args: ["CH", "Build the cart"] },
  ]);
  assert.deepEqual([version, key], [before + 1, "CH-1"]);
  assert.deepEqual((await viewFor(dev)).db.tickets.map((t) => t.key), ["CH-1"]);
  await assert.rejects(applySteps(dev, [{ name: "createProduct", args: [{ key: "XX", name: "Nope", type: "internal", pmId: me, projectManagerId: me }] }]), AccessError);
  await assert.rejects(applySteps(admin, [{ name: "inviteMembers", args: [[{ email: "z@acme.example", panel: "admin", tokenHash: "f".repeat(64) }]] }]), /isn't allowed/);
  await assert.rejects(applySteps(admin, [{ name: "dropDatabase", args: [] }]), /isn't allowed/);
  await assert.rejects(applySteps(admin, [{ name: "createTicket", args: [] }]), ValidationError);
  assert.equal((await viewFor(admin)).version, version); // refused changes saved nothing
});

test("undo puts things back — but never over someone else's newer change", async () => {
  await applySteps(admin, [{ name: "deleteTickets", args: [["CH-1"]] }], { undoable: true });
  assert.equal((await viewFor(admin)).db.tickets.length, 0);
  await undoLast(admin);
  assert.deepEqual((await viewFor(admin)).db.tickets.map((t) => t.key), ["CH-1"]);
  await assert.rejects(undoLast(admin), /nothing to undo/);
  await applySteps(admin, [{ name: "deleteTickets", args: [["CH-1"]] }], { undoable: true });
  await applySteps(dev, [{ name: "createTicket", args: ["CH", "Someone else's work"] }]);
  await assert.rejects(undoLast(admin), /can't be undone/);
  assert.equal((await viewFor(admin)).db.tickets.length, 1);
});

test("an admin resets a teammate's password: old sessions end, the new password works", async () => {
  await setPassword(admin, devPersonId, "Brand-New-Pass-7");
  assert.equal(await readSession(devToken), null);
  const again = await signIn("sam@acme.example", "Brand-New-Pass-7");
  assert.equal(again.kind, "signed-in");
  if (again.kind === "signed-in") dev = await who(again.session);
});

test("one login in two companies: sign-in asks which, and one company's admin can't reset that login", async () => {
  await signUpCompany({ name: "Sam Dev", email: "sam@acme.example", password: "Brand-New-Pass-7", company: "Beta Works", slug: "beta-works" });
  const choice = await signIn("sam@acme.example", "Brand-New-Pass-7");
  assert.equal(choice.kind, "choose");
  if (choice.kind === "choose") assert.deepEqual(choice.companies.map((c) => c.slug).sort(), ["acme-labs", "beta-works"]);
  assert.equal((await signIn("sam@acme.example", "Brand-New-Pass-7", "beta-works")).kind, "signed-in");
  await assert.rejects(setPassword(admin, devPersonId, "Takeover-Pass-9"), /another company/);
});

test("turning someone off locks them out at once", async () => {
  await applySteps(admin, [{ name: "updatePerson", args: [devPersonId, { active: false }] }]);
  await assert.rejects(viewFor(dev), AccessError);
  await assert.rejects(signIn("sam@acme.example", "Brand-New-Pass-7", "acme-labs"), /not in that company|turned off/);
});

test("every change is in the audit log, and no invite secret ever is", async () => {
  const rows = await inScope({ orgId: admin.orgId }, (tx) => tx.execute(sql`select command, args::text as args from audit_log order by id`));
  const commands = rows.rows.map((r) => (r as { command: string }).command);
  for (const c of ["signUp", "inviteMembers", "acceptInvite", "createProduct", "createTicket", "deleteTickets", "undo", "setPassword", "updatePerson"]) {
    assert.ok(commands.includes(c), c);
  }
  assert.ok(rows.rows.every((r) => !/tokenHash|token"/.test((r as { args: string }).args)));
});
