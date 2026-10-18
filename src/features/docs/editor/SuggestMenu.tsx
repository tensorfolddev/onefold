"use client";

// A floating pick-list next to the caret, for "/" blocks, "@" people and "[[" tickets and docs: type to filter,
// ↑↓ to choose, Enter to insert, Esc to close.
import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionOptions, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export interface MenuItem {
  key: string; label: string; hint?: string; icon?: React.ReactNode;
  /** A heading the item sits under ("People", "Pages", "Tickets"); shown once, before the first of its group. */
  group?: string;
  /** Something small on the right (a ticket's status, a page's space). */
  meta?: React.ReactNode;
}
interface ListHandle { onKeyDown: (p: SuggestionKeyDownProps) => boolean }
type ListProps = SuggestionProps<MenuItem, MenuItem> & { empty: string; title?: string };

const MenuList = forwardRef<ListHandle, ListProps>(function MenuList({ items, command, empty, title }, ref) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);
  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const n = Math.max(items.length, 1);
      if (event.key === "ArrowDown") { setActive((i) => (i + 1) % n); return true; }
      if (event.key === "ArrowUp") { setActive((i) => (i - 1 + n) % n); return true; }
      if (event.key === "Enter" || event.key === "Tab") { if (items[active]) command(items[active]); return true; }
      return false;
    },
  }), [items, active, command]);
  return (
    <div className="slash-menu" role="listbox" aria-label={title ?? "Suggestions"}>
      {title && <p className="slash-title">{title}</p>}
      {items.length ? items.map((it, i) => (
        <div key={it.key} role="presentation">
          {it.group && it.group !== items[i - 1]?.group && <p className="slash-group">{it.group}</p>}
          <button
            type="button" role="option" aria-selected={i === active} className={`slash-item${it.group ? " is-compact" : ""}${i === active ? " is-active" : ""}`}
            onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); command(it); }}
            ref={(el) => { if (i === active) el?.scrollIntoView({ block: "nearest" }); }}
          >
            {it.icon && <span className="slash-icon" aria-hidden>{it.icon}</span>}
            <span className="slash-text"><span className="slash-label">{it.label}</span>{it.hint && <span className="slash-hint">{it.hint}</span>}</span>
            {it.meta && <span className="slash-meta">{it.meta}</span>}
          </button>
        </div>
      )) : <p className="slash-empty">{empty}</p>}
    </div>
  );
});

function place(el: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return;
  const h = el.offsetHeight || 320;
  const below = innerHeight - rect.bottom > h + 12;
  el.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - el.offsetWidth - 12))}px`;
  el.style.top = below ? `${rect.bottom + 6}px` : `${Math.max(12, rect.top - h - 6)}px`;
}

/** Suggestion options showing MenuList; `pick` inserts the chosen item over the typed trigger + query. */
export function suggestMenu(opts: {
  editor: Editor;
  char: string;
  title?: string;
  empty: string;
  items: (query: string) => MenuItem[];
  pick: (editor: Editor, range: Range, item: MenuItem) => void;
  allow?: SuggestionOptions<MenuItem, MenuItem>["allow"];
  allowSpaces?: boolean;
}): SuggestionOptions<MenuItem, MenuItem> {
  return {
    editor: opts.editor,
    char: opts.char,
    allowSpaces: opts.allowSpaces ?? false,
    allow: opts.allow ?? (({ editor }) => !editor.isActive("codeBlock")),
    items: ({ query }) => opts.items(query),
    command: ({ editor, range, props }) => opts.pick(editor, range, props),
    render: () => {
      let r: ReactRenderer<ListHandle, ListProps> | null = null;
      const close = () => { r?.element.remove(); r?.destroy(); r = null; };
      return {
        onStart: (props) => {
          r = new ReactRenderer(MenuList, { props: { ...props, empty: opts.empty, title: opts.title }, editor: props.editor });
          r.element.classList.add("slash-layer");
          document.body.appendChild(r.element);
          requestAnimationFrame(() => r && place(r.element as HTMLElement, props.clientRect?.()));
        },
        onUpdate: (props) => { r?.updateProps({ ...props, empty: opts.empty, title: opts.title }); if (r) place(r.element as HTMLElement, props.clientRect?.()); },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") { close(); return true; }
          return r?.ref?.onKeyDown(props) ?? false;
        },
        onExit: close,
      };
    },
  };
}
