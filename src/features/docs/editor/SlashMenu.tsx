"use client";

// "/" anywhere opens the block menu: type to filter, ↑↓ to pick, Enter to insert, Esc to close.
import { Extension, type Editor, type Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { matchBlocks, type Block } from "./blocks";

interface ListHandle { onKeyDown: (p: SuggestionKeyDownProps) => boolean }
type ListProps = SuggestionProps<Block, Block>;

const SlashList = forwardRef<ListHandle, ListProps>(function SlashList({ items, command }, ref) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowDown") { setActive((i) => (i + 1) % Math.max(items.length, 1)); return true; }
      if (event.key === "ArrowUp") { setActive((i) => (i - 1 + items.length) % Math.max(items.length, 1)); return true; }
      if (event.key === "Enter") { if (items[active]) command(items[active]); return true; }
      return false;
    },
  }), [items, active, command]);

  if (!items.length) return <div className="slash-menu" role="listbox"><p className="slash-empty">No blocks match</p></div>;
  return (
    <div className="slash-menu" role="listbox" aria-label="Blocks">
      {items.map((b, i) => (
        <button
          key={b.id} type="button" role="option" aria-selected={i === active} className={`slash-item${i === active ? " is-active" : ""}`}
          onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); command(b); }}
          ref={(el) => { if (i === active) el?.scrollIntoView({ block: "nearest" }); }}
        >
          <span className="slash-icon" aria-hidden><b.icon /></span>
          <span className="slash-text"><span className="slash-label">{b.label}</span><span className="slash-hint">{b.hint}</span></span>
        </button>
      ))}
    </div>
  );
});

/** Keeps the floating menu next to the caret and on screen. */
function place(el: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return;
  const h = el.offsetHeight || 320;
  const below = innerHeight - rect.bottom > h + 12;
  el.style.left = `${Math.min(rect.left, innerWidth - el.offsetWidth - 12)}px`;
  el.style.top = below ? `${rect.bottom + 6}px` : `${Math.max(12, rect.top - h - 6)}px`;
}

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    return [Suggestion<Block, Block>({
      editor: this.editor,
      char: "/",
      allowSpaces: false,
      // Not inside code, and only at the start of a line or after a space (so "and/or" stays text).
      allow: ({ editor, range }) => !editor.isActive("codeBlock") && /(^|\s)$/.test(editor.state.doc.textBetween(Math.max(0, range.from - 1), range.from, "\n", " ")),
      items: ({ query }) => matchBlocks(query),
      command: ({ editor, range, props }: { editor: Editor; range: Range; props: Block }) => props.run(editor, range),
      render: () => {
        let r: ReactRenderer<ListHandle, ListProps> | null = null;
        return {
          onStart: (props) => {
            r = new ReactRenderer(SlashList, { props, editor: props.editor });
            r.element.classList.add("slash-layer");
            document.body.appendChild(r.element);
            requestAnimationFrame(() => r && place(r.element as HTMLElement, props.clientRect?.()));
          },
          onUpdate: (props) => { r?.updateProps(props); if (r) place(r.element as HTMLElement, props.clientRect?.()); },
          onKeyDown: (props) => {
            if (props.event.key === "Escape") { r?.destroy(); r?.element.remove(); r = null; return true; }
            return r?.ref?.onKeyDown(props) ?? false;
          },
          onExit: () => { r?.element.remove(); r?.destroy(); r = null; },
        };
      },
    })];
  },
});
