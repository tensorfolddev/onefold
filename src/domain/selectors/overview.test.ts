// A project's overview: progress, what's late or due soon, status mix, epics, who carries what, and the latest activity.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import type { Ticket } from "../types.ts";
import { projectOverview } from "./overview.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const db0 = demoDb();
const st = (cat: string) => db0.statusesByProduct.AP.find((s) => s.category === cat)!.id;
const day = (n: number) => new Date(Date.parse(`${SEED_TODAY}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const people = db0.products.find((p) => p.key === "AP")!;
const [a, b] = [people.pmId, people.memberIds[0] ?? people.projectManagerId];
const base = { productKey: "AP", type: "task" as const, priority: "medium" as const, estimateH: 1 };
const tickets: Ticket[] = [
  { ...base, key: "AP-901", title: "Epic", type: "epic", statusId: db0.statusesByProduct.AP.find((s) => s.system === "epic")!.id },
  { ...base, key: "AP-902", title: "Done one", statusId: st("done"), epicKey: "AP-901", assigneeIds: [a] },
  { ...base, key: "AP-903", title: "Late one", statusId: st("in_progress"), due: day(-2), epicKey: "AP-901", assigneeIds: [a, b] },
  { ...base, key: "AP-904", title: "Due soon", statusId: st("todo"), due: day(3), assigneeIds: [b] },
  { ...base, key: "AP-905", title: "Far off", statusId: st("todo"), due: day(40) },
  { ...base, key: "AP-906", title: "Done but late", statusId: st("done"), due: day(-5) },
  { ...base, key: "AP-907", title: "Archived", statusId: st("todo"), due: day(-1), archivedAt: `${SEED_TODAY}T09:00:00Z` },
];
const db = { ...db0, tickets: [...db0.tickets.filter((t) => t.productKey !== "AP"), ...tickets],
  activity: [{ id: "x1", ticketKey: "AP-903", at: `${SEED_TODAY}T09:00:00Z`, actorId: a, field: "Status" as const, to: "In Progress" },
    { id: "x2", ticketKey: "OF-1", at: `${SEED_TODAY}T09:30:00Z`, actorId: a, field: "Created" as const, to: "" }] };

test("counts open, done and late work, ignoring epics and archived tickets", () => {
  const o = projectOverview(db, "AP");
  assert.deepEqual([o.total, o.done, o.open, o.pct], [5, 2, 3, 40]);
  assert.deepEqual(o.overdue.map((t) => t.key), ["AP-903"]); // done tickets are never late
  assert.deepEqual(o.dueSoon.map((t) => t.key), ["AP-904"]); // the next 14 days
  assert.equal(o.byStatus.reduce((n, s) => n + s.count, 0), 5);
});

test("epics with their progress, people with what they carry, and this project's activity only", () => {
  const o = projectOverview(db, "AP");
  assert.deepEqual(o.epics.map((e) => [e.epic.key, e.done, e.total]), [["AP-901", 1, 2]]);
  const mine = o.team.find((m) => m.person.id === a)!;
  assert.deepEqual([mine.open, mine.done], [1, 1]);
  assert.deepEqual(o.activity.map((x) => x.id), ["x1"]);
});

test("an epic is never a blocker, though its Epic list shares the stuck colour", async () => {
  const { isBlocked } = await import("./dashboard.ts");
  const stuck = db0.statusesByProduct.AP.find((s) => s.tone === "stuck" && !s.system)!.id;
  assert.equal(isBlocked(db, tickets[0]), false); // the epic
  assert.equal(isBlocked(db, { ...tickets[1], statusId: stuck }), true);
});
