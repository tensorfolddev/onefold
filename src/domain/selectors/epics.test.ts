// Epics are numbered within their product — Epic 1, Epic 2… — oldest first.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../clock.ts";
import { SEED_TODAY } from "../seed.ts";
import { demoDb } from "../../data/demo.ts";
import { createTicket } from "../commands/tickets.ts";
import { epicLabel, epicNumber } from "./epics.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const db0 = demoDb();
const admin = db0.people.find((p) => p.id === "u-tayyab")!;
const t = (db: typeof db0, key: string) => db.tickets.find((x) => x.key === key)!;

test("epics count up within their own product, oldest first", () => {
  const first = db0.tickets.find((x) => x.type === "epic" && x.productKey === "AP")!;
  assert.equal(epicNumber(db0, first), 1);
  const { db, key } = createTicket(db0, admin, "AP", "Payments", { statusId: "ap-epic" });
  assert.equal(t(db, key).type, "epic");
  assert.equal(epicLabel(db, t(db, key)), "Epic 2");
  assert.equal(epicNumber(db, first), 1); // a newer epic never renumbers older ones
  const other = createTicket(db, admin, "OF", "Elsewhere", { statusId: db.statusesByProduct.OF.find((s) => s.system === "epic")!.id });
  assert.equal(epicLabel(other.db, t(other.db, other.key)), `Epic ${db.tickets.filter((x) => x.type === "epic" && x.productKey === "OF").length + 1}`);
});
