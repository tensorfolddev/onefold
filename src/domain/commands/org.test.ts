import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { demoDb } from "../../data/demo.ts";
import { acceptInvite, inviteMembers, inviteProblem, inviteState, revokeInvite, signUp, slugError, slugify, updateOrg } from "./org.ts";
import { AccessError, ValidationError } from "./shared.ts";

fixClock("2026-10-15T09:00:00");
const cred = { hash: "600000:aGFzaA==", salt: "c2FsdA==" };
const none = () => false;
const founderInput = { name: "Ayla Khan", email: "Ayla@Acme.io", credential: cred, company: "Acme Labs", slug: "acme-labs" };

test("slugs: from the company name; short, reserved or taken ones are refused", () => {
  assert.equal(slugify("TensorFold Labs!"), "tensorfold-labs");
  assert.equal(slugify("Café Déjà Vu"), "cafe-deja-vu");
  assert.equal(slugError("ab", none), "Use 3–32 lowercase letters, numbers or dashes");
  assert.match(slugError("admin", none)!, /reserved/);
  assert.match(slugError("acme", (s) => s === "acme")!, /taken/);
  assert.equal(slugError("acme-labs", none), null);
});

test("sign-up creates the company with the founder as its first admin, domain lock on", () => {
  const { db, founder } = signUp(founderInput, none);
  assert.deepEqual([db.org.name, db.org.slug, db.org.emailDomain, db.org.domainLock, db.org.createdBy], ["Acme Labs", "acme-labs", "acme.io", true, founder.id]);
  assert.deepEqual([founder.panel, founder.email, founder.role, founder.passwordHash], ["admin", "ayla@acme.io", "CEO", cred.hash]);
  assert.deepEqual([db.people.length, db.products.length], [1, 0]);
  assert.ok(!JSON.stringify(db).includes("password\""));
});

test("sign-up with a personal email doesn't lock invites to gmail.com", () => {
  assert.equal(signUp({ ...founderInput, email: "ayla@gmail.com" }, none).db.org.domainLock, false);
});

test("sign-up validates every field", () => {
  assert.throws(() => signUp({ ...founderInput, name: " " }, none), ValidationError);
  assert.throws(() => signUp({ ...founderInput, email: "nope" }, none), ValidationError);
  assert.throws(() => signUp({ ...founderInput, company: "" }, none), ValidationError);
  assert.throws(() => signUp({ ...founderInput, credential: { hash: "", salt: "" } }, none), ValidationError);
  assert.throws(() => signUp(founderInput, (s) => s === "acme-labs"), /taken/);
});

test("invites: domain lock, duplicates, existing people, admins only", () => {
  const { db, founder } = signUp(founderInput, none);
  const invited = inviteMembers(db, founder, [{ email: "dev@acme.io", panel: "developer" }, { email: "PM@acme.io", panel: "manager" }]);
  assert.deepEqual(invited.invites.map((i) => [i.email, i.panel, i.role, inviteState(i)]), [
    ["dev@acme.io", "developer", "Engineer", "pending"], ["pm@acme.io", "manager", "Team Lead", "pending"],
  ]);
  assert.equal(new Set(invited.invites.map((i) => i.token)).size, 2);
  assert.ok(invited.invites.every((i) => /^[a-f0-9]{32}$/.test(i.token)));
  assert.throws(() => inviteMembers(db, founder, [{ email: "x@gmail.com", panel: "developer" }]), /Only @acme.io/);
  assert.throws(() => inviteMembers(invited, founder, [{ email: "dev@acme.io", panel: "developer" }]), /already invited/);
  assert.throws(() => inviteMembers(db, founder, [{ email: "ayla@acme.io", panel: "developer" }]), /already uses/);
  assert.throws(() => inviteMembers(db, founder, [{ email: "a@acme.io", panel: "developer" }, { email: "A@acme.io", panel: "developer" }]), /twice/);
  assert.throws(() => inviteMembers(db, founder, []), ValidationError);
  // domain lock off → any email
  const open = updateOrg(db, founder, { domainLock: false });
  assert.doesNotThrow(() => inviteMembers(open, founder, [{ email: "x@gmail.com", panel: "developer" }]));
  // only admins invite
  const demo = demoDb();
  assert.throws(() => inviteMembers(demo, demo.people.find((p) => p.id === "u-ayesha")!, [{ email: "n@tensorfold.example", panel: "developer" }]), AccessError);
});

test("accepting an invite creates the person with the invited role and tells the inviter", () => {
  const { db, founder } = signUp(founderInput, none);
  const invited = inviteMembers(db, founder, [{ email: "dev@acme.io", panel: "developer" }]);
  const token = invited.invites[0].token;
  const { db: joined, person } = acceptInvite(invited, token, { name: "Sam Dev", credential: cred });
  assert.deepEqual([person.name, person.email, person.panel, person.role], ["Sam Dev", "dev@acme.io", "developer", "Engineer"]);
  assert.equal(inviteState(joined.invites[0]), "accepted");
  assert.deepEqual([joined.notifications[0].personId, joined.notifications[0].text], [founder.id, "joined Acme Labs"]);
  assert.match(inviteProblem(joined, token)!, /already used/);
  assert.throws(() => acceptInvite(joined, token, { name: "Again", credential: cred }), /already used/);
  assert.match(inviteProblem(joined, "nope")!, /isn't valid/);
});

test("revoked and expired invites can't be used", () => {
  const { db, founder } = signUp(founderInput, none);
  const invited = inviteMembers(db, founder, [{ email: "a@acme.io", panel: "developer" }, { email: "b@acme.io", panel: "developer" }]);
  const [a, b] = invited.invites.map((i) => i.token);
  const revoked = revokeInvite(invited, founder, a);
  assert.match(inviteProblem(revoked, a)!, /cancelled/);
  assert.throws(() => revokeInvite(revoked, founder, a), ValidationError);
  fixClock("2026-11-15T09:00:00");
  assert.match(inviteProblem(revoked, b)!, /expired/);
  fixClock("2026-10-15T09:00:00");
});

test("company settings: admins rename and toggle the domain lock", () => {
  const { db, founder } = signUp(founderInput, none);
  const next = updateOrg(db, founder, { name: " Acme ", domainLock: false });
  assert.deepEqual([next.org.name, next.org.domainLock], ["Acme", false]);
  assert.throws(() => updateOrg(db, founder, { name: "" }), ValidationError);
});
