import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDiff } from "./lineDiff.ts";

test("a version's changes, line by line", () => {
  assert.deepEqual(lineDiff("a\nb\nc", "a\nB\nc\nd"), [
    { kind: "same", text: "a" }, { kind: "removed", text: "b" }, { kind: "added", text: "B" }, { kind: "same", text: "c" }, { kind: "added", text: "d" },
  ]);
  assert.deepEqual(lineDiff("", "x"), [{ kind: "removed", text: "" }, { kind: "added", text: "x" }]);
});
