"use client";

// The password generator (like 1Password's): a random password, a memorable one made of words, or a PIN. Made in this
// browser with its secure random numbers; nothing leaves it until the item is saved, encrypted.
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  generateMemorable, generatePassword, generatePin, MAX_GENERATED, MAX_PIN, MAX_WORDS, MIN_GENERATED, MIN_PIN, MIN_WORDS, passwordStrength,
  SEPARATORS, type Separator,
} from "./crypto";
import { IconButton } from "@/ui/primitives";

type Kind = "random" | "memorable" | "pin";
interface Options { kind: Kind; length: number; numbers: boolean; symbols: boolean; words: number; separator: Separator; capitalize: boolean; digits: number }
const DEFAULTS: Options = { kind: "random", length: 20, numbers: true, symbols: true, words: 4, separator: "-", capitalize: true, digits: 6 };
const KINDS: Record<Kind, string> = { random: "Random password", memorable: "Memorable password", pin: "PIN code" };
const SAVED = "onefold.vault.generator"; // this browser remembers the choices — never a password

const make = (o: Options) => (o.kind === "pin" ? generatePin(o.digits) : o.kind === "memorable" ? generateMemorable(o.words, o) : generatePassword(o.length, o));

function savedOptions(): Options {
  try {
    const o = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SAVED) ?? "{}") } as Options;
    return o.kind in KINDS && o.separator in SEPARATORS ? o : DEFAULTS;
  } catch { return DEFAULTS; }
}
function save(o: Options) {
  try { localStorage.setItem(SAVED, JSON.stringify(o)); } catch { /* private window: just not remembered */ }
}

/** Digits in blue, symbols in red — easy to read out or type by hand. */
function Preview({ value }: { value: string }) {
  return (
    <output className="vg-preview" aria-label="Generated password" aria-live="polite">
      {[...value].map((c, i) => <span key={i} className={/\d/.test(c) ? "is-digit" : /[A-Za-z]/.test(c) ? undefined : "is-symbol"}>{c}</span>)}
    </output>
  );
}

/** A slider and a box for the same number; the box takes any typing and settles inside the range when you leave it. */
function Amount({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <div className="vg-row">
      <span className="vg-label">{label}</span>
      <input type="range" className="vg-range" min={min} max={max} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" className="vg-num" min={min} max={max} value={draft ?? value} aria-label={`${label}, as a number`}
        onChange={(e) => { setDraft(e.target.value); const n = Number(e.target.value); if (e.target.value && n >= min && n <= max) onChange(n); }}
        onBlur={() => { if (draft !== null) { const n = Number(draft); onChange(clamp(Number.isFinite(n) && draft ? n : value)); setDraft(null); } }} />
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="vg-row">
      <span className="vg-label">{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch vg-switch" onClick={() => onChange(!on)} />
    </div>
  );
}

/** Opened from an item's password field: "Use" fills the password in. */
export function PasswordGenerator({ onUse, onCancel }: { onUse: (password: string) => void; onCancel: () => void }) {
  const [o, setO] = useState(savedOptions);
  const [value, setValue] = useState(() => make(o));
  const update = (patch: Partial<Options>) => {
    const next = { ...o, ...patch };
    setO(next);
    setValue(make(next));
    save(next);
  };
  return (
    <div className="vg" role="group" aria-label="Password generator">
      <header className="vg-head">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>Cancel</button>
        <IconButton label="Make another" onClick={() => setValue(make(o))}><RefreshCw /></IconButton>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onUse(value)}>Use</button>
      </header>
      <Preview value={value} />
      <span className="vg-meter" data-score={passwordStrength(value)} aria-hidden />
      <div className="vg-row">
        <span className="vg-label">Type</span>
        <select className="vg-select" value={o.kind} aria-label="Type" onChange={(e) => update({ kind: e.target.value as Kind })}>
          {Object.entries(KINDS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      {o.kind === "random" && (
        <>
          <Amount label="Characters" min={MIN_GENERATED} max={MAX_GENERATED} value={o.length} onChange={(length) => update({ length })} />
          <Toggle label="Numbers" on={o.numbers} onChange={(numbers) => update({ numbers })} />
          <Toggle label="Symbols" on={o.symbols} onChange={(symbols) => update({ symbols })} />
        </>
      )}
      {o.kind === "memorable" && (
        <>
          <Amount label="Words" min={MIN_WORDS} max={MAX_WORDS} value={o.words} onChange={(words) => update({ words })} />
          <div className="vg-row">
            <span className="vg-label">Separator</span>
            <select className="vg-select" value={o.separator} aria-label="Separator" onChange={(e) => update({ separator: e.target.value as Separator })}>
              {Object.entries(SEPARATORS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <Toggle label="Capitalize" on={o.capitalize} onChange={(capitalize) => update({ capitalize })} />
        </>
      )}
      {o.kind === "pin" && <Amount label="Digits" min={MIN_PIN} max={MAX_PIN} value={o.digits} onChange={(digits) => update({ digits })} />}
    </div>
  );
}
