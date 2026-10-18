// Markdown ⇄ editor document, without a browser: the server, MCP and tests use the same rules as the editor.
import type { JSONContent } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { docExtensions } from "./extensions.ts";
import { safeHref } from "./links.ts";

let manager: MarkdownManager | null = null;
const md = () => (manager ??= new MarkdownManager({ extensions: docExtensions({ editable: false }) }));

/** Drops any link whose target a doc may not hold (javascript: and friends); its text stays. */
function clean(node: JSONContent): JSONContent {
  const marks = node.marks?.filter((m) => m.type !== "link" || safeHref(String(m.attrs?.href ?? "")) !== null);
  return {
    ...node,
    ...(node.marks && { marks }),
    ...(node.content && { content: node.content.map(clean) }),
  };
}

const LISTS = new Set(["bulletList", "orderedList", "taskList"]);
const isBlank = (n: JSONContent) => n.type === "paragraph" && !n.content?.length;
const isEmptyItem = (n: JSONContent) => (n.type === "listItem" || n.type === "taskItem") && (n.content ?? []).every(isBlank);

/**
 * Markdown can't hold an empty list item (a lone "- " reads back as text) or blank lines at the end, so neither is
 * stored: empty items and lists left empty are dropped, as are trailing empty paragraphs.
 */
function prune(node: JSONContent, top = true): JSONContent {
  if (!node.content) return node;
  const content = node.content.map((c) => prune(c, false)).filter((c) => !isEmptyItem(c) && !(LISTS.has(c.type ?? "") && !c.content?.length));
  if (top) while (content.length && isBlank(content[content.length - 1])) content.pop();
  return { ...node, content };
}

export const toDocJson = (markdown: string): JSONContent => prune(clean(md().parse(markdown)));
export const toMarkdown = (doc: JSONContent): string => md().serialize(prune(doc)).replace(/^\n+|\n+$/g, "");
