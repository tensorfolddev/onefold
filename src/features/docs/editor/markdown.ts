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

export const toDocJson = (markdown: string): JSONContent => clean(md().parse(markdown));
export const toMarkdown = (doc: JSONContent): string => md().serialize(doc).replace(/^\n+|\n+$/g, "");
