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
import { EmojiCommand, SlashCommand } from "./SlashMenu";
import { TableMenu } from "./TableMenu";

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

export interface Uploaded { id: string; name: string; type: string }

export default function DocEditor({ body, editable, onChange, onHeadings, placeholder, links, uploadFile }: {
  body: string;
  editable: boolean;
  /** Stores one file with the doc; resolves to it, or null when it couldn't be saved (the caller says why). */
  uploadFile?: (file: File) => Promise<Uploaded | null>;
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
    return { set: (next: DocLinks) => { current = next; }, get: () => current, extensions: connectExtensions(() => current) };
  });

  const editor = useEditor({
    extensions: [
      ...docExtensions({ editable, placeholder }).filter((e) => !CHIP_NODES.has(e.name)), ...chipExtensions,
      SlashCommand, EmojiCommand, ...connect.extensions,
    ],
    content,
    editable,
    immediatelyRender: false,
    editorProps: { attributes: { class: "doc-prose", "aria-label": "Document", spellcheck: "true" } },
    onUpdate: ({ editor: e, transaction }) => {
      const json = e.getJSON();
      onHeadings?.(headingsOf(json));
      if (transaction.docChanged && e.isEditable) onChange(toMarkdown(json)); // only a real edit saves — never opening it, never a read-only view
    },
    onCreate: ({ editor: e }) => onHeadings?.(headingsOf(e.getJSON())),
  }, []);

  useEffect(() => { editor?.setEditable(editable, false); }, [editor, editable]); // false: TipTap would otherwise report it as an edit

  // Uploads land where they were dropped (or at the caret): images inline, anything else as a download card.
  useEffect(() => {
    const upload = (files: File[], pos?: number) => {
      if (!editor || !uploadFile) return;
      let at = pos;
      void (async () => {
        for (const f of files) {
          const r = await uploadFile(f);
          if (!r || editor.isDestroyed) continue;
          const src = `/api/files/${r.id}`;
          const node = r.type.startsWith("image/") ? { type: "image", attrs: { src, alt: r.name } } : { type: "fileCard", attrs: { href: src, name: r.name } };
          editor.chain().focus().insertContentAt(at ?? editor.state.selection.to, node).run();
          at = undefined;
        }
      })();
    };
    connect.set({ ...links, upload: editable && uploadFile ? upload : undefined });
  }, [connect, links, editor, editable, uploadFile]);

  // "/image" and "/file" ask for a file picker; what's chosen is uploaded into the doc at the caret.
  useEffect(() => {
    const pick = (e: Event) => {
      const input = Object.assign(document.createElement("input"), { type: "file", multiple: true, accept: (e as CustomEvent<{ accept: string }>).detail.accept });
      input.onchange = () => { if (input.files?.length) connect.get().upload?.([...input.files]); };
      input.click();
    };
    window.addEventListener("doc:pick-file", pick);
    return () => window.removeEventListener("doc:pick-file", pick);
  }, [connect]);

  if (!editor) return <div className="doc-skeleton" aria-busy="true" />;
  return (
    <div className="doc-editor">
      <EditorContent editor={editor} />
      {editable && <BubbleToolbar editor={editor} />}
      {editable && <BlockHandle editor={editor} />}
      {editable && <TableMenu editor={editor} />}
    </div>
  );
}

/** Scrolls the open editor to its n-th top-level block (a heading in the contents rail). */
export function scrollToBlock(index: number) {
  const el = document.querySelector<HTMLElement>(`.doc-prose > :nth-child(${index + 1})`);
  el?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
