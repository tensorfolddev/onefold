"use client";

// A decision's status as people see it: one of the four built-in statuses, or a label of the team's own (Suspended,
// On hold…) with its colour. The menu to change it (with "New label") and the sticky note's colour menu.
import { Check, ChevronDown, Palette, Plus } from "lucide-react";
import { useState } from "react";
import { updateDecision, type DecisionPatch } from "@/data/commands";
import { useMe } from "@/data/StoreProvider";
import type { Decision, DecisionLabel, DecisionStatus } from "@/domain/types";
import { Popover } from "@/ui/Popover";

export const STATUS: Record<DecisionStatus, { label: string; color: string }> = {
  accepted: { label: "Accepted", color: "#00c875" },
  proposed: { label: "Proposed", color: "#fdab3d" },
  rejected: { label: "Rejected", color: "#e2445c" },
  superseded: { label: "Superseded", color: "#9699a6" },
};
export const statusOf = (d: Decision): DecisionStatus => d.status ?? "accepted";

export const PALETTE = [
  { name: "Yellow", color: "#ffcb00" }, { name: "Orange", color: "#fdab3d" }, { name: "Red", color: "#e2445c" },
  { name: "Pink", color: "#ff5ac4" }, { name: "Purple", color: "#a25ddc" }, { name: "Blue", color: "#579bfc" },
  { name: "Sky", color: "#66ccff" }, { name: "Green", color: "#00c875" }, { name: "Lime", color: "#9cd326" }, { name: "Grey", color: "#c4c4c4" },
];

export interface Shown { key: string; label: string; color: string }
const builtIn = (s: DecisionStatus): Shown => ({ key: s, label: STATUS[s].label, color: STATUS[s].color });
const ofLabel = (l: DecisionLabel): Shown => ({ key: `label:${l.name.toLowerCase()}`, label: l.name, color: l.color });
/** What a decision's status cell says: the team's own label if it has one, else its built-in status. */
export const shownStatus = (d: Decision): Shown => (d.label ? ofLabel(d.label) : builtIn(statusOf(d)));
/** The team's own labels in use among these decisions, one per name. */
export const labelsIn = (ds: Decision[]): DecisionLabel[] =>
  [...new Map(ds.flatMap((d) => (d.label ? [[d.label.name.toLowerCase(), d.label] as const] : []))).values()];
/** Board order: open questions, accepted, the team's own labels, then the closed ones. */
export const groupsOf = (ds: Decision[]): Shown[] =>
  [builtIn("proposed"), builtIn("accepted"), ...labelsIn(ds).map(ofLabel), builtIn("rejected"), builtIn("superseded")];
export const tone = (color: string) => ({ "--status": color, "--group": color }) as React.CSSProperties;

export function StatusPill({ decision }: { decision: Decision }) {
  const s = shownStatus(decision);
  return <span className="decision-status" style={tone(s.color)}>{s.label}</span>;
}

function useSave(decision: Decision) {
  const { act } = useMe();
  return (patch: DecisionPatch) => !!act((d, m) => updateDecision(d, m, decision.id, patch));
}

function NewLabel({ onAdd }: { onAdd: (label: DecisionLabel) => void }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[4].color);
  return (
    <form className="decision-new-label" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onAdd({ name, color }); }}>
      <input autoFocus className="decision-new-label-name" aria-label="Label name" placeholder="e.g. Suspended" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
      <Swatches value={color} onPick={setColor} label="Label colour" />
      <button type="submit" className="btn btn-primary decision-new-label-add" disabled={!name.trim()}>Add label</button>
    </form>
  );
}

function Swatches({ value, onPick, label }: { value?: string; onPick: (color: string) => void; label: string }) {
  return (
    <div className="decision-swatches" role="radiogroup" aria-label={label}>
      {PALETTE.map((p) => (
        <button key={p.color} type="button" role="radio" aria-checked={value === p.color} aria-label={p.name} data-tip={p.name}
          className="decision-swatch" style={{ background: p.color }} onClick={() => onPick(p.color)}>
          {value === p.color && <Check aria-hidden />}
        </button>
      ))}
    </div>
  );
}

/**
 * The status button (a full table cell, or a pill in the panel) and its menu: the built-in statuses, the project's
 * own labels, and "New label".
 */
export function StatusMenu({ decision, siblings, variant }: { decision: Decision; siblings: Decision[]; variant: "cell" | "pill" }) {
  const save = useSave(decision);
  const [creating, setCreating] = useState(false);
  const cur = shownStatus(decision);
  const options = [builtIn("proposed"), builtIn("accepted"), builtIn("rejected"), builtIn("superseded")];
  const labels = labelsIn(siblings);
  const name = variant === "cell" ? `${decision.title}: ${cur.label}. Change status` : `Status: ${cur.label}. Change status`;
  const pick = (patch: DecisionPatch, close: () => void) => { if (save(patch)) { setCreating(false); close(); } };
  return (
    <Popover floating width={240} className="decision-status-menu" trigger={({ open, toggle }) => (
      <button type="button" className={variant === "cell" ? "decision-cell-status-btn" : "decision-status-btn"} style={tone(cur.color)}
        aria-label={name} aria-haspopup="menu" aria-expanded={open} onClick={() => { setCreating(false); toggle(); }}>
        {cur.label}{variant === "pill" && <ChevronDown aria-hidden />}
      </button>
    )}>
      {(close) => (
        <>
          {options.map((o) => (
            <button key={o.key} type="button" role="menuitemradio" aria-checked={cur.key === o.key} className="decision-status-option" style={tone(o.color)}
              onClick={() => { const s = o.key as DecisionStatus; pick({ status: s, label: null, ...(s !== "superseded" && { supersededBy: null }) }, close); }}>
              {o.label}
            </button>
          ))}
          {labels.map((l) => (
            <button key={l.name} type="button" role="menuitemradio" aria-checked={cur.key === ofLabel(l).key} className="decision-status-option" style={tone(l.color)}
              onClick={() => pick({ label: l }, close)}>
              {l.name}
            </button>
          ))}
          <hr className="decision-status-sep" />
          {creating ? <NewLabel onAdd={(l) => pick({ label: l }, close)} />
            : <button type="button" className="menu-item" onClick={() => setCreating(true)}><Plus aria-hidden /> New label</button>}
        </>
      )}
    </Popover>
  );
}

/** The little palette on a sticky note: pick its colour, or go back to its status colour. */
export function NoteColorMenu({ decision }: { decision: Decision }) {
  const save = useSave(decision);
  return (
    <Popover floating width={232} align="right" className="decision-color-menu" anchorClassName="decision-sticky-color" trigger={({ open, toggle }) => (
      <button type="button" className="decision-sticky-color-btn" aria-label={`Note colour for ${decision.title}`} data-tip="Note colour"
        aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Palette aria-hidden /></button>
    )}>
      {(close) => (
        <>
          <Swatches value={decision.color} label="Note colour" onPick={(c) => { if (save({ color: c })) close(); }} />
          {decision.color && <button type="button" className="menu-item" onClick={() => { if (save({ color: null })) close(); }}>Use the status colour</button>}
        </>
      )}
    </Popover>
  );
}
