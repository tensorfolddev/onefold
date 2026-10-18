// The blocks a doc can have — what "/" offers and what a block's handle can turn it into.
import type { Editor, Range } from "@tiptap/core";
import {
  CircleAlert, Code2, Heading1, ImageIcon, Paperclip, Heading2, Heading3, Info, Lightbulb, List, ListChecks, ListOrdered, Minus, Pilcrow, Quote,
  Table2, TriangleAlert, type LucideIcon,
} from "lucide-react";

export interface Block {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  keywords: string;
  /** Turns the current block into this one (after removing the typed "/query", when given a range). */
  run: (editor: Editor, range?: Range) => void;
  /** Offered when turning an existing block into another (not for inserted things like a table). */
  convertible?: boolean;
}

/** Asks the open editor to show a file picker (DocEditor listens and uploads what's chosen). */
const pickFile = (accept: string) => window.dispatchEvent(new CustomEvent("doc:pick-file", { detail: { accept } }));

const at = (editor: Editor, range?: Range) => (range ? editor.chain().focus().deleteRange(range) : editor.chain().focus());

export const BLOCKS: Block[] = [
  { id: "text", label: "Text", hint: "Plain writing", icon: Pilcrow, keywords: "paragraph p", convertible: true, run: (e, r) => at(e, r).setParagraph().run() },
  { id: "h1", label: "Heading 1", hint: "Big section heading", icon: Heading1, keywords: "title h1 #", convertible: true, run: (e, r) => at(e, r).setHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", hint: "Medium heading", icon: Heading2, keywords: "subtitle h2 ##", convertible: true, run: (e, r) => at(e, r).setHeading({ level: 2 }).run() },
  { id: "h3", label: "Heading 3", hint: "Small heading", icon: Heading3, keywords: "h3 ###", convertible: true, run: (e, r) => at(e, r).setHeading({ level: 3 }).run() },
  { id: "bullet", label: "Bulleted list", hint: "A simple list", icon: List, keywords: "ul unordered -", convertible: true, run: (e, r) => at(e, r).toggleBulletList().run() },
  { id: "numbered", label: "Numbered list", hint: "Steps in order", icon: ListOrdered, keywords: "ol ordered 1.", convertible: true, run: (e, r) => at(e, r).toggleOrderedList().run() },
  { id: "todo", label: "To-do list", hint: "Track tasks with checkboxes", icon: ListChecks, keywords: "task checkbox check []", convertible: true, run: (e, r) => at(e, r).toggleTaskList().run() },
  { id: "quote", label: "Quote", hint: "Capture a quote", icon: Quote, keywords: "blockquote >", convertible: true, run: (e, r) => at(e, r).toggleBlockquote().run() },
  { id: "note", label: "Note", hint: "Callout for context", icon: Info, keywords: "callout info", run: (e, r) => at(e, r).setCallout("note").run() },
  { id: "tip", label: "Tip", hint: "Callout for advice", icon: Lightbulb, keywords: "callout hint", run: (e, r) => at(e, r).setCallout("tip").run() },
  { id: "warning", label: "Warning", hint: "Callout for risks", icon: TriangleAlert, keywords: "callout caution danger", run: (e, r) => at(e, r).setCallout("warning").run() },
  { id: "important", label: "Important", hint: "Callout that must be read", icon: CircleAlert, keywords: "callout must", run: (e, r) => at(e, r).setCallout("important").run() },
  { id: "code", label: "Code", hint: "Code with highlighting", icon: Code2, keywords: "snippet ``` pre", convertible: true, run: (e, r) => at(e, r).toggleCodeBlock().run() },
  { id: "table", label: "Table", hint: "Rows and columns", icon: Table2, keywords: "grid", run: (e, r) => at(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "image", label: "Image", hint: "Upload or paste a picture", icon: ImageIcon, keywords: "picture photo png jpg screenshot", run: (e, r) => { at(e, r).run(); pickFile("image/*"); } },
  { id: "file", label: "File", hint: "Attach any file", icon: Paperclip, keywords: "attachment pdf upload document", run: (e, r) => { at(e, r).run(); pickFile(""); } },
  { id: "divider", label: "Divider", hint: "Separate sections", icon: Minus, keywords: "hr line --- separator", run: (e, r) => at(e, r).setHorizontalRule().run() },
];

/** Blocks matching what's typed after "/", best first (label start, then anywhere, then keywords). */
export function matchBlocks(query: string): Block[] {
  const q = query.trim().toLowerCase();
  if (!q) return BLOCKS;
  const score = (b: Block) => (b.label.toLowerCase().startsWith(q) ? 0 : b.label.toLowerCase().includes(q) ? 1 : b.keywords.includes(q) ? 2 : 3);
  return BLOCKS.filter((b) => score(b) < 3).sort((a, b) => score(a) - score(b));
}
