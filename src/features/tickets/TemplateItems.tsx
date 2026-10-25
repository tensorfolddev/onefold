"use client";

// List-shaped sections: bullets, numbered steps, checklists, and the fixed Definition of done.
import { useState } from "react";
import { LockKeyhole, Plus, X } from "lucide-react";
import { setSection } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import { DEFINITION_OF_DONE, itemsOf, type SectionDef } from "@/domain/templates";
import type { SectionItem, Ticket } from "@/domain/types";
import { IconButton } from "@/ui/primitives";

const newLineId = () => `ln-${crypto.randomUUID().slice(0, 8)}`;
/** "- [ ] Foo", "* Foo", "1. Foo" → "Foo" (so pasting a list from anywhere just works). */
const stripMarker = (line: string) => line.replace(/^\s*(?:[-*•]\s*)?(?:\[[ xX]\]\s*)?(?:\d+[.)]\s*)?/, "").trim();

type Props = { def: SectionDef; ticket: Ticket; editable: boolean };

export function ItemsSection({ def, ticket, editable }: Props) {
  const { act } = useDb();
  return (
    <ItemsEditor items={itemsOf(ticket.sections?.[def.id])} kind={def.kind} title={def.title} hint={def.hint} editable={editable}
      onSave={(next) => act((d, m) => setSection(d, m, ticket.key, def.id, next))} />
  );
}

/** A list you edit in place — bullets, numbered steps or a checklist: Enter adds a line, a pasted list adds one per row. */
export function ItemsEditor({ items, kind, title, hint, editable, tickable = false, onSave: save }: {
  items: SectionItem[]; kind: SectionDef["kind"]; title: string; hint?: string; editable: boolean;
  tickable?: boolean; // a checklist whose boxes can be ticked even while its lines can't be edited
  onSave: (next: SectionItem[]) => unknown; // truthy once saved
}) {
  const [draft, setDraft] = useState("");
  const checklist = kind === "checklist";
  const add = (texts: string[]) => {
    const lines = texts.map(stripMarker).filter(Boolean);
    if (!lines.length) return;
    if (save([...items, ...lines.map((text) => ({ id: newLineId(), text, ...(checklist && { done: false }) }))])) setDraft("");
  };
  const List = kind === "steps" ? "ol" : "ul";

  if (!editable && !items.length) return <p className="tpl-empty">Not filled in</p>;
  return (
    <>
      {!items.length && hint && <p className="tpl-hint">{hint}</p>}
      {items.length > 0 && (
        <List className="tpl-items" data-kind={kind}>
          {items.map((it, i) => (
            <li key={it.id} className="tpl-item" data-done={it.done || undefined}>
              {checklist ? (
                <input
                  type="checkbox" className="tpl-check" checked={!!it.done} disabled={!editable && !tickable} aria-label={it.text}
                  onChange={() => save(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
                />
              ) : kind === "steps" ? <span className="tpl-step" aria-hidden>{i + 1}</span> : <span className="tpl-bullet" aria-hidden />}
              {editable ? (
                <LineText value={it.text} label={`${title} line ${i + 1}`}
                  onSave={(text) => save(items.map((x) => (x.id === it.id ? { ...x, text } : x)))} />
              ) : <span className="tpl-item-text">{it.text}</span>}
              {editable && (
                <span className="tpl-item-x">
                  <IconButton label={`Remove “${it.text}”`} onClick={() => save(items.filter((x) => x.id !== it.id))}><X /></IconButton>
                </span>
              )}
            </li>
          ))}
        </List>
      )}
      {editable && (
        <form className="tpl-add" onSubmit={(e) => { e.preventDefault(); add([draft]); }}>
          <Plus aria-hidden />
          <input
            value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Add to ${title}`} maxLength={500}
            placeholder={checklist ? "Add a line to tick off — Enter to add" : kind === "steps" ? "Add the next step — Enter to add" : "Add a line — Enter to add"}
            onPaste={(e) => {
              const text = e.clipboardData.getData("text");
              if (!text.includes("\n")) return;
              e.preventDefault(); // a pasted list becomes one line per row
              add(text.split(/\r?\n/));
            }}
          />
        </form>
      )}
    </>
  );
}

/** Inline-editable line: looks like text, wraps, saves on Enter or when you click away; emptying it keeps the old text. */
function LineText({ value, label, onSave }: { value: string; label: string; onSave: (text: string) => void }) {
  return (
    <textarea
      key={value} rows={1} className="tpl-item-input" defaultValue={value} aria-label={label} maxLength={500}
      onBlur={(e) => {
        const text = e.target.value.replace(/\s*\n\s*/g, " ").trim();
        if (!text) e.target.value = value;
        else if (text !== value) onSave(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } // one line per item
        if (e.key === "Escape") { e.stopPropagation(); e.currentTarget.value = value; e.currentTarget.blur(); }
      }}
    />
  );
}

/** Fixed lines from the template; people only tick them. */
export function DoneSection({ def, ticket, editable }: Props) {
  const { act } = useDb();
  const ticks = itemsOf(ticket.sections?.[def.id]);
  const isTicked = (id: string) => ticks.some((t) => t.id === id && t.done);
  const toggle = (id: string) => {
    const next = DEFINITION_OF_DONE.map((l) => ({ ...l, done: l.id === id ? !isTicked(id) : isTicked(l.id) }));
    act((d, m) => setSection(d, m, ticket.key, def.id, next));
  };
  const n = DEFINITION_OF_DONE.filter((l) => isTicked(l.id)).length;
  return (
    <>
      <ul className="tpl-items" data-kind="checklist">
        {DEFINITION_OF_DONE.map((l) => (
          <li key={l.id} className="tpl-item" data-done={isTicked(l.id) || undefined}>
            <input type="checkbox" className="tpl-check" checked={isTicked(l.id)} disabled={!editable} aria-label={l.text} onChange={() => toggle(l.id)} />
            <span className="tpl-item-text">{l.text}</span>
          </li>
        ))}
      </ul>
      <p className="tpl-fixed"><LockKeyhole aria-hidden /> {n}/{DEFINITION_OF_DONE.length} · the same list on every ticket</p>
    </>
  );
}
