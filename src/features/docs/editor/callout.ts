// Callout blocks, stored as GitHub alerts so the Markdown reads well anywhere:
//   > [!NOTE]
//   > Text…
import { mergeAttributes, Node, type JSONContent } from "@tiptap/core";
import { lineStart } from "./links.ts";

export const CALLOUT_TYPES = ["note", "tip", "warning", "important"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];
const HEAD = /^ {0,3}> ?\[!(NOTE|TIP|WARNING|IMPORTANT)\][ \t]*(?:\n|$)/i;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: { setCallout: (type?: CalloutType) => ReturnType };
  }
}

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      type: {
        default: "note" as CalloutType,
        parseHTML: (el: HTMLElement) => (CALLOUT_TYPES as readonly string[]).includes(el.dataset.callout ?? "") ? el.dataset.callout : "note",
        renderHTML: (a: { type: CalloutType }) => ({ "data-callout": a.type }),
      },
    };
  },
  parseHTML() { return [{ tag: "div[data-callout]" }]; },
  renderHTML({ HTMLAttributes }) { return ["div", mergeAttributes(HTMLAttributes, { class: "doc-callout" }), 0]; },

  addCommands() {
    return { setCallout: (type = "note") => ({ commands }) => commands.wrapIn(this.name, { type }) };
  },

  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src: string) => lineStart(src, /\n {0,3}> ?\[!(NOTE|TIP|WARNING|IMPORTANT)\]/i),
    tokenize(src, _tokens, lexer) {
      const head = HEAD.exec(src);
      if (!head) return undefined;
      // The callout is the run of ">"-lines that follows its head.
      const rest = src.slice(head[0].length).split("\n");
      const body: string[] = [];
      for (const line of rest) {
        if (!/^ {0,3}>/.test(line)) break;
        body.push(line.replace(/^ {0,3}> ?/, ""));
      }
      const raw = head[0] + rest.slice(0, body.length).join("\n") + (body.length < rest.length ? "\n" : "");
      return { type: "callout", raw, calloutType: head[1].toLowerCase(), tokens: lexer.blockTokens(body.join("\n")) };
    },
  },
  parseMarkdown(token, helpers) {
    const kids = (helpers.parseBlockChildren ?? helpers.parseChildren)(token.tokens ?? []);
    return helpers.createNode("callout", { type: token.calloutType }, kids.length ? kids : [{ type: "paragraph" }]);
  },
  renderMarkdown(node: JSONContent, h) {
    const inner = (node.content ?? []).map((child, i) => h.renderChildren([child]) + (i < (node.content?.length ?? 0) - 1 ? "\n" : "")).join("\n");
    const lines = inner.split("\n").map((l) => (l.trim() === "" ? ">" : `> ${l}`));
    return [`> [!${String(node.attrs?.type ?? "note").toUpperCase()}]`, ...lines].join("\n");
  },
});
