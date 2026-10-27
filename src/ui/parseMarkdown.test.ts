import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInline, parseMarkdown } from "./parseMarkdown.ts";

test("inline marks: bold, italic, struck, code, links — nested, and \\-escaped ones stay plain", () => {
  assert.deepEqual(parseInline("a **b *c* d** ~~d~~ `e*f` [g](https://x.y)"), [
    { t: "text", v: "a " },
    { t: "strong", c: [{ t: "text", v: "b " }, { t: "em", c: [{ t: "text", v: "c" }] }, { t: "text", v: " d" }] },
    { t: "text", v: " " }, { t: "s", c: [{ t: "text", v: "d" }] },
    { t: "text", v: " " }, { t: "code", v: "e*f" },
    { t: "text", v: " " }, { t: "link", label: "g", target: "https://x.y" },
  ]);
  assert.deepEqual(parseMarkdown("2 \\* 3 * 4 and snake_case_name"), [{ t: "p", lines: [[{ t: "text", v: "2 * 3 * 4 and snake_case_name" }]] }]);
});

test("blocks: heading, a list with a checklist and a nested item, a quote, code, a divider; one Enter is a new line", () => {
  const md = "# Plan\nFirst line\nsecond line\n\n- one\n  - inner\n- [x] done\n- [ ] todo\n\n> quoted **b**\n\n```\nlet x = *1*;\n```\n---\n1. a\n2. b";
  const [h, p, list, quote, pre, hr, ol] = parseMarkdown(md);
  assert.deepEqual(h, { t: "h", level: 1, c: [{ t: "text", v: "Plan" }] });
  assert.deepEqual(p, { t: "p", lines: [[{ t: "text", v: "First line" }], [{ t: "text", v: "second line" }]] });
  assert.equal(list.t === "list" && list.items.length, 3);
  assert.deepEqual(list.t === "list" && list.items.map((i) => [i.task, i.children.length]), [[undefined, 1], ["done", 0], ["todo", 0]]);
  assert.equal(quote.t === "quote" && quote.c[0].t, "p");
  assert.deepEqual(pre, { t: "pre", v: "let x = *1*;" });
  assert.deepEqual(hr, { t: "hr" });
  assert.equal(ol.t === "list" && ol.ordered, true);
});
