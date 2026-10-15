// The WhatsApp bot and the daily brief on a real Postgres, with a fake WhatsApp (the real one needs a phone) and
// emails caught in an outbox: pairing rights, linking by code, deny-by-default, STOP/START/TODAY, the brief's content,
// once a day at 9:00 on working days, the email fallback, and the logged-out alert.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccessError } from "../../domain/commands/index.ts";
import { acceptInvitation, confirmEmail, readSession, sendVerification, signUpCompany, type SessionRow } from "../accounts.ts";
import { applySteps, createInvites } from "../changes.ts";
import type { Email } from "../email.ts";
import { freshDatabase } from "../testing/db.ts";
import { botStatus, createLinkCode, handleMessage, isPlatformAdmin, myWhatsApp, requestBot, setBotState, takeBotRequest } from "./bot.ts";
import { localClock, sendDueBriefs } from "./brief.ts";

const outbox = await mkdtemp(join(tmpdir(), "onefold-wa-outbox-"));
process.env.EMAIL_OUTBOX_DIR = outbox;
process.env.PLATFORM_ADMIN_EMAILS = "ayla@acme.example";

let pg: Awaited<ReturnType<typeof freshDatabase>>;
before(async () => { pg = await freshDatabase(); });
after(async () => { await pg.drop(); await rm(outbox, { recursive: true, force: true }); });

const APP = "https://1fold.test";
const SAM = "923001112222@s.whatsapp.net";
const STRANGER = "92399@s.whatsapp.net";
const PASSWORD = "Correct-Horse-42";
const NONE = { whatsapp: 0, email: 0, none: 0, failed: 0 };

/** A WhatsApp stand-in: records what was sent; `up = false` makes it fail like a dropped connection. */
const whatsapp = {
  up: true,
  reconnecting: false,
  sent: [] as { jid: string; text: string }[],
  connected() { return this.up; },
  waiting() { return this.reconnecting; },
  async send(jid: string, text: string) {
    if (!this.up) throw new Error("WhatsApp isn't connected");
    this.sent.push({ jid, text });
  },
};
const lastSent = () => whatsapp.sent.at(-1)?.text ?? "";
const fromSam = (text: string) => handleMessage({ jid: SAM, phone: "923001112222", text }, whatsapp, APP);
const briefsAt = (iso: string) => sendDueBriefs({ whatsapp, appUrl: APP, at: new Date(iso), gapMs: 0 });
async function emailsTo(to: string): Promise<Email[]> {
  const all = await Promise.all((await readdir(outbox)).sort().map(async (f) => JSON.parse(await readFile(join(outbox, f), "utf8")) as Email));
  return all.filter((m) => m.to === to);
}

let admin: SessionRow;
let dev: SessionRow;
let aylaId = "";
let samId = "";

test("the time of day is the company's: 04:00 UTC is 9:00 on a Friday in Pakistan", () => {
  assert.deepEqual(localClock("Asia/Karachi", new Date("2026-10-16T04:00:00Z")), { day: "2026-10-16", weekday: 5, hour: 9 });
  assert.deepEqual(localClock("Not/A_Zone", new Date("2026-10-16T04:00:00Z")), { day: "2026-10-16", weekday: 5, hour: 9 });
});

test("only platform admins can pair the bot, and the worker takes each request once", async () => {
  const founder = await signUpCompany({ name: "Ayla Khan", email: "ayla@acme.example", password: PASSWORD, company: "Acme", slug: "acme-wa" });
  admin = (await readSession(founder.token))!;
  aylaId = founder.personId;
  await sendVerification(founder.userId, APP);
  await confirmEmail((await emailsTo("ayla@acme.example")).at(-1)!.text.match(/\/verify\/([\w-]{43})/)![1]);
  const { invites } = await createInvites(admin, [{ email: "sam@acme.example", panel: "developer" }], APP);
  const joined = await acceptInvitation(invites[0].link.split("/invite/")[1], { name: "Sam Dev", password: PASSWORD });
  dev = (await readSession(joined.token))!;
  samId = joined.personId;

  await assert.rejects(requestBot(dev, "pair"), AccessError);
  await requestBot(admin, "pair");
  assert.equal((await botStatus()).request, "pair");
  assert.equal(await takeBotRequest(), "pair");
  assert.equal(await takeBotRequest(), null);
  await assert.rejects(createLinkCode(dev), /isn't connected/); // nothing to link to until the bot is up
  await setBotState("connected", { phone: "923000000001" });
  const bot = await botStatus();
  assert.deepEqual([bot.state, bot.phone, bot.request], ["connected", "923000000001", null]);
});

test("a teammate links their number by sending the code; strangers are ignored", async () => {
  const { code, url } = await createLinkCode(dev);
  assert.match(code, /^1FOLD-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(url, `https://wa.me/923000000001?text=${encodeURIComponent(code)}`);

  await handleMessage({ jid: STRANGER, phone: "92399", text: "hello?" }, whatsapp, APP);
  await handleMessage({ jid: STRANGER, phone: "92399", text: "TODAY" }, whatsapp, APP);
  assert.equal(whatsapp.sent.length, 0); // deny by default: not a word to anyone who hasn't linked

  await fromSam(`hi! ${code.toLowerCase()}`);
  assert.match(lastSent(), /Connected to Acme on 1Fold/);
  const mine = await myWhatsApp(dev);
  assert.deepEqual([mine.available, mine.linked?.phone, mine.linked?.briefs], [true, "923001112222", true]);
  assert.equal((await myWhatsApp(admin)).linked, null);

  await handleMessage({ jid: STRANGER, phone: "92399", text: code }, whatsapp, APP);
  assert.match(lastSent(), /didn't work/); // a code works once
  await fromSam("what can you do?");
  assert.match(lastSent(), /Reply TODAY/);
});

test("the brief: Sam's open tickets — overdue, due today, in progress, in review — each once, with links", async () => {
  await applySteps(admin, [
    { name: "createProduct", args: [{ key: "CH", name: "Checkout", type: "internal", pmId: aylaId, projectManagerId: aylaId }] },
    { name: "setMember", args: ["CH", samId, true] },
  ]);
  const tickets: [string, Record<string, unknown>][] = [
    ["Fix the total", { assigneeId: samId, due: "2026-10-15", statusId: "ch-in-progress" }], // CH-1: overdue on the 16th
    ["Ship the cart", { assigneeId: samId, due: "2026-10-16" }], // CH-2: due that day
    ["Build the cart", { assigneeId: samId, statusId: "ch-in-progress" }], // CH-3: in progress
    ["Check the copy", { assigneeId: samId, statusId: "ch-review" }], // CH-4: in review
    ["Old work", { assigneeId: samId, statusId: "ch-done" }], // CH-5: done — not in the brief
    ["Ayla's own", { assigneeId: aylaId, statusId: "ch-in-progress" }], // CH-6: someone else's
  ];
  for (const [title, patch] of tickets) {
    const { key } = await applySteps(admin, [{ name: "createTicket", args: ["CH", title] }]);
    await applySteps(admin, [{ name: "updateTicket", args: [key, patch] }]);
  }

  assert.deepEqual(await briefsAt("2026-10-16T04:05:00Z"), { ...NONE, whatsapp: 1 }); // Friday 9:05 in Pakistan
  const brief = lastSent();
  assert.equal(whatsapp.sent.at(-1)!.jid, SAM);
  assert.match(brief, /^Good morning Sam — your 1Fold tasks at Acme for Friday 16 October:/);
  assert.match(brief, /\*Overdue\* \(1\)\n• CH-1 Fix the total — due 15 Oct\n {2}https:\/\/1fold\.test\/dev\/t\/CH-1/);
  assert.match(brief, /\*Due today\* \(1\)\n• CH-2 Ship the cart\n/);
  assert.match(brief, /\*In progress\* \(1\)\n• CH-3 Build the cart/);
  assert.match(brief, /\*In review\* \(1\)\n• CH-4 Check the copy/);
  assert.ok(!brief.includes("CH-5") && !brief.includes("CH-6"));
  assert.match(brief, /My Work: https:\/\/1fold\.test\/dev\/my-work/);
});

test("one brief a day, only on working days from 9:00 to 18:00; by email when WhatsApp is down", async () => {
  const sent = whatsapp.sent.length;
  assert.deepEqual(await briefsAt("2026-10-16T09:00:00Z"), NONE); // already had Friday's
  assert.deepEqual(await briefsAt("2026-10-17T05:00:00Z"), NONE); // Saturday
  assert.deepEqual(await briefsAt("2026-10-19T03:30:00Z"), NONE); // Monday 8:30 — too early
  assert.deepEqual(await briefsAt("2026-10-19T13:30:00Z"), NONE); // Monday 18:30 — too late, it waits for Tuesday
  assert.equal(whatsapp.sent.length, sent);

  whatsapp.up = false;
  assert.deepEqual(await briefsAt("2026-10-20T04:10:00Z"), { ...NONE, email: 1 }); // Tuesday, WhatsApp down
  const mail = (await emailsTo("sam@acme.example")).at(-1)!;
  assert.equal(mail.subject, "Your tasks today at Acme");
  assert.ok(mail.text.includes("CH-3 Build the cart") && !mail.text.includes("*"));
  assert.ok(mail.text.includes(`${APP}/dev/my-work`));
  whatsapp.up = true;
});

test("STOP pauses the brief, START brings it back, TODAY sends it now", async () => {
  await fromSam("STOP");
  assert.match(lastSent(), /Paused/);
  assert.equal((await myWhatsApp(dev)).linked!.briefs, false);
  assert.deepEqual(await briefsAt("2026-10-21T04:10:00Z"), NONE);
  await fromSam("start");
  assert.equal((await myWhatsApp(dev)).linked!.briefs, true);
  await fromSam("Today");
  assert.match(lastSent(), /Good morning Sam[\s\S]*CH-3 Build the cart/);
});

test("a brief waits for a reconnecting WhatsApp until 11:00, then goes by email; a stuck one is tried again", async () => {
  whatsapp.up = false;
  whatsapp.reconnecting = true;
  assert.deepEqual(await briefsAt("2026-10-22T04:10:00Z"), NONE); // Thursday 9:10: reconnecting — wait, claim nothing
  assert.deepEqual(await briefsAt("2026-10-22T06:05:00Z"), { ...NONE, email: 1 }); // 11:05: still down, so email
  whatsapp.up = true;
  whatsapp.reconnecting = false;

  // The worker died mid-send on Friday: the claim was left "pending". Ten minutes on, it's taken over and sent.
  await pg.asOwner(`insert into brief_deliveries (org_id, member_id, day, channel, at) values ($1, $2, '2026-10-23', 'pending', now() - interval '20 minutes')`, [admin.orgId, samId]);
  assert.deepEqual(await briefsAt("2026-10-23T04:10:00Z"), { ...NONE, whatsapp: 1 });
  assert.deepEqual(await briefsAt("2026-10-23T04:11:00Z"), NONE);
});

test("the other form of a WhatsApp id is the same person; a recycled number moves to its new owner", async () => {
  await handleMessage({ jid: "123456789@lid", phone: "923001112222", text: "help" }, whatsapp, APP);
  assert.equal(whatsapp.sent.at(-1)!.jid, "123456789@lid"); // recognised by the number behind the private id
  assert.match(lastSent(), /Reply TODAY/);

  const { code } = await createLinkCode(admin); // Ayla now links the very same number
  await handleMessage({ jid: SAM, phone: "923001112222", text: code }, whatsapp, APP);
  assert.match(lastSent(), /Connected to Acme/);
  assert.equal((await myWhatsApp(dev)).linked, null); // Sam's briefs can never reach this phone again
  assert.equal((await myWhatsApp(admin)).linked!.phone, "923001112222");
});

test("a brief only shows what the person may see; an unconfirmed email can't manage the bot", async () => {
  const { code } = await createLinkCode(dev);
  await handleMessage({ jid: "923005556666@s.whatsapp.net", phone: "923005556666", text: code }, whatsapp, APP);
  await applySteps(admin, [{ name: "setMember", args: ["CH", samId, false] }]); // Sam leaves Checkout; CH-3 is still his
  await handleMessage({ jid: "923005556666@s.whatsapp.net", phone: "923005556666", text: "today" }, whatsapp, APP);
  assert.match(lastSent(), /Nothing on your plate today/);

  process.env.PLATFORM_ADMIN_EMAILS = "ayla@acme.example,eve@other.example";
  const eve = await signUpCompany({ name: "Eve", email: "eve@other.example", password: PASSWORD, company: "Other", slug: "other-wa" });
  const eveSession = (await readSession(eve.token))!;
  assert.equal(await isPlatformAdmin(eveSession), false); // listed, but she hasn't proven the address is hers
  await assert.rejects(requestBot(eveSession, "pair"), AccessError);
  assert.equal(await isPlatformAdmin(admin), true);
});

test("when WhatsApp logs the bot out, platform admins get one email about it", async () => {
  const before = (await emailsTo("ayla@acme.example")).length;
  await setBotState("logged_out", {}, APP);
  await setBotState("logged_out", {}, APP);
  const alerts = (await emailsTo("ayla@acme.example")).slice(before);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].subject, "1Fold's WhatsApp bot was disconnected");
  assert.ok(alerts[0].text.includes(`${APP}/admin/settings`));
  await assert.rejects(createLinkCode(dev), /isn't connected/);
});
