"use client";

// Settings → Statuses: a project's lists (its board's columns), in board order. Rename one, pick its colour and what
// kind of list it is, move it up or down, delete it (its tickets move to a list you pick), or add one. Epic and
// Backlog are fixed. The same lists, and the same commands, as the board's column menu.
import { ArrowDown, ArrowUp, Lock, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { addStatus, deleteStatus, moveStatus, updateStatus } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import { CATEGORY_LABEL, TONE_NAME, TONES, toneVar } from "@/domain/status";
import type { Product, Status, StatusCategory } from "@/domain/types";
import { Popover } from "@/ui/Popover";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as StatusCategory[];

function ToneMenu({ status, onPick }: { status: Status; onPick: (tone: Status["tone"]) => void }) {
  return (
    <Popover floating width={208} className="settings-swatch-menu" trigger={({ open, toggle }) => (
      <button type="button" className="settings-swatch" style={{ background: toneVar(status.tone) }} aria-label={`Colour of ${status.name}: ${TONE_NAME[status.tone]}`}
        aria-haspopup="menu" aria-expanded={open} onClick={toggle} />
    )}>
      {(close) => (
        <div className="settings-swatches" role="radiogroup" aria-label={`Colour of ${status.name}`}>
          {TONES.map((tone) => (
            <button key={tone} type="button" role="radio" aria-checked={status.tone === tone} aria-label={TONE_NAME[tone]} data-tip={TONE_NAME[tone]}
              className="settings-swatch is-pick" style={{ background: toneVar(tone) }} onClick={() => { onPick(tone); close(); }} />
          ))}
        </div>
      )}
    </Popover>
  );
}

function DeleteList({ status, lists, count, onDelete }: { status: Status; lists: Status[]; count: number; onDelete: (moveTo?: string) => void }) {
  const others = lists.filter((s) => s.id !== status.id && s.system !== "epic");
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  return (
    <Popover floating align="right" width={260} className="settings-confirm" trigger={({ open, toggle }) => (
      <button type="button" className="settings-icon-btn is-danger" aria-label={`Delete ${status.name}`} data-tip="Delete" aria-expanded={open} onClick={toggle}><Trash2 aria-hidden /></button>
    )}>
      {(close) => (
        <div className="settings-confirm-body">
          <p><strong>Delete {status.name}?</strong></p>
          {count > 0 && (
            <label className="settings-field">
              <span>Move its {count} ticket{count === 1 ? "" : "s"} to</span>
              <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>{others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            </label>
          )}
          <div className="settings-confirm-actions">
            <button type="button" className="btn btn-tertiary" onClick={close}>Cancel</button>
            <button type="button" className="btn btn-danger" onClick={() => { close(); onDelete(count ? moveTo : undefined); }}>Delete list</button>
          </div>
        </div>
      )}
    </Popover>
  );
}

function ListName({ status, onRename }: { status: Status; onRename: (name: string) => boolean }) {
  const [name, setName] = useState(status.name);
  const commit = () => { if (name.trim() && name.trim() !== status.name) { if (!onRename(name)) setName(status.name); } else setName(status.name); };
  return (
    <input className="settings-name" aria-label="List name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setName(status.name); e.currentTarget.blur(); } }} />
  );
}

export function StatusSettings({ product }: { product: Product }) {
  const { db, act, can } = useDb();
  const editable = can("statuses.edit", { product });
  const lists = db.statusesByProduct[product.key] ?? [];
  const firstMovable = lists.findIndex((s) => !s.system);
  const [draft, setDraft] = useState("");
  const count = (id: string) => db.tickets.filter((t) => t.productKey === product.key && t.statusId === id && !t.archivedAt).length;
  const k = product.key;
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const listId = `${k.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`; // named here so the server keeps the same id
    if (draft.trim() && act((d, m) => addStatus(d, m, k, { name: draft }, listId), { success: `${draft.trim()} added` })) setDraft("");
  };

  return (
    <div className="settings-card">
      <ul className="settings-rows" aria-label="Statuses">
        {lists.map((s, i) => {
          const n = count(s.id);
          return (
            <li key={s.id} className="settings-row">
              {s.system || !editable ? (
                <>
                  <span className="settings-swatch is-static" style={{ background: toneVar(s.tone) }} aria-hidden />
                  <span className="settings-row-name">{s.name}</span>
                  <span className="settings-row-kind">{CATEGORY_LABEL[s.category]}</span>
                  <span className="settings-row-count">{n} ticket{n === 1 ? "" : "s"}</span>
                  <span className="settings-row-tools">{s.system && <span className="settings-fixed" data-tip="Every project has this list"><Lock aria-hidden /> Fixed</span>}</span>
                </>
              ) : (
                <>
                  <ToneMenu status={s} onPick={(tone) => act((d, m) => updateStatus(d, m, k, s.id, { tone }))} />
                  <ListName key={s.name} status={s} onRename={(name) => !!act((d, m) => updateStatus(d, m, k, s.id, { name }))} />
                  <select className="settings-kind" aria-label={`Kind of list: ${s.name}`} value={s.category}
                    onChange={(e) => act((d, m) => updateStatus(d, m, k, s.id, { category: e.target.value as StatusCategory }))}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </select>
                  <span className="settings-row-count">{n} ticket{n === 1 ? "" : "s"}</span>
                  <span className="settings-row-tools">
                    <button type="button" className="settings-icon-btn" aria-label={`Move ${s.name} up`} data-tip="Move up" disabled={i <= firstMovable}
                      onClick={() => act((d, m) => moveStatus(d, m, k, s.id, lists[i - 1].id))}><ArrowUp aria-hidden /></button>
                    <button type="button" className="settings-icon-btn" aria-label={`Move ${s.name} down`} data-tip="Move down" disabled={i === lists.length - 1}
                      onClick={() => act((d, m) => moveStatus(d, m, k, s.id, lists[i + 2]?.id))}><ArrowDown aria-hidden /></button>
                    <DeleteList status={s} lists={lists} count={n} onDelete={(moveTo) => act((d, m) => deleteStatus(d, m, k, s.id, moveTo), { success: `${s.name} deleted`, undoable: true })} />
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {editable && (
        <form className="settings-add" onSubmit={add}>
          <input aria-label="New list name" placeholder="New status, e.g. QA" maxLength={40} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button type="submit" className="btn btn-secondary" disabled={!draft.trim()}><Plus aria-hidden /> Add status</button>
        </form>
      )}
    </div>
  );
}
