// Each company's own WhatsApp number and the daily brief on a real Postgres, with a fake WhatsApp (the real one needs a
// phone) and emails caught in an outbox: who may set the number up, linking by code, deny-by-default, 1FOLD replies,
// the brief's template, once a day at 9:00 on working days, the email fallback, and the logged-out alert.
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
import { createLinkCode, handleMessage, myWhatsApp } from "./bot.ts";
import { companyBot, requestCompanyBot, setCompanyBotState, takeCompanyBotRequests } from "./companyBot.ts";
import { localClock, sendDueBriefs } from "./brief.ts";
import { textOf } from "./bridge.ts";
import { companyWhatsApp, saveSettings } from "./settings.ts";

const outbox = await mkdtemp(join(tmpdir(), "onefold-wa-outbox-"));
process.env.EMAIL_OUTBOX_DIR = outbox;

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
const fromSam = (text: string) => handleMessage({ jid: SAM, phone: "923001112222", text }, whatsapp, APP, admin.orgId);
const briefsAt = (iso: string) => sendDueBriefs({ whatsappFor: () => whatsapp, appUrl: APP, at: new Date(iso), gapMs: 0 });
async function emailsTo(to: string): Promise<Email[]> {
  const all = await Promise.all((await readdir(outbox)).sort().map(async (f) => JSON.parse(await readFile(join(outbox, f), "utf8")) as Email));
  return all.filter((m) => m.to === to);
}

let admin: SessionRow;
let dev: SessionRow;
let aylaId = "";
let samId = "";

test("a message's text is found inside WhatsApp's envelopes (disappearing, view once, edited)", () => {
  assert.equal(textOf({ conversation: "1FOLD-ABC234" }), "1FOLD-ABC234");
  assert.equal(textOf({ extendedTextMessage: { text: "hi https://x" } }), "hi https://x");
  assert.equal(textOf({ ephemeralMessage: { message: { conversation: "1FOLD-ABC234" } } }), "1FOLD-ABC234");
  assert.equal(textOf({ ephemeralMessage: { message: { viewOnceMessageV2: { message: { extendedTextMessage: { text: "today" } } } } } }), "today");
  assert.equal(textOf({ imageMessage: {} }), "");
  assert.equal(textOf(null), "");
});

test("the time of day is the company's: 04:00 UTC is 9:00 on a Friday in Pakistan", () => {
  assert.deepEqual(localClock("Asia/Karachi", new Date("2026-10-16T04:00:00Z")), { day: "2026-10-16", weekday: 5, hour: 9, minute: 0 });
  assert.deepEqual(localClock("Not/A_Zone", new Date("2026-10-16T04:35:00Z")), { day: "2026-10-16", weekday: 5, hour: 9, minute: 35 });
});

test("only the company's admins set up its own number, and the worker takes each request once", async () => {
  const founder = await signUpCompany({ name: "Ayla Khan", email: "ayla@acme.example", password: PASSWORD, company: "Acme", slug: "acme-wa" });
  admin = (await readSession(founder.token))!;
  aylaId = founder.personId;
  await sendVerification(founder.userId, APP);
  await confirmEmail((await emailsTo("ayla@acme.example")).at(-1)!.text.match(/\/verify\/([\w-]{43})/)![1]);
  const { invites } = await createInvites(admin, [{ email: "sam@acme.example", panel: "developer" }], APP);
  const joined = await acceptInvitation(invites[0].link.split("/invite/")[1], { name: "Sam Dev", password: PASSWORD });
  dev = (await readSession(joined.token))!;
  samId = joined.personId;

  await assert.rejects(requestCompanyBot(dev, "pair"), AccessError);
  await assert.rejects(createLinkCode(dev), /isn't connected/); // no shared number: nothing to link to until Acme's is up
  await requestCompanyBot(admin, "pair");
  assert.deepEqual(await takeCompanyBotRequests(), [{ orgId: admin.orgId, request: "pair" }]);
  assert.deepEqual(await takeCompanyBotRequests(), []);
  await assert.rejects(createLinkCode(dev), /isn't connected/); // being set up, not paired yet
  await setCompanyBotState(admin.orgId, "connected", { phone: "923000000001" });
  const bot = await companyBot(admin.orgId);
  assert.deepEqual([bot?.state, bot?.phone, bot?.request], ["connected", "923000000001", null]);
});

test("a teammate links their number by sending the code; strangers are ignored", async () => {
  const { code, url } = await createLinkCode(dev);
  assert.match(code, /^1FOLD-[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(url, `https://wa.me/923000000001?text=${encodeURIComponent(code)}`);

  await handleMessage({ jid: STRANGER, phone: "92399", text: "hello?" }, whatsapp, APP, admin.orgId);
  await handleMessage({ jid: STRANGER, phone: "92399", text: "TODAY" }, whatsapp, APP, admin.orgId);
  assert.equal(whatsapp.sent.length, 0); // deny by default: not a word to anyone who hasn't linked

  await fromSam(`hi! ${code.toLowerCase()}`);
  assert.equal(lastSent().split("\n").slice(0, 2).join("\n"), "✅ *You're connected to 1FOLD*\n_Acme_");
  const mine = await myWhatsApp(dev);
  assert.deepEqual([mine.available, mine.linked?.phone, mine.linked?.briefs], [true, "923001112222", true]);
  assert.equal((await myWhatsApp(admin)).linked, null);

  await handleMessage({ jid: STRANGER, phone: "92399", text: code }, whatsapp, APP, admin.orgId);
  assert.match(lastSent(), /didn't work/); // a code works once
  await fromSam("what can you do?");
  assert.match(lastSent(), /Reply \*1FOLD\* anytime for your pending tasks/);
});

test("the brief is the team's template: Sam's pending tickets by project, soonest due first, with links", async () => {
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
  // The team's template, exactly: every pending ticket by project, soonest due first (CH-5 is done, CH-6 is Ayla's).
  assert.equal(brief, [
    "━━━━━━━━━━━━━━",
    "        *Acme*",
    "  16-October-2026 | Friday",
    "━━━━━━━━━━━━━━",
    "",
    "",
    "*Good Morning, Sam,*",
    "",
    "You have total *4 tasks* pending",
    "",
    "🧩🧩  *Checkout* : 4 Tasks pending",
    "",
    "",
    "",
    "",
    "🧩🧩  *Checkout*",
    "━━━━━━━━━━",
    "*1. CH-1* Fix the total",
    "   • *Due:* 15-October-2026",
    "   • *Link:* https://1fold.test/t/CH-1",
    "",
    "*2. CH-2* Ship the cart",
    "   • *Due:* 16-October-2026",
    "   • *Link:* https://1fold.test/t/CH-2",
    "",
    "*3. CH-3* Build the cart",
    "   • *Due:* No due date",
    "   • *Link:* https://1fold.test/t/CH-3",
    "",
    "*4. CH-4* Check the copy",
    "   • *Due:* No due date",
    "   • *Link:* https://1fold.test/t/CH-4",
    "━━━━━━━━━━━━━━",
    "📋 All your work: https://1fold.test/my-work",
    "",
    "Reply *1FOLD* anytime for updates.",
    "",
    "🤍 *1FOLD By TensorFold* 🤍",
  ].join("\n"));
});

test("an urgent @@mention goes to their WhatsApp with the message and a link; a normal @mention stays in the app", async () => {
  process.env.APP_URL = APP; // links in messages are absolute
  const queued = () => pg.asOwner<{ jid: string; text: string; member_id: string; kind: string }>("select jid, text, member_id, kind from whatsapp_outbox order by id");
  const before = (await queued()).length;
  await applySteps(admin, [{ name: "addComment", args: ["CH-1", "@Sam Dev have a look when you can"] }]);
  assert.equal((await queued()).length, before); // a normal mention: in the app only
  await applySteps(admin, [{ name: "addComment", args: ["CH-1", "@@Sam Dev the checkout is down — please look now"] }]);
  const rows = (await queued()).slice(before);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].jid, rows[0].member_id, rows[0].kind], [SAM, samId, "urgent"]);
  assert.match(rows[0].text, /🚨 \*Ayla Khan\* needs you/);
  assert.match(rows[0].text, /mentioned you in \*CH-1 /);
  assert.match(rows[0].text, /“@@Sam Dev the checkout is down — please look now”/);
  assert.match(rows[0].text, new RegExp(`${APP}/dev/t/CH-1`)); // Sam's own panel
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
  assert.ok(mail.text.includes("3. CH-3 Build the cart") && !/[*━🤍]/u.test(mail.text));
  assert.ok(mail.text.includes(`${APP}/dev/my-work`));
  whatsapp.up = true;
});

test("replying 1FOLD (or TODAY) sends the brief now; there's no STOP — the brief can't be switched off", async () => {
  await fromSam("1FOLD");
  assert.match(lastSent(), /\*Good (Morning|Afternoon|Evening), Sam,\*[\s\S]*\*3\. CH-3\* Build the cart/);
  await fromSam("today");
  assert.match(lastSent(), /You have total \*4 tasks\* pending/);
  await fromSam("STOP");
  assert.match(lastSent(), /This is 1FOLD/); // just the help
  assert.equal((await myWhatsApp(dev)).linked!.briefs, true);
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
  await handleMessage({ jid: "123456789@lid", phone: "923001112222", text: "help" }, whatsapp, APP, admin.orgId);
  assert.equal(whatsapp.sent.at(-1)!.jid, "123456789@lid"); // recognised by the number behind the private id
  assert.match(lastSent(), /This is 1FOLD/);

  const { code } = await createLinkCode(admin); // Ayla now links the very same number
  await handleMessage({ jid: SAM, phone: "923001112222", text: code }, whatsapp, APP, admin.orgId);
  assert.match(lastSent(), /You're connected to 1FOLD\*\n_Acme_/);
  assert.equal((await myWhatsApp(dev)).linked, null); // Sam's briefs can never reach this phone again
  assert.equal((await myWhatsApp(admin)).linked!.phone, "923001112222");
});

test("a brief only shows what the person may see", async () => {
  const { code } = await createLinkCode(dev);
  await handleMessage({ jid: "923005556666@s.whatsapp.net", phone: "923005556666", text: code }, whatsapp, APP, admin.orgId);
  await applySteps(admin, [{ name: "setMember", args: ["CH", samId, false] }]); // Sam leaves Checkout; CH-3 is still his
  await handleMessage({ jid: "923005556666@s.whatsapp.net", phone: "923005556666", text: "1fold" }, whatsapp, APP, admin.orgId);
  assert.match(lastSent(), /You have no pending tasks 🎉/);

});

test("when WhatsApp logs a company's number out, its admins get one email about it; until it's back, nobody can link", async () => {
  const before = (await emailsTo("ayla@acme.example")).length;
  await setCompanyBotState(admin.orgId, "logged_out");
  await setCompanyBotState(admin.orgId, "logged_out");
  const alerts = (await emailsTo("ayla@acme.example")).slice(before);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].subject, "Acme's WhatsApp number was disconnected");
  assert.ok(alerts[0].text.includes("/admin/integrations/team-bot"));
  assert.equal((await emailsTo("sam@acme.example")).some((m) => m.subject.includes("disconnected")), false); // admins only
  await assert.rejects(createLinkCode(dev), /isn't connected/);
  await setCompanyBotState(admin.orgId, "connected", { phone: "923000000001" }); // scanned again
});

test("admins set their company's WhatsApp — the brief's time and days (or off), the reply words, the messages — and see who's linked and what went out", async () => {
  const SAM2 = "923007778888@s.whatsapp.net"; // Sam's newest number (its own reply allowance)
  const fromSam2 = (text: string) => handleMessage({ jid: SAM2, phone: "923007778888", text }, whatsapp, APP, admin.orgId);
  await fromSam2((await createLinkCode(dev)).code);
  assert.match(lastSent(), /Every working day at \*09:00\* you'll get your pending tasks here/);

  await assert.rejects(saveSettings(dev, { briefAt: "07:30" }), AccessError); // only admins
  await assert.rejects(saveSettings(admin, { briefAt: "25:00" }), /time like 09:00/);
  await assert.rejects(saveSettings(admin, { briefDays: [] }), /at least one day/);
  await saveSettings(admin, { briefAt: "07:30", briefDays: [6], words: ["Status", "1 Fold"], templates: { help: "Hi! Reply {words}. {signOff}", signOff: "— Acme" } });

  await applySteps(admin, [{ name: "setMember", args: ["CH", samId, true] }]); // back on Checkout
  const { key } = await applySteps(admin, [{ name: "createTicket", args: ["CH", "Weekend check"] }]);
  await applySteps(admin, [{ name: "updateTicket", args: [key, { assigneeId: samId }] }]); // something to tell Sam
  assert.deepEqual(await briefsAt("2026-10-24T02:20:00Z"), NONE); // Saturday 7:20 in Pakistan: not yet
  assert.ok((await briefsAt("2026-10-24T02:35:00Z")).whatsapp >= 1); // 7:35 on a Saturday, a brief day now (Ayla's linked too)
  const toSam = whatsapp.sent.filter((m) => m.jid === SAM2).at(-1)?.text ?? "";
  assert.match(toSam, /Weekend check/);
  assert.match(toSam, /Reply \*STATUS\* anytime for updates\.\n\n— Acme$/); // the company's own words
  assert.deepEqual(await briefsAt("2026-10-26T04:10:00Z"), NONE); // Monday isn't a brief day any more

  await fromSam2("1 fold!"); // still one of the words (as the bot hears it: "1fold")
  assert.match(lastSent(), /\*Acme\*/);
  await fromSam2("today"); // not any more
  assert.equal(lastSent(), "Hi! Reply *STATUS*. — Acme");

  await saveSettings(admin, { briefOn: false, briefDays: [0, 1, 2, 3, 4, 5, 6] });
  assert.deepEqual(await briefsAt("2026-10-27T04:10:00Z"), NONE); // off: no brief, any day

  const page = await companyWhatsApp(admin);
  assert.equal(page.linked.find((l) => l.personId === samId)?.phone, "+92 30•••8888"); // enough to tell numbers apart
  assert.ok(page.log.some((d) => d.kind === "brief" && d.status === "sent" && d.personId === samId));
  assert.deepEqual([page.settings.briefOn, page.settings.words], [false, ["status", "1fold"]]);
  await assert.rejects(companyWhatsApp(dev), AccessError);
  await saveSettings(admin, { templates: { help: "", signOff: "" } }); // emptied: back to 1FOLD's own
  assert.equal((await companyWhatsApp(admin)).settings.templates.signOff, "🤍 *1FOLD By TensorFold* 🤍");
});

test("a company's own number: teammates link to it and hear from it; another company's code doesn't link through it; disconnected, the company has no WhatsApp", async () => {
  const { botFor, dropCompanyBot } = await import("./companyBot.ts");
  const { sendOutbox } = await import("./outbox.ts");
  const { queueAlerts } = await import("./urgent.ts");
  const fake = () => ({ sent: [] as { jid: string; text: string }[], async send(jid: string, text: string) { this.sent.push({ jid, text }); } });
  const own = fake();
  const other = fake(); // another company's number

  await setCompanyBotState(admin.orgId, "connected", { phone: "923009990000" }); // Acme moved to a new number
  const { code, url } = await createLinkCode(dev);
  assert.match(url, /^https:\/\/wa\.me\/923009990000\?/); // teammates link to the company's number
  const SAM3 = "923001010101@s.whatsapp.net";
  await handleMessage({ jid: SAM3, phone: "923001010101", text: code }, other, APP, "org-someone-else");
  assert.match(other.sent.at(-1)?.text ?? "", /didn't work/); // another company's number links nothing
  await handleMessage({ jid: SAM3, phone: "923001010101", text: code }, own, APP, admin.orgId);
  assert.match(own.sent.at(-1)?.text ?? "", /You're connected to 1FOLD/); // still good on the right one
  await handleMessage({ jid: SAM3, phone: "923001010101", text: "1FOLD" }, other, APP, "org-someone-else");
  assert.equal(other.sent.length, 1); // Sam isn't linked there: that company's bot says nothing about him

  await queueAlerts(admin.orgId, [{ memberId: samId, text: "🚨 ping" }]);
  await sendOutbox((orgId) => (orgId === admin.orgId ? null : other)); // its number is down: the alert waits
  assert.equal([...own.sent, ...other.sent].some((m) => m.text === "🚨 ping"), false);
  await sendOutbox((orgId) => (orgId === admin.orgId ? own : other)); // back up: sent from the company's number
  assert.deepEqual([own.sent.at(-1)?.text, other.sent.length], ["🚨 ping", 1]);

  await setCompanyBotState(admin.orgId, "connecting"); // paired, briefly down: no other number meanwhile
  await assert.rejects(createLinkCode(dev), /isn't connected/);
  await dropCompanyBot(admin.orgId); // disconnected: no shared number to fall back on
  assert.deepEqual(await botFor(admin.orgId), { state: "off", phone: null });
  await assert.rejects(createLinkCode(dev), /isn't connected/);

  await requestCompanyBot(admin, "pair");
  await requestCompanyBot(admin, "logout"); // cancelled before it was paired: gone at once, no worker needed
  assert.equal(await companyBot(admin.orgId), null);
  await requestCompanyBot(admin, "pair"); // and set up again, for what follows
  assert.deepEqual(await takeCompanyBotRequests(), [{ orgId: admin.orgId, request: "pair" }]);
  await setCompanyBotState(admin.orgId, "connected", { phone: "923000000001" });
});

test("every reply to a linked teammate is in Deliveries — asking for their tasks too; one that can't go waits and goes with the next send", async () => {
  const { sendOutbox } = await import("./outbox.ts");
  const SAM4 = "923002020202@s.whatsapp.net";
  const fromSam4 = (text: string) => handleMessage({ jid: SAM4, phone: "923002020202", text }, whatsapp, APP, admin.orgId);
  await fromSam4((await createLinkCode(dev)).code);
  await fromSam4("1FOLD");
  let log = (await companyWhatsApp(admin)).log.filter((d) => d.personId === samId);
  assert.deepEqual(log.slice(0, 2).map((d) => [d.kind, d.status]), [["asked", "sent"], ["linked", "sent"]]); // newest first
  assert.equal(log[0].preview, "Their pending tasks, sent when they asked");

  whatsapp.up = false; // asked while WhatsApp is down: nothing thrown, nothing lost
  await fromSam4("1fold");
  log = (await companyWhatsApp(admin)).log.filter((d) => d.personId === samId);
  assert.deepEqual([log[0].kind, log[0].status], ["asked", "waiting"]);
  whatsapp.up = true;
  await sendOutbox(whatsapp);
  assert.equal((await companyWhatsApp(admin)).log.find((d) => d.personId === samId)?.status, "sent");
  assert.equal(whatsapp.sent.at(-1)?.jid, SAM4);
});

test("WhatsApp links: a localhost APP_URL becomes this machine's network address (a phone can't open localhost, WhatsApp won't link it); a real domain is kept", async () => {
  const { whatsappLinkBase } = await import("./appLink.ts");
  assert.equal(whatsappLinkBase("http://localhost:3000/", () => "10.0.0.5"), "http://10.0.0.5:3000");
  assert.equal(whatsappLinkBase("http://127.0.0.1:3000", () => "192.168.1.20"), "http://192.168.1.20:3000");
  assert.equal(whatsappLinkBase("https://app.1fold.example", () => "10.0.0.5"), "https://app.1fold.example");
  assert.equal(whatsappLinkBase("http://localhost:3000", () => null), "http://localhost:3000"); // no network: as it is
});
