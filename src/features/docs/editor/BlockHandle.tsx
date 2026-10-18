"use client";

// Hover a block → a ⋮⋮ handle at its left: drag it to move the block, or click for "turn into", duplicate, delete.
// ponytail: our own small handle — TipTap's official one pulls in a whole collaboration (Yjs) stack we don't use.
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { Copy, GripVertical, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BLOCKS } from "./blocks";

interface Target { pos: number; top: number; left: number }

/** The top-level block under a point in the editor, as a position and where to draw the handle. */
function blockAt(editor: Editor, x: number, y: number): Target | null {
  const view = editor.view;
  const box = view.dom.getBoundingClientRect();
  const hit = view.posAtCoords({ left: Math.min(Math.max(x, box.left + 4), box.right - 4), top: y });
  if (!hit) return null;
  const $pos = view.state.doc.resolve(hit.inside >= 0 ? hit.inside : hit.pos);
  const pos = $pos.depth >= 1 ? $pos.before(1) : hit.inside;
  if (pos < 0 || pos >= view.state.doc.content.size) return null;
  const dom = view.nodeDOM(pos) as HTMLElement | null;
  if (!dom?.getBoundingClientRect) return null;
  const r = dom.getBoundingClientRect();
  const wrap = view.dom.parentElement!.getBoundingClientRect();
  return { pos, top: r.top - wrap.top + Math.min(4, r.height / 4), left: r.left - wrap.left };
}

/** Picks the block up: ProseMirror moves it to wherever it's dropped. Plain DOM work, outside React's render. */
function startDrag(editor: Editor, pos: number, e: DragEvent) {
  const view = editor.view;
  view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  view.dragging = { slice: view.state.selection.content(), move: true };
  const dom = view.nodeDOM(pos) as HTMLElement | null;
  if (!e.dataTransfer) return;
  if (dom) e.dataTransfer.setDragImage(dom, 0, 0);
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", view.state.doc.nodeAt(pos)?.textContent ?? "");
}

export function BlockHandle({ editor }: { editor: Editor }) {
  const [target, setTarget] = useState<Target | null>(null);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Typing changes the document under the handle: hide it until the mouse moves again (its position may be stale).
  useEffect(() => {
    const hide = () => { if (!menu) setTarget(null); };
    editor.on("update", hide);
    return () => { editor.off("update", hide); };
  }, [editor, menu]);

  useEffect(() => {
    const dom = editor.view.dom;
    const host = dom.parentElement!;
    const onMove = (e: MouseEvent) => { if (!menu) setTarget(blockAt(editor, e.clientX, e.clientY)); };
    const onLeave = (e: MouseEvent) => { if (!menu && !host.contains(e.relatedTarget as Node)) setTarget(null); };
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", onLeave);
    return () => { host.removeEventListener("mousemove", onMove); host.removeEventListener("mouseleave", onLeave); };
  }, [editor, menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menu]);

  if (!target || !editor.isEditable || target.pos >= editor.state.doc.content.size) return null;
  const node = editor.state.doc.nodeAt(target.pos);
  if (!node) return null;

  const turnInto = (run: (typeof BLOCKS)[number]["run"]) => {
    editor.chain().focus().setTextSelection(target.pos + 1).run();
    run(editor);
    setMenu(false);
  };

  return (
    <div className="block-handle-layer" style={{ top: target.top, left: target.left }}>
      <button
        type="button" className="block-handle" draggable aria-label="Drag to move, or click for block options" aria-haspopup="menu" aria-expanded={menu}
        onDragStart={(e) => startDrag(editor, target.pos, e.nativeEvent)} onClick={() => setMenu((m) => !m)}
      >
        <GripVertical aria-hidden />
      </button>
      {menu && (
        <div ref={menuRef} className="menu block-menu" role="menu">
          <p className="menu-section-label">Turn into</p>
          {BLOCKS.filter((b) => b.convertible).map((b) => (
            <button key={b.id} type="button" role="menuitem" className="menu-item" onClick={() => turnInto(b.run)}>
              <b.icon aria-hidden /> {b.label}
            </button>
          ))}
          <div className="menu-divider" />
          <button type="button" role="menuitem" className="menu-item" onClick={() => {
            editor.chain().focus().insertContentAt(target.pos + node.nodeSize, node.toJSON()).run();
            setMenu(false);
          }}>
            <Copy aria-hidden /> Duplicate
          </button>
          <button type="button" role="menuitem" className="menu-item is-danger" onClick={() => {
            editor.chain().focus().deleteRange({ from: target.pos, to: target.pos + node.nodeSize }).run();
            setMenu(false);
            setTarget(null);
          }}>
            <Trash2 aria-hidden /> Delete
          </button>
        </div>
      )}
    </div>
  );
}
