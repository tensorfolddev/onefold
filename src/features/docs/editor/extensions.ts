// The doc editor's building blocks — the same list for the editor in the browser and for Markdown in tests and on the
// server, so what you see is exactly what's stored.
import type { AnyExtension } from "@tiptap/core";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Highlight from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { Callout } from "./callout.ts";
import { safeHref } from "./links.ts";

export const lowlight = createLowlight(common);

/** Tables render with a leading newline of their own, which would leave a double blank line before every table. */
const DocTable = Table.extend({
  renderMarkdown(...args: Parameters<NonNullable<typeof Table.config.renderMarkdown>>) {
    return String(this.parent?.(...args) ?? "").replace(/^\n+|\n+$/g, "");
  },
}).configure({ resizable: false });

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
    DocTable, TableRow, TableHeader, TableCell,
    Callout,
    Placeholder.configure({ placeholder: opts.placeholder ?? "Write, or press / for blocks…" }),
    Markdown,
  ];
}
