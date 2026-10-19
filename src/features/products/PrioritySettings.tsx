"use client";

// Settings → Priorities: the four levels (most to least urgent), each renamed and recoloured for this project if you
// like — the board, the table, filters and tickets all show your names and colours. Reset puts a level back.
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { DEFAULT_PRIORITY_NAME, PRIORITIES, setPriority } from "@/data/commands";
import { useDb } from "@/data/StoreProvider";
import type { Priority, Product } from "@/domain/types";
import { PriorityChip, priorityLook } from "@/features/tickets/TicketBits";
import { Popover } from "@/ui/Popover";

const PALETTE = ["#e2445c", "#ff5ac4", "#fdab3d", "#ffcb00", "#9cd326", "#00c875", "#00a9a0", "#4eccf6", "#579bfc", "#5559df", "#401694", "#a25ddc", "#7f5347", "#323338", "#c4c4c4"];
const URGENCY: Record<Priority, string> = { critical: "Most urgent", high: "Urgent", medium: "Normal", low: "Least urgent" };

function Row({ product, level, editable }: { product: Product; level: Priority; editable: boolean }) {
  const { act } = useDb();
  const look = priorityLook(product, level);
  const own = product.priorities?.[level];
  const [name, setName] = useState(look.label);
  const save = (patch: { name?: string; color?: string } | null) => !!act((d, m) => setPriority(d, m, product.key, level, patch));
  const commit = () => { if (name.trim() && name.trim() !== look.label) { if (!save({ name })) setName(look.label); } else setName(look.label); };
  return (
    <li className="settings-row">
      {editable ? (
        <Popover floating width={208} className="settings-swatch-menu" trigger={({ open, toggle }) => (
          <button type="button" className="settings-swatch priority-dot" data-priority={level} style={look.style} aria-label={`Colour of ${look.label}`}
            aria-haspopup="menu" aria-expanded={open} onClick={toggle} />
        )}>
          {(close) => (
            <div className="settings-swatches" role="radiogroup" aria-label={`Colour of ${look.label}`}>
              {PALETTE.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={own?.color === c} aria-label={c} className="settings-swatch is-pick" style={{ background: c }}
                  onClick={() => { save({ color: c }); close(); }} />
              ))}
            </div>
          )}
        </Popover>
      ) : <span className="settings-swatch is-static priority-dot" data-priority={level} style={look.style} aria-hidden />}
      {editable ? (
        <input key={look.label} className="settings-name" aria-label={`Name of the ${URGENCY[level].toLowerCase()} priority`} value={name} maxLength={20}
          placeholder={DEFAULT_PRIORITY_NAME[level]} onChange={(e) => setName(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setName(look.label); e.currentTarget.blur(); } }} />
      ) : <span className="settings-row-name">{look.label}</span>}
      <span className="settings-row-kind">{URGENCY[level]}</span>
      <span className="settings-row-preview"><PriorityChip priority={level} productKey={product.key} /></span>
      <span className="settings-row-tools">
        {editable && own && (
          <button type="button" className="settings-icon-btn" aria-label={`Reset ${look.label}`} data-tip="Back to the default"
            onClick={() => { save(null); setName(DEFAULT_PRIORITY_NAME[level]); }}><RotateCcw aria-hidden /></button>
        )}
      </span>
    </li>
  );
}

export function PrioritySettings({ product }: { product: Product }) {
  const { can } = useDb();
  const editable = can("statuses.edit", { product });
  return (
    <div className="settings-card">
      <ul className="settings-rows" aria-label="Priorities">
        {PRIORITIES.map((level) => <Row key={level} product={product} level={level} editable={editable} />)}
      </ul>
    </div>
  );
}
