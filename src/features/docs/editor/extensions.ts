// The doc editor's building blocks — the same list for the editor in the browser and for Markdown in tests and on the
// server, so what you see is exactly what's stored.
import { Extension, type AnyExtension, type Editor } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Heading from "@tiptap/extension-heading";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Paragraph from "@tiptap/extension-paragraph";
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

// ---------- alignment: paragraphs and headings can be centred or right-aligned (left is the default) ----------
// Markdown has no alignment, so an aligned block carries a one-line comment before it — `<!-- align: center -->` —
// which other Markdown readers simply ignore. (Table columns use Markdown's own :--: instead.)
export const ALIGNS = ["left", "center", "right"] as const;
export type Align = (typeof ALIGNS)[number];
const ALIGNED = /^<!-- align: (left|center|right) -->[ \t]*\n((?:[^\n]+(?:\n|$))+)/;
const alignOf = (v: unknown): Align | null => (v === "center" || v === "right" ? v : null);
const withAlign = (md: unknown, attrs?: { textAlign?: unknown }) => {
  const a = alignOf(attrs?.textAlign);
  return a ? `<!-- align: ${a} -->\n${String(md ?? "")}` : String(md ?? "");
};

/** Whether the selection's text can be aligned: not in a table cell (columns align instead) or a list (Markdown can't keep it). */
export const canAlign = (editor: Editor) => !["table", "listItem", "taskItem"].some((n) => editor.isActive(n));

/** Aligns the paragraphs and headings in the selection (left is the default, so it clears the setting). */
export const alignText = (editor: Editor, align: Align) => {
  if (!canAlign(editor)) return false;
  const textAlign = alignOf(align);
  return editor.chain().focus().updateAttributes("paragraph", { textAlign }).updateAttributes("heading", { textAlign }).run();
};
/** The alignment of the block the selection starts in. */
export const textAlignAt = (editor: Editor): Align =>
  alignOf(editor.getAttributes("paragraph").textAlign) ?? alignOf(editor.getAttributes("heading").textAlign) ?? "left";

const TextAlign = Extension.create({
  name: "textAlign",
  addKeyboardShortcuts() { // as in Google Docs
    return {
      "Mod-Shift-l": () => alignText(this.editor, "left"),
      "Mod-Shift-e": () => alignText(this.editor, "center"),
      "Mod-Shift-r": () => alignText(this.editor, "right"),
    };
  },
  addGlobalAttributes() {
    return [{ types: ["paragraph", "heading"], attributes: { textAlign: {
      default: null,
      parseHTML: (el: HTMLElement) => alignOf(el.style.textAlign),
      renderHTML: (a: { textAlign?: string | null }) => (a.textAlign ? { style: `text-align: ${a.textAlign}` } : {}),
    } } }];
  },
});
const AlignedParagraph = Paragraph.extend({
  renderMarkdown(...args: Parameters<NonNullable<typeof Paragraph.config.renderMarkdown>>) { return withAlign(this.parent?.(...args), args[0]?.attrs); },
});
const AlignedHeading = Heading.extend({
  renderMarkdown(...args: Parameters<NonNullable<typeof Heading.config.renderMarkdown>>) { return withAlign(this.parent?.(...args), args[0]?.attrs); },
}).configure({ levels: [1, 2, 3] });

/** Reads the alignment comment and the block after it. */
const AlignedBlock = Extension.create({
  name: "alignedBlock",
  markdownTokenName: "alignedBlock",
  markdownTokenizer: {
    name: "alignedBlock",
    level: "block",
    start: (src: string) => lineStart(src, /\n<!-- align: (?:left|center|right) -->/),
    tokenize(src, _tokens, lexer) {
      const m = ALIGNED.exec(src);
      return m ? { type: "alignedBlock", raw: m[0], align: m[1], tokens: lexer.blockTokens(m[2]) } : undefined;
    },
  },
  parseMarkdown: (token, helpers) => helpers.parseChildren(token.tokens ?? []).map((n, i) =>
    (i === 0 && (n.type === "paragraph" || n.type === "heading") ? { ...n, attrs: { ...n.attrs, textAlign: alignOf(token.align) } } : n)),
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
      paragraph: false, heading: false, // the aligned ones below
      link: {
        openOnClick: !opts.editable,
        autolink: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
        isAllowedUri: (url) => safeHref(url) !== null,
      },
    }),
    AlignedParagraph, AlignedHeading, TextAlign, AlignedBlock,
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
