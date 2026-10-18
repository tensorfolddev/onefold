"use client";

// Select text → a small toolbar: bold, italic, strike, code, highlight, link.
import type { Editor } from "@tiptap/core";
import { CellSelection } from "@tiptap/pm/tables";
import { BubbleMenu } from "@tiptap/react/menus";
import { Bold, Code, Highlighter, Italic, Link2, Strikethrough, Unlink } from "lucide-react";
import { useEffect, useState } from "react";
import { safeHref } from "./links";

const MARKS = [
  { mark: "bold", label: "Bold", icon: Bold, keys: "⌘B", run: (e: Editor) => e.chain().focus().toggleBold().run() },
  { mark: "italic", label: "Italic", icon: Italic, keys: "⌘I", run: (e: Editor) => e.chain().focus().toggleItalic().run() },
  { mark: "strike", label: "Strikethrough", icon: Strikethrough, keys: "⌘⇧S", run: (e: Editor) => e.chain().focus().toggleStrike().run() },
  { mark: "code", label: "Inline code", icon: Code, keys: "⌘E", run: (e: Editor) => e.chain().focus().toggleCode().run() },
  { mark: "highlight", label: "Highlight", icon: Highlighter, keys: "⌘⇧H", run: (e: Editor) => e.chain().focus().toggleHighlight().run() },
];

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    const open = () => setLinking(String(editor.getAttributes("link").href ?? ""));
    window.addEventListener("doc:link", open);
    return () => window.removeEventListener("doc:link", open);
  }, [editor]);

  const saveLink = () => {
    const url = (linking ?? "").trim();
    if (!url) editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else {
      const href = safeHref(/^[a-z]+:/i.test(url) || url.startsWith("/") ? url : `https://${url}`);
      if (!href) { setBad(true); return; }
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinking(null);
  };

  return (
    <BubbleMenu
      editor={editor} className="doc-bubble" options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: e, from, to }) => e.isEditable && from !== to && !e.isActive("codeBlock") && !(e.state.selection instanceof CellSelection)}
    >
      {linking !== null ? (
        <form className="doc-bubble-link" onSubmit={(ev) => { ev.preventDefault(); saveLink(); }}>
          <input
            autoFocus type="url" inputMode="url" placeholder="Paste a link…" aria-label="Link address" aria-invalid={bad}
            value={linking} onChange={(ev) => { setLinking(ev.target.value); setBad(false); }}
            onKeyDown={(ev) => { if (ev.key === "Escape") { ev.preventDefault(); setLinking(null); editor.commands.focus(); } }}
          />
          <button type="submit" className="doc-bubble-btn">Save</button>
        </form>
      ) : (
        <>
          {MARKS.map((m) => (
            <button
              key={m.mark} type="button" className={`doc-bubble-btn${editor.isActive(m.mark) ? " is-on" : ""}`}
              aria-label={m.label} aria-pressed={editor.isActive(m.mark)} title={`${m.label} ${m.keys}`}
              onMouseDown={(ev) => ev.preventDefault()} onClick={() => m.run(editor)}
            >
              <m.icon aria-hidden />
            </button>
          ))}
          <span className="doc-bubble-sep" aria-hidden />
          {editor.isActive("link") ? (
            <button type="button" className="doc-bubble-btn is-on" aria-label="Remove link" title="Remove link"
              onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}>
              <Unlink aria-hidden />
            </button>
          ) : (
            <button type="button" className="doc-bubble-btn" aria-label="Add link" title="Link"
              onMouseDown={(ev) => ev.preventDefault()} onClick={() => setLinking(String(editor.getAttributes("link").href ?? ""))}>
              <Link2 aria-hidden />
            </button>
          )}
        </>
      )}
    </BubbleMenu>
  );
}
