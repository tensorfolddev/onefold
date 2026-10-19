// The doc editor's building blocks — the same list for the editor in the browser and for Markdown in tests and on the
// server, so what you see is exactly what's stored.
import { Extension, type AnyExtension } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow, TableView } from "@tiptap/extension-table";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { Callout } from "./callout.ts";
import { FileCard, LinkCard, Mention, Ref } from "./nodes.ts";
import { lineStart, safeHref } from "./links.ts";

export const lowlight = createLowlight(common);

export const HEADER_COLORS = ["gray", "blue", "green", "yellow", "orange", "red", "purple", "pink"] as const;
const STYLED_TABLE = /^<!-- table: header=([a-z]+) -->[ \t]*\n((?:[ \t]*\|.*(?:\n|$))+)/;

/** The table's editor view, kept in step with its header colour (the stock view only updates column widths). */
class ColoredTableView extends TableView {
  constructor(...args: ConstructorParameters<typeof TableView>) {
    super(...args);
    this.paint(args[0]);
  }
  update(node: PMNode) {
    const ok = super.update(node);
    if (ok) this.paint(node);
    return ok;
  }
  private paint(node: PMNode) {
    const color = node.attrs.headerColor as string | null;
    if (color) this.table.dataset.headerColor = color; else delete this.table.dataset.headerColor;
  }
}

/**
 * Tables, with an optional header colour. Markdown has no colours, so a coloured table carries a one-line comment
 * before it — `<!-- table: header=blue -->` — which other Markdown readers simply ignore.
 */
const DocTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      headerColor: {
        default: null,
        parseHTML: (el: HTMLElement) => el.dataset.headerColor ?? null,
        renderHTML: (a: { headerColor?: string | null }) => (a.headerColor ? { "data-header-color": a.headerColor } : {}),
      },
    };
  },
  renderMarkdown(...args: Parameters<NonNullable<typeof Table.config.renderMarkdown>>) {
    const md = String(this.parent?.(...args) ?? "").replace(/^\n+|\n+$/g, "");
    const color = args[0]?.attrs?.headerColor;
    return color ? `<!-- table: header=${color} -->\n${md}` : md;
  },
}).configure({ resizable: false, View: ColoredTableView });

/** Reads the coloured-table comment and the table after it (its own token, since handlers go by token name). */
const StyledTable = Extension.create({
  name: "styledTable",
  markdownTokenName: "styledTable",
  markdownTokenizer: {
    name: "styledTable",
    level: "block",
    start: (src: string) => lineStart(src, /\n<!-- table: header=/),
    tokenize(src, _tokens, lexer) {
      const m = STYLED_TABLE.exec(src);
      if (!m || !(HEADER_COLORS as readonly string[]).includes(m[1])) return undefined;
      return { type: "styledTable", raw: m[0], color: m[1], tokens: lexer.blockTokens(m[2]) };
    },
  },
  parseMarkdown: (token, helpers) => {
    const [table] = helpers.parseChildren(token.tokens ?? []);
    return table ? { ...table, attrs: { ...table.attrs, headerColor: token.color } } : [];
  },
});

/** Images, resizable; the width rides in the Markdown title ("w=480") so it survives a save. */
const DocImage = Image.extend({
  parseMarkdown: (token, h) => {
    const w = /^w=(\d{2,4})$/.exec(String(token.title ?? ""))?.[1];
    return h.createNode("image", { src: safeHref(String(token.href ?? "")) ?? "", alt: token.text || null, ...(w && { width: Number(w) }) });
  },
  renderMarkdown: (node: { attrs?: { src?: string; alt?: string | null; width?: number | null } }) => {
    const w = node.attrs?.width ? ` "w=${Math.round(node.attrs.width)}"` : "";
    return `![${String(node.attrs?.alt ?? "").replace(/[[\]]/g, "")}](${node.attrs?.src ?? ""}${w})`;
  },
}).configure({ inline: false, allowBase64: false, resize: { enabled: true, directions: ["left", "right"], minWidth: 120, alwaysPreserveAspectRatio: true } });

export function docExtensions(opts: { editable: boolean; placeholder?: string }): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false, // the highlighted one below
      underline: false, // Markdown has no underline
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: !opts.editable,
        autolink: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
        isAllowedUri: (url) => safeHref(url) !== null,
      },
    }),
    CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    DocTable, TableRow, TableHeader, TableCell, StyledTable,
    Callout,
    Mention,
    Ref,
    LinkCard,
    FileCard,
    DocImage,
    Placeholder.configure({ placeholder: opts.placeholder ?? "Write, or press / for blocks…" }),
    Markdown,
  ];
}
