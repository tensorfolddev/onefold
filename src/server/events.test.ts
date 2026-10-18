import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEvent } from "./events.ts";

test("live events: versions, doc saves and presence; anything else is ignored", () => {
  assert.deepEqual(parseEvent("org1:42"), { orgId: "org1", event: { type: "version", version: 42 } });
  assert.deepEqual(parseEvent('org1:doc:{"docId":"d1","productKey":"AP","rev":3,"personId":"p1"}'),
    { orgId: "org1", event: { type: "doc", docId: "d1", productKey: "AP", rev: 3, personId: "p1" } });
  assert.equal(parseEvent('org1:presence:{"docId":"d1","productKey":"","people":[]}')?.event.type, "presence");
  assert.equal(parseEvent("org1:doc:not json"), null);
  assert.equal(parseEvent("org1:other:{}"), null);
  assert.equal(parseEvent("nonsense"), null);
});
