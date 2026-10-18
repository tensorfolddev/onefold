"use client";

// The doc editor: Markdown in, Markdown out. Type Markdown and it becomes blocks (# heading, - list, [] to-do,
// > quote, ``` code, --- divider); "/" opens the block menu; selecting text shows the toolbar. Loaded only on doc
// pages (next/dynamic), so nothing else pays for it.
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import { BlockHandle } from "./BlockHandle";
import { BubbleToolbar } from "./BubbleToolbar";
import { chipExtensions, CHIP_NODES } from "./Chips";
import { connectExtensions, type DocLinks } from "./Connect";
import { docExtensions } from "./extensions";
import { toDocJson, toMarkdown } from "./markdown";
import { SlashCommand } from "./SlashMenu";

export interface Heading { level: number; text: string; pos: number }

const headingsOf = (doc: JSONContent): Heading[] => {
  const out: Heading[] = [];
  let pos = 0;
  for (const n of doc.content ?? []) {
    if (n.type === "heading") out.push({ level: Number(n.attrs?.level ?? 1), text: (n.content ?? []).map((c) => c.text ?? "").join(""), pos });
    pos += 1; // ponytail: block index, not a ProseMirror position — the contents rail scrolls by index
  }
  return out;
};

export type { DocLinks };

export default function DocEditor({ body, editable, onChange, onHeadings, placeholder, links }: {
  body: string;
  editable: boolean;
  /** Who can be mentioned, and the tickets and docs that can be linked — read when a picker opens. */
  links: DocLinks;
  /** Called with the doc as Markdown after each change. */
  onChange: (markdown: string) => void;
  onHeadings?: (headings: Heading[]) => void;
  placeholder?: string;
}) {
  const content = useMemo(() => toDocJson(body), [body]);
  // The pickers read the latest links when they open; the editor itself is made once.
  const [connect] = useState(() => {
    let current = links;
    return { set: (next: DocLinks) => { current = next; }, extensions: connectExtensions(() => current) };
  });
  useEffect(() => connect.set(links), [connect, links]);
  const editor = useEditor({
    extensions: [
      ...docExtensions({ editable, placeholder }).filter((e) => !CHIP_NODES.has(e.name)), ...chipExtensions,
      SlashCommand, ...connect.extensions,
    ],
    content,
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "doc-prose", "aria-label": "Document", spellcheck: "true" } },
    onUpdate: ({ editor: e }) => {
      const json = e.getJSON();
      onChange(toMarkdown(json));
      onHeadings?.(headingsOf(json));
    },
    onCreate: ({ editor: e }) => onHeadings?.(headingsOf(e.getJSON())),
  }, []);

  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);

  if (!editor) return <div className="doc-skeleton" aria-busy="true" />;
  return (
    <div className="doc-editor">
      <EditorContent editor={editor} />
      {editable && <BubbleToolbar editor={editor} />}
      {editable && <BlockHandle editor={editor} />}
    </div>
  );
}

/** Scrolls the open editor to its n-th top-level block (a heading in the contents rail). */
export function scrollToBlock(index: number) {
  const el = document.querySelector<HTMLElement>(`.doc-prose > :nth-child(${index + 1})`);
  el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
