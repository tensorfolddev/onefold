import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { demoDb } from "../../data/demo.ts";
import { acceptInvite, inviteMembers, inviteProblem, inviteState, revokeInvite, signUp, slugError, slugify, updateOrg } from "./org.ts";
import { AccessError, ValidationError } from "./shared.ts";

fixClock("2026-10-15T09:00:00");
const none = () => false;
const founderInput = { name: "Ayla Khan", email: "Ayla@Acme.io", company: "Acme Labs", slug: "acme-labs" };
/** Stand-ins for the SHA-256 hashes the server makes from each invite link's token. */
const hash = (n: number) => n.toString(16).padStart(64, "0");
const invite = (email: string, panel: "developer" | "manager" | "admin", n: number) => ({ email, panel, tokenHash: hash(n) });

test("slugs: from the company name; short, reserved or taken ones are refused", () => {
  assert.equal(slugify("TensorFold Labs!"), "tensorfold-labs");
  assert.equal(slugify("Café Déjà Vu"), "cafe-deja-vu");
  assert.equal(slugError("ab", none), "Use 3–32 lowercase letters, numbers or dashes");
  assert.match(slugError("admin", none)!, /reserved/);
  assert.match(slugError("acme", (s) => s === "acme")!, /taken/);
  assert.equal(slugError("acme-labs", none), null);
});

test("sign-up creates the company with the founder as its first admin, domain lock on, no login data inside", () => {
  const { db, founder } = signUp(founderInput, none);
  assert.deepEqual([db.org.name, db.org.slug, db.org.emailDomain, db.org.domainLock, db.org.createdBy], ["Acme Labs", "acme-labs", "acme.io", true, founder.id]);
  assert.deepEqual([founder.panel, founder.email, founder.role], ["admin", "ayla@acme.io", "CEO"]);
  assert.deepEqual([db.people.length, db.products.length], [1, 0]);
  assert.ok(!/password/i.test(JSON.stringify(db)));
});

test("sign-up with a personal email doesn't lock invites to gmail.com", () => {
  assert.equal(signUp({ ...founderInput, email: "ayla@gmail.com" }, none).db.org.domainLock, false);
});

test("sign-up validates every field", () => {
  assert.throws(() => signUp({ ...founderInput, name: " " }, none), ValidationError);
  assert.throws(() => signUp({ ...founderInput, email: "nope" }, none), ValidationError);
  assert.throws(() => signUp({ ...founderInput, company: "" }, none), ValidationError);
  assert.throws(() => signUp(founderInput, (s) => s === "acme-labs"), /taken/);
});

test("invites: domain lock, duplicates, existing people, admins only, a link hash is required", () => {
  const { db, founder } = signUp(founderInput, none);
  const invited = inviteMembers(db, founder, [invite("dev@acme.io", "developer", 1), invite("PM@acme.io", "manager", 2)]);
  assert.deepEqual(invited.invites.map((i) => [i.email, i.panel, i.role, inviteState(i), i.tokenHash]), [
    ["dev@acme.io", "developer", "Engineer", "pending", hash(1)], ["pm@acme.io", "manager", "Team Lead", "pending", hash(2)],
  ]);
  assert.equal(new Set(invited.invites.map((i) => i.id)).size, 2);
  assert.throws(() => inviteMembers(db, founder, [invite("x@gmail.com", "developer", 3)]), /Only @acme.io/);
  assert.throws(() => inviteMembers(invited, founder, [invite("dev@acme.io", "developer", 4)]), /already invited/);
  assert.throws(() => inviteMembers(db, founder, [invite("ayla@acme.io", "developer", 5)]), /already uses/);
  assert.throws(() => inviteMembers(db, founder, [invite("a@acme.io", "developer", 6), invite("A@acme.io", "developer", 7)]), /twice/);
  assert.throws(() => inviteMembers(db, founder, []), ValidationError);
  assert.throws(() => inviteMembers(db, founder, [{ email: "b@acme.io", panel: "developer", tokenHash: "plain-token" }]), /link is missing/);
  // domain lock off → any email
  const open = updateOrg(db, founder, { domainLock: false });
  assert.doesNotThrow(() => inviteMembers(open, founder, [invite("x@gmail.com", "developer", 8)]));
  // only admins invite
  const demo = demoDb();
  assert.throws(() => inviteMembers(demo, demo.people.find((p) => p.id === "u-ayesha")!, [invite("n@tensorfold.example", "developer", 9)]), AccessError);
});

test("accepting an invite creates the person with the invited role and tells the inviter", () => {
  const { db, founder } = signUp(founderInput, none);
  const invited = inviteMembers(db, founder, [invite("dev@acme.io", "developer", 1)]);
  const { db: joined, person } = acceptInvite(invited, hash(1), { name: "Sam Dev" });
  assert.deepEqual([person.name, person.email, person.panel, person.role], ["Sam Dev", "dev@acme.io", "developer", "Engineer"]);
  assert.equal(inviteState(joined.invites[0]), "accepted");
  assert.deepEqual([joined.notifications[0].personId, joined.notifications[0].text], [founder.id, "joined Acme Labs"]);
  assert.match(inviteProblem(joined, hash(1))!, /already used/);
  assert.throws(() => acceptInvite(joined, hash(1), { name: "Again" }), /already used/);
  assert.match(inviteProblem(joined, hash(99))!, /isn't valid/);
});

test("revoked and expired invites can't be used", () => {
  const { db, founder } = signUp(founderInput, none);
  const invited = inviteMembers(db, founder, [invite("a@acme.io", "developer", 1), invite("b@acme.io", "developer", 2)]);
  const [a] = invited.invites;
  const revoked = revokeInvite(invited, founder, a.id);
  assert.match(inviteProblem(revoked, hash(1))!, /cancelled/);
  assert.throws(() => revokeInvite(revoked, founder, a.id), ValidationError);
  fixClock("2026-11-15T09:00:00");
  assert.match(inviteProblem(revoked, hash(2))!, /expired/);
  fixClock("2026-10-15T09:00:00");
});

test("company settings: admins rename and toggle the domain lock", () => {
  const { db, founder } = signUp(founderInput, none);
  const next = updateOrg(db, founder, { name: " Acme ", domainLock: false });
  assert.deepEqual([next.org.name, next.org.domainLock], ["Acme", false]);
  assert.throws(() => updateOrg(db, founder, { name: "" }), ValidationError);
});
