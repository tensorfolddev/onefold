import { test } from "node:test";
import assert from "node:assert/strict";
import { toDocJson, toMarkdown } from "./markdown.ts";
import { safeHref } from "./links.ts";

const roundTrip = (md: string) => toMarkdown(toDocJson(md));

const CASES: Record<string, string> = {
  headings: "# One\n\n## Two\n\n### Three",
  inline: "Plain **bold** *italic* ~~strike~~ `code` ==highlight== text",
  bullets: "- one\n- two\n  - nested\n- three",
  numbered: "1. first\n2. second\n3. third",
  tasks: "- [ ] to do\n- [x] done",
  quote: "> a wise line",
  divider: "above\n\n---\n\nbelow",
  code: "```ts\nconst x = 1;\n```",
  "callout note": "> [!NOTE]\n> Remember this.",
  "callout tip": "> [!TIP]\n> A tip.",
  "callout warning": "> [!WARNING]\n> Careful.",
  "callout important": "> [!IMPORTANT]\n> Must read.",
  table: "| Name | Role  |\n| ---- | ----- |\n| Ayla | Admin |\n| Sam  | Dev   |", // columns are padded to line up
  link: "See [the spec](https://example.com/spec) now",
};

for (const [name, md] of Object.entries(CASES)) {
  test(`markdown round trip: ${name}`, () => assert.equal(roundTrip(md), md));
}

test("a callout keeps several paragraphs and its type", () => {
  const md = "> [!WARNING]\n> First line.\n>\n> Second paragraph.";
  const json = toDocJson(md);
  assert.equal(json.content?.[0].type, "callout");
  assert.equal(json.content?.[0].attrs?.type, "warning");
  assert.equal(roundTrip(md), md);
});

test("a hand-written table is stored lined up, and then stays the same", () => {
  const once = roundTrip("| Name | Role |\n| --- | --- |\n| Ayla | Admin |");
  assert.equal(roundTrip(once), once);
});

test("a plain quote stays a quote, not a callout", () => {
  assert.equal(toDocJson("> just a quote").content?.[0].type, "blockquote");
});

test("unsafe links are dropped; raw HTML never becomes a node", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("https://ok.example"), "https://ok.example");
  assert.equal(safeHref("/api/files/abc_123"), "/api/files/abc_123");
  assert.equal(safeHref("/admin/settings"), null);
  const json = JSON.stringify(toDocJson("[x](javascript:alert(1))\n\n<script>alert(1)</script>"));
  assert.ok(!json.includes("javascript:"), json);
  assert.ok(!/"type":"(script|html)/.test(json), json);
});

test("every template opens and saves without changing a character", async () => {
  const { DOC_TEMPLATES } = await import("../../../domain/docTemplates.ts");
  for (const t of DOC_TEMPLATES) assert.equal(roundTrip(t.body), t.body, t.id);
});

test("an empty list item or trailing blank lines are never stored (Markdown can't hold them)", () => {
  const item = (type: string, child: string) => ({ type: "doc", content: [
    { type: "paragraph", content: [{ type: "text", text: "Keep" }] },
    { type, content: [{ type: child, ...(child === "taskItem" && { attrs: { checked: false } }), content: [{ type: "paragraph" }] }] },
    { type: "paragraph" },
  ] });
  for (const [list, child] of [["bulletList", "listItem"], ["orderedList", "listItem"], ["taskList", "taskItem"]]) {
    assert.equal(toMarkdown(item(list, child)), "Keep", list);
  }
  assert.equal(roundTrip("1. \n\nAfter"), "After");
});

test("mentions, ticket and doc chips, and link cards keep their Markdown; ordinary links stay links", async () => {
  const { refsIn } = await import("./nodes.ts");
  for (const md of [
    "Ask [@Hina Raza](mention:u-hina) about it",
    "Blocked by [EN-12](ticket:EN-12) and see [Design spec](doc:d-1a2b)",
    "Before\n\n<https://github.com/tensorfold/onefold>\n\nAfter",
    "Read [the guide](https://example.com/guide) first",
  ]) assert.equal(roundTrip(md), md);
  const json = toDocJson("Ask [@Hina](mention:u-hina) and [EN-12](ticket:EN-12)\n\n<https://example.com>");
  const types = JSON.stringify(json);
  assert.match(types, /"type":"mention"/);
  assert.match(types, /"type":"ref"/);
  assert.match(types, /"type":"linkCard"/);
  assert.deepEqual(refsIn("[@A](mention:u-a) [@A](mention:u-a) [X-1](ticket:X-1) [D](doc:d1)\n\n```\n[@B](mention:u-b)\n```\n`[@C](mention:u-c)`"),
    { people: ["u-a"], tickets: ["X-1"], docs: ["d1"] });
});
