"use client";

// The toolbar over a table while the caret is in it: rows and columns on any side (one or several at a time), delete
// rows / columns / the table, the header row on or off, and the header's colour.
import type { Editor } from "@tiptap/core";
import {
  ArrowDownToLine, ArrowLeftToLine, ArrowRightToLine, ArrowUpToLine, Heading, PaintBucket, Rows3, Columns3, Trash2,
} from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { Popover } from "@/ui/Popover";
import { HEADER_COLORS } from "./extensions";

const MAX_AT_ONCE = 50;

/** The table around the caret: its position and its element, or null. */
function tableAt(editor: Editor): { pos: number; dom: HTMLElement; color: string | null } | null {
  const { $from } = editor.state.selection;
  for (let d = $from.depth; d > 0; d -= 1) {
    if ($from.node(d).type.name === "table") {
      const pos = $from.before(d);
      const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
      return dom ? { pos, dom, color: ($from.node(d).attrs.headerColor as string | null) ?? null } : null;
    }
  }
  return null;
}

function Btn({ label, onClick, children, danger }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" className={`table-menu-btn${danger ? " is-danger" : ""}`} aria-label={label} title={label}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {children}
    </button>
  );
}

export function TableMenu({ editor }: { editor: Editor }) {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [count, setCount] = useState(3);
  useEffect(() => {
    editor.on("transaction", redraw);
    editor.on("blur", redraw);
    return () => { editor.off("transaction", redraw); editor.off("blur", redraw); };
  }, [editor]);

  const t = editor.isEditable ? tableAt(editor) : null;
  if (!t) return null;
  const host = t.dom.closest(".doc-editor") as HTMLElement | null;
  if (!host) return null;
  const box = t.dom.getBoundingClientRect();
  const hostBox = host.getBoundingClientRect();
  const n = Math.max(1, Math.min(MAX_AT_ONCE, Math.round(count) || 1));
  const repeat = (run: () => boolean) => { for (let i = 0; i < n; i += 1) if (!run()) break; };
  const c = () => editor.chain().focus();

  return (
    <div className="table-menu" role="toolbar" aria-label="Table" style={{ top: box.top - hostBox.top - 44, left: box.left - hostBox.left }}>
      <Btn label="Add row above" onClick={() => c().addRowBefore().run()}><ArrowUpToLine /></Btn>
      <Btn label="Add row below" onClick={() => c().addRowAfter().run()}><ArrowDownToLine /></Btn>
      <Btn label="Add column left" onClick={() => c().addColumnBefore().run()}><ArrowLeftToLine /></Btn>
      <Btn label="Add column right" onClick={() => c().addColumnAfter().run()}><ArrowRightToLine /></Btn>
      <span className="table-menu-sep" aria-hidden />
      <Popover width={250} floating trigger={({ toggle }) => <Btn label="Several rows or columns" onClick={toggle}><Rows3 /></Btn>}>
        {(close) => (
          <div className="table-menu-many">
            <label className="field-label" htmlFor="table-many">How many</label>
            <input id="table-many" type="number" min={1} max={MAX_AT_ONCE} value={count} onChange={(e) => setCount(Number(e.target.value))} className="table-menu-count" />
            <div className="table-menu-grid">
              <button type="button" className="btn btn-secondary" onClick={() => { repeat(() => c().addRowAfter().run()); close(); }}>Add {n} row{n > 1 ? "s" : ""}</button>
              <button type="button" className="btn btn-secondary" onClick={() => { repeat(() => c().addColumnAfter().run()); close(); }}>Add {n} column{n > 1 ? "s" : ""}</button>
              <button type="button" className="btn btn-tertiary is-danger" onClick={() => { repeat(() => tableAt(editor) !== null && c().deleteRow().run()); close(); }}>Delete {n} row{n > 1 ? "s" : ""}</button>
              <button type="button" className="btn btn-tertiary is-danger" onClick={() => { repeat(() => tableAt(editor) !== null && c().deleteColumn().run()); close(); }}>Delete {n} column{n > 1 ? "s" : ""}</button>
            </div>
          </div>
        )}
      </Popover>
      <Btn label="Delete row" danger onClick={() => c().deleteRow().run()}><Rows3 /><Trash2 className="table-menu-mini" /></Btn>
      <Btn label="Delete column" danger onClick={() => c().deleteColumn().run()}><Columns3 /><Trash2 className="table-menu-mini" /></Btn>
      <span className="table-menu-sep" aria-hidden />
      <Btn label="Header row on or off" onClick={() => c().toggleHeaderRow().run()}><Heading /></Btn>
      <Popover width={220} floating trigger={({ toggle }) => <Btn label="Header colour" onClick={toggle}><PaintBucket /></Btn>}>
        {(close) => (
          <>
            <p className="menu-section-label">Header colour</p>
            <div className="table-colors">
              <button type="button" className={`table-color is-none${t.color ? "" : " is-current"}`} aria-label="No colour"
                onClick={() => { c().updateAttributes("table", { headerColor: null }).run(); close(); }} />
              {HEADER_COLORS.map((col) => (
                <button key={col} type="button" className={`table-color${t.color === col ? " is-current" : ""}`} data-color={col} aria-label={col} title={col}
                  onClick={() => { c().updateAttributes("table", { headerColor: col }).run(); close(); }} />
              ))}
            </div>
          </>
        )}
      </Popover>
      <span className="table-menu-sep" aria-hidden />
      <Btn label="Delete table" danger onClick={() => c().deleteTable().run()}><Trash2 /></Btn>
    </div>
  );
}
