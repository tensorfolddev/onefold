"use client";

// A project's Settings → Client tab: its requirements and requests in its own words — rename any phase and change its
// colour (the team and the client both see it), and its requirement priorities: rename, recolour, reorder, add your
// own (up to 8), or take one out (not while a requirement still has it). Saved as you go; Reset puts 1Fold's back.
// Whoever may change the project's board lists and ticket priorities may change these; everyone else reads them.
import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from "lucide-react";
import { setClientLook } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import {
  ASK_PHASES, ASK_STATES, lookOf, prioritiesOf, REQ_PHASES, REQUIREMENT_STATUSES, type PhaseLabel,
} from "@/domain/selectors/clientLook";
import type { ClientPhases, PriorityDef, Product } from "@/domain/types";
import { Popover } from "@/ui/Popover";

const SWATCHES = ["#1f5fd1", "#579bfc", "#00a9a5", "#00a35f", "#178a6a", "#9cd326", "#e99729", "#fdab3d", "#e2445c", "#ff7575", "#9d50dd", "#7b4fd6", "#7f5347", "#676879", "#9699a6", "#333333"];
const MAX_PRIORITIES = 8;
const slug = (name: string, taken: string[]) => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "priority";
  let id = base;
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`;
  return id;
};

function Swatch({ color, label, onPick, disabled }: { color: string; label: string; onPick: (c: string) => void; disabled: boolean }) {
  return (
    <Popover
      width={196}
      trigger={({ open, toggle }) => (
        <button type="button" className="look-swatch" style={{ background: color }} aria-label={`${label}: colour`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={toggle} />
      )}
    >
      {(close) => (
        <div className="look-swatches" role="radiogroup" aria-label={`${label}: colour`}>
          {SWATCHES.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={c === color} aria-label={c} style={{ background: c }} onClick={() => { onPick(c); close(); }} />
          ))}
        </div>
      )}
    </Popover>
  );
}

/** A name that saves when you leave it (empty: 1Fold's own name). */
function NameInput({ value, placeholder, label, onSave, disabled }: { value: string; placeholder: string; label: string; onSave: (v: string) => void; disabled: boolean }) {
  const [text, setText] = useState(value);
  return (
    <span className="input look-name">
      <input value={text} maxLength={30} placeholder={placeholder} aria-label={label} disabled={disabled} onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text.trim() !== value) onSave(text.trim()); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    </span>
  );
}

function Phases<K extends string>({ title, kind, keys, defaults, phases, onSave, disabled }: {
  title: string; kind: "req" | "ask"; keys: readonly K[]; defaults: Record<K, PhaseLabel>; phases: ClientPhases; onSave: (p: ClientPhases) => void; disabled: boolean;
}) {
  const own = (phases[kind] ?? {}) as Partial<Record<K, { name?: string; color?: string }>>;
  const set = (k: K, patch: { name?: string; color?: string }) => {
    const next = { ...own[k], ...patch };
    if (!next.name) delete next.name;
    onSave({ ...phases, [kind]: { ...own, [k]: next } });
  };
  return (
    <section className="look-group" aria-label={title}>
      <h4>{title}</h4>
      {keys.map((k) => {
        const d = defaults[k];
        return (
          <div key={k} className="look-row">
            <Swatch color={own[k]?.color ?? d.color} label={own[k]?.name || d.team} onPick={(color) => set(k, { color })} disabled={disabled} />
            <NameInput key={own[k]?.name ?? ""} value={own[k]?.name ?? ""} placeholder={d.team} label={`${d.team}: name`} onSave={(name) => set(k, { name })} disabled={disabled} />
            <span className="look-hint">{own[k]?.name ? "Both sides see this name" : d.client !== d.team ? `The client sees “${d.client}”` : ""}</span>
          </div>
        );
      })}
    </section>
  );
}

export function ClientLookSettings({ product }: { product: Product }) {
  const { act, can } = useMe();
  const look = lookOf(product);
  const phases = look.phases ?? {};
  const priorities = prioritiesOf(look);
  const locked = !can("statuses.edit", { product });
  const savePhases = (next: ClientPhases | null) => act((d, m) => setClientLook(d, m, product.key, { phases: next }), { success: "Saved" });
  const savePriorities = (next: PriorityDef[] | null) => act((d, m) => setClientLook(d, m, product.key, { priorities: next }), { success: "Saved" });
  const move = (i: number, by: number) => {
    const next = [...priorities];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    savePriorities(next);
  };
  const add = () => savePriorities([...priorities, { id: slug("New priority", priorities.map((p) => p.id)), name: "New priority", color: SWATCHES[priorities.length % SWATCHES.length] }]);
  return (
    <div className="settings-card look-settings">
      <div className="settings-line">
        <span className="settings-line-text">
          <strong>Phases</strong>
          <span>What each step of a requirement and a request is called in this project&apos;s Client tab, and its colour</span>
        </span>
        <button type="button" className="btn btn-tertiary btn-sm" disabled={locked || !look.phases} onClick={() => savePhases(null)}><RotateCcw aria-hidden /> Reset</button>
      </div>
      <div className="look-groups">
        <Phases title="Requirements" kind="req" keys={REQUIREMENT_STATUSES} defaults={REQ_PHASES} phases={phases} onSave={savePhases} disabled={locked} />
        <Phases title="Requests" kind="ask" keys={ASK_STATES} defaults={ASK_PHASES} phases={phases} onSave={savePhases} disabled={locked} />
      </div>
      <div className="settings-line">
        <span className="settings-line-text">
          <strong>Requirement priorities</strong>
          <span>In order, most important first — the table sorts by it. A priority a requirement still has can&apos;t be taken out.</span>
        </span>
        <button type="button" className="btn btn-tertiary btn-sm" disabled={locked || !look.priorities} onClick={() => savePriorities(null)}><RotateCcw aria-hidden /> Reset</button>
      </div>
      <div className="look-group">
        {priorities.map((p, i) => (
          <div key={p.id} className="look-row">
            <Swatch color={p.color} label={p.name} onPick={(color) => savePriorities(priorities.map((x) => (x.id === p.id ? { ...x, color } : x)))} disabled={locked} />
            <NameInput key={p.name} value={p.name} placeholder="A name" label={`${p.name}: name`} disabled={locked}
              onSave={(name) => { if (name) savePriorities(priorities.map((x) => (x.id === p.id ? { ...x, name } : x))); }} />
            {!locked && (
              <span className="look-tools">
                <button type="button" className="room-icon-btn" aria-label={`Move ${p.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp aria-hidden /></button>
                <button type="button" className="room-icon-btn" aria-label={`Move ${p.name} down`} disabled={i === priorities.length - 1} onClick={() => move(i, 1)}><ArrowDown aria-hidden /></button>
                <button type="button" className="room-icon-btn" aria-label={`Take ${p.name} out`} disabled={priorities.length < 2} onClick={() => savePriorities(priorities.filter((x) => x.id !== p.id))}><Trash2 aria-hidden /></button>
              </span>
            )}
          </div>
        ))}
        {!locked && priorities.length < MAX_PRIORITIES && <button type="button" className="btn btn-tertiary btn-sm look-add" onClick={add}><Plus aria-hidden /> Add a priority</button>}
      </div>
    </div>
  );
}
