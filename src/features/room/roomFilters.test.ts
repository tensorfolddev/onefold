import { test } from "node:test";
import assert from "node:assert/strict";
import { fixClock } from "../../domain/clock.ts";
import { SEED_TODAY } from "../../domain/seed.ts";
import { demoDb } from "../../data/demo.ts";
import { addClientPerson, createAsk, sendRequirementToClient, setClientSettings } from "../../domain/commands/clients.ts";
import { addRequirement } from "../../domain/commands/requirements.ts";
import { teamRoom } from "../../domain/selectors/room.ts";
import { filterThreads, NO_FILTERS, NO_QUERY } from "./roomFilters.ts";

fixClock(`${SEED_TODAY}T10:00:00`);
const base = demoDb();
const who = (id: string) => base.people.find((p) => p.id === id)!;
const admin = who("u-tayyab"), lead = who("u-ayesha");

test("the toolbar's filters: status, whose move, a person — and sorts", () => {
  let db = setClientSettings(base, admin, { clientSpace: true });
  db = addClientPerson(db, lead, { id: "c-ali", name: "Ali Raza", email: "ali@2n5.example", company: "2N5" }, "AP", "sponsor");
  db = addRequirement(db, lead, "AP", { title: "Pay by card", priority: "nice" }, "rq-1");
  db = sendRequirementToClient(db, lead, "rq-1");
  db = addRequirement(db, lead, "AP", { title: "Refunds", priority: "must" }, "rq-2");
  db = createAsk(db, lead, "AP", { title: "Staging access", kind: "access", assigneeId: "c-ali" }, "ask-1");
  const room = teamRoom(db, lead, "AP")!;
  const reqs = room.threads.filter((t) => t.subject === "req:rq-1" || t.subject === "req:rq-2");
  const none = () => 0;
  const titles = (q: Partial<typeof NO_QUERY>, list = reqs) => filterThreads(room, list, { ...NO_QUERY, ...q }, none).map((t) => t.title);

  assert.deepEqual(titles({ filters: { ...NO_FILTERS, status: ["draft"] } }), ["Refunds"]);
  assert.deepEqual(titles({ filters: { ...NO_FILTERS, waiting: ["client"] } }), ["Pay by card"]); // sent to confirm: their move
  assert.deepEqual(titles({ filters: { ...NO_FILTERS, status: ["draft", "to_confirm"], priority: ["nice"] } }), ["Pay by card"]); // OR within, AND across
  assert.deepEqual(titles({ sort: "priority" }), ["Refunds", "Pay by card"]); // Must before Nice
  assert.deepEqual(titles({ query: "refund" }), ["Refunds"]);
  const asks = room.threads.filter((t) => t.kind === "ask");
  assert.deepEqual(titles({ person: "c-ali" }, asks), ["Staging access"]); // who it's for
  assert.deepEqual(titles({ person: "c-ali" }), []);
});
