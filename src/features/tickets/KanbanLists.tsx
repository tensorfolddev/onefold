"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Lock, MoreHorizontal, Pencil, Plus, Trash2, X } from "lucide-react";
import { addStatus, createTicket, deleteStatus, moveStatus, updateStatus } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import { CATEGORY_LABEL, TONE_NAME, TONES, toneVar } from "@/domain/status";
import type { Status, StatusCategory } from "@/domain/types";
import { Popover } from "@/ui/Popover";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { IconButton, Tooltip } from "@/ui/primitives";

const CATEGORIES = Object.keys(CATEGORY_LABEL) as StatusCategory[];

/** Inline name input shared by "Rename" and "Add list": Enter saves, Escape cancels. */
function NameInput({ initial = "", label, onSave, onCancel }: {
  initial?: string; label: string; onSave: (name: string) => boolean | undefined; onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const save = () => (name.trim() === initial ? onCancel() : onSave(name) && onCancel());
  return (
    <form className="kanban-list-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label className="input">
        <input
          autoFocus aria-label={label} value={name} maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
        />
      </label>
      <IconButton label="Save" className="btn btn-primary btn-icon" onClick={save}><Check /></IconButton>
      <IconButton label="Cancel" onClick={onCancel}><X /></IconButton>
    </form>
  );
}

/** Column header: name + count; with permission a ⋯ menu (rename, colour, category, move, delete) and drag handle. */
export function ListHeader({ productKey, status, count, lists, canManage, onAddTop, handleRef, handleProps }: {
  productKey: string; status: Status; count: number; lists: Status[]; canManage: boolean;
  /** Shown as "+" in the header corner when the person can create tickets. */
  onAddTop?: () => void;
  /** dnd-kit drag handle (the header itself), only for lists that can move. */
  handleRef?: (el: HTMLElement | null) => void;
  handleProps?: React.HTMLAttributes<HTMLElement>;
}) {
  const { act } = useDb();
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const index = lists.findIndex((s) => s.id === status.id);
  const fixedCount = lists.filter((s) => s.system).length;
  const editable = canManage && !status.system; // Epic + Backlog are fixed for everyone
  const patch = (p: Parameters<typeof updateStatus>[4]) => act((d, m) => updateStatus(d, m, productKey, status.id, p));
  const move = (beforeId?: string) => act((d, m) => moveStatus(d, m, productKey, status.id, beforeId));

  if (renaming) {
    return (
      <div className="kanban-col-header is-editing" data-tone={status.tone}>
        <NameInput initial={status.name} label="List name" onSave={(name) => !!patch({ name })} onCancel={() => setRenaming(false)} />
      </div>
    );
  }

  return (
    <>
      <div
        className={`kanban-col-header${editable && handleProps ? " is-draggable" : ""}`} data-tone={status.tone}
        ref={editable ? handleRef : undefined} {...(editable ? handleProps : {})}
        onDoubleClick={() => editable && setRenaming(true)}
      >
        {status.system && (
          <span className="kanban-list-lock">
            <Tooltip label="Fixed list — always here"><Lock aria-label="Fixed list" /></Tooltip>
          </span>
        )}
        <h2 className="kanban-col-title" id={`kcol-${status.id}`} aria-label={`${status.name}, ${count} ${count === 1 ? "ticket" : "tickets"}`}>
          {status.name}
        </h2>
        <span className="kanban-col-actions">
        {onAddTop && (
          <button type="button" className="kanban-list-more" aria-label={`Add a task at the top of ${status.name}`} onClick={onAddTop}>
            <Plus aria-hidden />
          </button>
        )}
        {editable && (
          <Popover
            align="right" width={240} className="kanban-list-menu"
            trigger={({ open, toggle }) => (
              <button type="button" className="kanban-list-more" aria-label={`${status.name} list options`} aria-expanded={open} onClick={toggle}>
                <MoreHorizontal aria-hidden />
              </button>
            )}
          >
            {(close) => (
              <>
                <button type="button" className="menu-item" onClick={() => { close(); setRenaming(true); }}><Pencil /> Rename</button>
                <div className="menu-section-label">Colour</div>
                <div className="kanban-tones" role="radiogroup" aria-label="List colour">
                  {TONES.map((tone) => (
                    <button
                      key={tone} type="button" role="radio" aria-checked={status.tone === tone} aria-label={TONE_NAME[tone]}
                      className="kanban-tone" style={{ background: toneVar(tone) }} onClick={() => patch({ tone })}
                    />
                  ))}
                </div>
                <label className="kanban-category">
                  <span className="menu-section-label">Counts in reports as</span>
                  <select value={status.category} onChange={(e) => patch({ category: e.target.value as StatusCategory })}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                  </select>
                </label>
                <div className="menu-divider" />
                <button type="button" className="menu-item" disabled={index <= fixedCount} onClick={() => { close(); move(lists[index - 1].id); }}>
                  <ArrowLeft /> Move left
                </button>
                <button type="button" className="menu-item" disabled={index === lists.length - 1} onClick={() => { close(); move(lists[index + 2]?.id); }}>
                  <ArrowRight /> Move right
                </button>
                <div className="menu-divider" />
                <button type="button" className="menu-item is-danger" onClick={() => { close(); setDeleting(true); }}>
                  <Trash2 /> Delete list
                </button>
              </>
            )}
          </Popover>
        )}
        </span>
      </div>
      {deleting && (
        <DeleteList productKey={productKey} status={status} count={count} lists={lists} onDone={() => setDeleting(false)} />
      )}
    </>
  );
}

function DeleteList({ productKey, status, count, lists, onDone }: {
  productKey: string; status: Status; count: number; lists: Status[]; onDone: () => void;
}) {
  const { act } = useDb();
  const others = lists.filter((s) => s.id !== status.id && s.system !== "epic"); // only epics live in Epic
  const [moveTo, setMoveTo] = useState(others[0]?.id ?? "");
  return (
    <ConfirmDialog
      title={`Delete the ${status.name} list?`}
      confirmLabel="Delete list"
      body={count ? (
        <label className="kanban-move-to">
          Its {count} {count === 1 ? "ticket moves" : "tickets move"} to
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
            {others.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      ) : "The list is empty, so no tickets are affected."}
      onCancel={onDone}
      onConfirm={() => {
        act((d, m) => deleteStatus(d, m, productKey, status.id, count ? moveTo : undefined), { success: `${status.name} list deleted`, undoable: true });
        onDone();
      }}
    />
  );
}

/** The always-last column: "+ Add list" → name input. New lists count as In progress until changed. */
export function AddList({ productKey }: { productKey: string }) {
  const { act } = useDb();
  const [adding, setAdding] = useState(false);
  return (
    <section className="kanban-col kanban-add-col" aria-label="Add a list">
      {adding ? (
        <div className="kanban-add-form">
          <NameInput
            label="New list name"
            onSave={(name) => {
              const listId = `${productKey.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}`; // named here so the server keeps it
              return !!act((d, m) => addStatus(d, m, productKey, { name }, listId), { success: `${name.trim()} list added` });
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button type="button" className="kanban-add-list" onClick={() => setAdding(true)}>
          <Plus aria-hidden /> Add list
        </button>
      )}
    </section>
  );
}

/** Quick add inside a list: Enter adds and keeps the box open for the next one, Escape closes. */
export function TaskComposer({ productKey, statusId, position, onClose }: {
  productKey: string; statusId: string; position: "top" | "bottom"; onClose: () => void;
}) {
  const { act } = useDb();
  const [title, setTitle] = useState("");
  const add = () => {
    if (!title.trim()) return onClose();
    if (act((d, m) => createTicket(d, m, productKey, title, { statusId, position }))) setTitle("");
  };
  return (
    <form className={`kanban-composer is-${position}`} onSubmit={(e) => { e.preventDefault(); add(); }}>
      <textarea
        autoFocus rows={2} placeholder="Task title" aria-label="New task title" value={title} maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); add(); }
        }}
      />
      <div className="kanban-composer-actions">
        <button type="submit" className="btn btn-primary">Add task</button>
        <IconButton label="Cancel" onClick={onClose}><X /></IconButton>
      </div>
    </form>
  );
}
