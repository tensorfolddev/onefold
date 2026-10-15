import { test } from "node:test";
import assert from "node:assert/strict";
import { assignPositions } from "./positions.ts";

const old = (entries: [string, number][]) => new Map(entries);
const changed = (before: Map<string, number>, after: Map<string, number>) => [...after].filter(([id, p]) => before.get(id) !== p).map(([id]) => id);
const increasing = (order: string[], pos: Map<string, number>) => order.every((id, i) => i === 0 || pos.get(order[i - 1])! < pos.get(id)!);

test("a brand-new list is numbered 1, 2, 3…", () => {
  assert.deepEqual([...assignPositions(["a", "b", "c"], old([]))], [["a", 1], ["b", 2], ["c", 3]]);
});

test("unchanged order rewrites nothing", () => {
  const before = old([["a", 1], ["b", 2], ["c", 3]]);
  assert.deepEqual(changed(before, assignPositions(["a", "b", "c"], before)), []);
});

test("moving one card rewrites only that card, whichever way it moves", () => {
  const before = old([["a", 1], ["b", 2], ["c", 3], ["d", 4], ["e", 5]]);
  for (const order of [["e", "a", "b", "c", "d"], ["b", "c", "d", "e", "a"], ["a", "d", "b", "c", "e"]]) {
    const after = assignPositions(order, before);
    assert.equal(changed(before, after).length, 1, order.join(""));
    assert.ok(increasing(order, after), order.join(""));
  }
});

test("new items slot in between neighbours; removed items just disappear", () => {
  const before = old([["a", 1], ["b", 2], ["c", 3]]);
  const after = assignPositions(["x", "a", "y", "z", "c", "w"], before);
  assert.deepEqual(changed(before, after).sort(), ["w", "x", "y", "z"]);
  assert.ok(increasing(["x", "a", "y", "z", "c", "w"], after));
  assert.equal(after.has("b"), false);
});

test("many inserts at the same spot stay in order, renumbering once when the gap runs out", () => {
  let order = ["a", "z"];
  let pos = assignPositions(order, old([]));
  for (let n = 0; n < 80; n++) {
    order = ["a", `n${n}`, ...order.slice(1)];
    pos = assignPositions(order, pos);
    assert.ok(increasing(order, pos), `insert ${n}`);
  }
});
