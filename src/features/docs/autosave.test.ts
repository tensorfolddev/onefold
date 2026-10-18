import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSaveDelay } from "./autosave.ts";

test("autosave waits for a pause in typing, but never more than five seconds", () => {
  assert.equal(nextSaveDelay(1000, 1000, 1000), 800); // just typed
  assert.equal(nextSaveDelay(1000, 1000, 1500), 300); // still within the pause
  assert.equal(nextSaveDelay(5900, 1000, 5900), 100); // typing non-stop: 5 s after the first unsaved change
  assert.equal(nextSaveDelay(1000, 1000, 9000), 0); // overdue: now
});
