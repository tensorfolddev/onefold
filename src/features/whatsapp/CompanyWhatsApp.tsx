"use client";

// Integrations → Team Bot, for admins — its tabs, monday-style: Members (who's linked, as a table), Daily brief (when
// it goes), Templates (the words that ask for it, and every message the bot sends — previewed exactly as a teammate
// sees it, each back to 1FOLD's own in one click) and Deliveries (what went out, and whether it arrived).
import { RefreshCw, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, message as problemOf } from "@/data/api";
import { useMe } from "@/data/StoreProvider";
import { relativeTime, shortDate } from "@/domain/status";
import {
  DEFAULT_SETTINGS, message, normalWord, scheduleText, TEMPLATE_KEYS, TEMPLATES, WEEKDAY_NAMES,
  type TemplateKey, type WhatsAppSettings,
} from "@/domain/whatsapp";
import { Avatar } from "@/ui/primitives";

interface Linked { personId: string; phone: string; briefs: boolean; linkedAt: string }
interface Delivery { at: string; personId: string | null; kind: string; status: "sent" | "email" | "waiting" | "failed" | "none"; preview: string }
export interface CompanyBot { state: "off" | "pairing" | "connecting" | "connected" | "logged_out"; qr: string | null; phone: string | null; request: string | null }
export interface Company { settings: WhatsAppSettings; timeZone: string; linked: Linked[]; log: Delivery[]; companyBot: CompanyBot | null }
export type Save = (settings: Partial<WhatsAppSettings>, success: string) => Promise<boolean>;

/** The company's WhatsApp for its admins (settings, who's linked, what went out, its own number), and saving changes. */
export function useCompanyWhatsApp() {
  const { toast } = useMe();
  const [data, setData] = useState<Company | null>(null);
  const [failed, setFailed] = useState(false);
  const [loads, setLoads] = useState(0);
  const reload = useCallback(() => setLoads((n) => n + 1), []);
  useEffect(() => {
    let live = true;
    api<Company>("/api/whatsapp/company")
      .then((d) => { if (live) { setData(d); setFailed(false); } })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [loads]);

  /** Saves part of the settings; the server checks it and sends back what's now in force. */
  const save: Save = async (settings, success) => {
    try {
      const next = await api<WhatsAppSettings>("/api/whatsapp/company", { settings });
      setData((d) => (d ? { ...d, settings: next } : d));
      toast(success, undefined, "success");
      return true;
    } catch (e) {
      toast(problemOf(e), undefined, "error");
      return false;
    }
  };
  return { data, failed, reload, save };
}

/** WhatsApp's own formatting, as WhatsApp shows it: *bold*, _italic_, line breaks. */
export function WaText({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <span key={i} className="wa-line">
          {line.split(/(\*[^*\n]+\*|_[^_\n]+_)/).map((part, j) => (
            part.startsWith("*") && part.endsWith("*") && part.length > 2 ? <strong key={j}>{part.slice(1, -1)}</strong>
              : part.startsWith("_") && part.endsWith("_") && part.length > 2 ? <em key={j}>{part.slice(1, -1)}</em>
              : part
          ))}
          {"\n"}
        </span>
      ))}
    </>
  );
}

/** A monday-style status cell: the whole cell in the status's colour, its label in white. */
const Status = ({ tone, children }: { tone: "green" | "blue" | "orange" | "red" | "grey"; children: React.ReactNode }) => (
  <span role="cell" className={`tb-status is-${tone}`}>{children}</span>
);

// ---------- Members ----------

export function MembersTab({ linked }: { linked: Linked[] }) {
  const { db } = useMe();
  const team = db.people.filter((p) => p.active && p.panel);
  const byId = new Map(linked.map((l) => [l.personId, l]));
  const rows = [...team].sort((a, b) => Number(byId.has(b.id)) - Number(byId.has(a.id)) || a.name.localeCompare(b.name));
  return (
    <section className="tb-section" aria-labelledby="tb-members">
      <header className="tb-section-head">
        <div>
          <h2 id="tb-members">Members</h2>
          <p><strong>{linked.length} of {team.length}</strong> linked to the bot. Each teammate links their own number from Integrations → WhatsApp.</p>
        </div>
      </header>
      <div className="tb-table is-members" role="table" aria-label="Members">
        <div className="tb-row tb-head" role="row">
          <span role="columnheader">Member</span><span role="columnheader">WhatsApp</span><span role="columnheader">Status</span>
          <span role="columnheader">Daily brief</span><span role="columnheader">Linked</span>
        </div>
        {rows.map((p) => {
          const l = byId.get(p.id);
          return (
            <div key={p.id} className="tb-row" role="row">
              <span role="cell" className="tb-person"><Avatar personId={p.id} size="sm" /><span><strong>{p.name}</strong><span className="muted">{p.role}</span></span></span>
              <span role="cell" className="tb-mono">{l ? l.phone : <span className="muted">—</span>}</span>
              {l ? <Status tone="green">Connected</Status> : <Status tone="grey">Not connected</Status>}
              <span role="cell">{l ? (l.briefs ? "On" : "Off") : <span className="muted">—</span>}</span>
              <span role="cell" className="muted">{l ? shortDate(l.linkedAt) : "—"}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Daily brief ----------

export function BriefTab({ settings, timeZone, save }: { settings: WhatsAppSettings; timeZone: string; save: Save }) {
  const [on, setOn] = useState(settings.briefOn);
  const [at, setAt] = useState(settings.briefAt);
  const [days, setDays] = useState(settings.briefDays);
  const draft = { ...settings, briefOn: on, briefAt: at, briefDays: days };
  const changed = on !== settings.briefOn || at !== settings.briefAt || days.join() !== settings.briefDays.join();
  const isDefault = at === DEFAULT_SETTINGS.briefAt && days.join() === DEFAULT_SETTINGS.briefDays.join();
  const flipDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));
  return (
    <form className="tb-section" aria-labelledby="tb-brief" onSubmit={(e) => { e.preventDefault(); void save({ briefOn: on, briefAt: at, briefDays: days }, "Daily brief saved"); }}>
      <header className="tb-section-head">
        <div>
          <h2 id="tb-brief">Daily brief</h2>
          <p>Each linked teammate gets their pending tasks, project by project, at the same time every brief day.</p>
        </div>
      </header>
      <div className="tb-card">
        <div className="tb-setting">
          <div><strong>Send the daily brief</strong><span>Off, teammates can still ask for it with a reply word.</span></div>
          <button type="button" role="switch" aria-checked={on} aria-label="Send the daily brief" className="switch" onClick={() => setOn(!on)} />
        </div>
        <div className={`tb-setting${on ? "" : " is-off"}`}>
          <div><strong>Time</strong><span>{timeZone.replace(/_/g, " ")} time</span></div>
          <input className="input tb-time" type="time" step={300} value={at} disabled={!on} aria-label="Time" onChange={(e) => setAt(e.target.value)} />
        </div>
        <div className={`tb-setting${on ? "" : " is-off"}`}>
          <div><strong>Days</strong><span>Pick the days it goes out.</span></div>
          <div className="tb-days" role="group" aria-label="Days">
            {WEEKDAY_NAMES.map((name, d) => (
              <button key={name} type="button" aria-pressed={days.includes(d)} disabled={!on} onClick={() => flipDay(d)}>{name}</button>
            ))}
          </div>
        </div>
        <div className="tb-setting is-preview">
          <div><strong>Teammates are told</strong><span>In the bot&apos;s reply when they link their number.</span></div>
          <p className="tb-told"><WaText text={scheduleText(draft)} /></p>
        </div>
      </div>
      <footer className="tb-actions">
        {!isDefault && <button type="button" className="btn btn-tertiary" onClick={() => { setAt(DEFAULT_SETTINGS.briefAt); setDays(DEFAULT_SETTINGS.briefDays); }}><RotateCcw aria-hidden /> Reset to 9:00, Mon–Fri</button>}
        <button type="submit" className="btn btn-primary" disabled={!changed || (on && !days.length)}>Save</button>
      </footer>
    </form>
  );
}

// ---------- Templates: the reply words, and every message ----------

export function TemplatesTab({ settings, save }: { settings: WhatsAppSettings; save: Save }) {
  const { db } = useMe();
  const [words, setWords] = useState(settings.words);
  const [typed, setTyped] = useState("");
  const [texts, setTexts] = useState(settings.templates);
  const [open, setOpen] = useState<TemplateKey>(TEMPLATE_KEYS[0]);
  const draft = useMemo(() => ({ ...settings, words, templates: texts }), [settings, words, texts]);
  const sample: Record<TemplateKey, Record<string, string>> = {
    briefGreeting: { greeting: "Good morning", name: "Sam" },
    briefEmpty: {},
    briefClosing: { link: `${location.origin}/my-work` },
    urgent: { actor: "Ayla Khan", place: "CH-12 · Fix the checkout total", message: ":\n\n“Can you take this today?”", link: `${location.origin}/t/CH-12` },
    connected: { company: db.org.name, schedule: scheduleText(settings) },
    help: {},
    signOff: {},
  };
  const add = () => {
    const w = normalWord(typed);
    if (w && !words.includes(w)) setWords([...words, w]);
    setTyped("");
  };
  const changed = words.join() !== settings.words.join() || TEMPLATE_KEYS.some((k) => texts[k] !== settings.templates[k]);
  const groups = ["Daily brief", "Messages"] as const;
  return (
    <form className="tb-section" aria-labelledby="tb-templates" onSubmit={(e) => { e.preventDefault(); void save({ words, templates: texts }, "Templates saved"); }}>
      <header className="tb-section-head">
        <div>
          <h2 id="tb-templates">Templates</h2>
          <p>The words that ask the bot for the brief, and everything the bot sends — <em>*stars*</em> make bold, <em>_lines_</em> italic, and the <code>{"{fields}"}</code> are filled in for each person.</p>
        </div>
      </header>

      <div className="tb-card tb-words-card">
        <div className="tb-words-head"><strong>Reply words</strong><span>A teammate who sends one of these gets their brief straight away. <em>1 Fold</em> is <em>1FOLD</em>; the first is the one messages mention.</span></div>
        <ul className="tb-words" aria-label="Reply words">
          {words.map((w, i) => (
            <li key={w}>
              <span>{w.toUpperCase()}</span>{i === 0 && <span className="tb-word-main">mentioned</span>}
              {words.length > 1 && <button type="button" aria-label={`Remove ${w.toUpperCase()}`} onClick={() => setWords(words.filter((x) => x !== w))}><X aria-hidden /></button>}
            </li>
          ))}
          <li className="tb-word-add">
            <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="+ Add a word" aria-label="New reply word"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} onBlur={add} />
          </li>
        </ul>
      </div>

      <div className="tb-card tb-templates">
        <nav className="tb-template-list" aria-label="Templates">
          {groups.map((g) => (
            <div key={g} className="tb-template-group">
              <p className="tb-template-group-name">{g}</p>
              {TEMPLATE_KEYS.filter((k) => TEMPLATES[k].group === g).map((k) => (
                <button key={k} type="button" aria-pressed={open === k} onClick={() => setOpen(k)}>
                  <span><strong>{TEMPLATES[k].label}</strong><span className="muted">{TEMPLATES[k].hint}</span></span>
                  {texts[k] !== DEFAULT_SETTINGS.templates[k] && <span className="tb-edited">Edited</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="tb-template-edit">
          <div className="tb-template-edit-head">
            <label htmlFor="tb-template"><strong>{TEMPLATES[open].group} · {TEMPLATES[open].label}</strong></label>
            {texts[open] !== DEFAULT_SETTINGS.templates[open] && (
              <button type="button" className="btn btn-tertiary" onClick={() => setTexts({ ...texts, [open]: DEFAULT_SETTINGS.templates[open] })}><RotateCcw aria-hidden /> Reset</button>
            )}
          </div>
          <textarea id="tb-template" className="input tb-textarea" rows={7} value={texts[open]} maxLength={1500}
            onChange={(e) => setTexts({ ...texts, [open]: e.target.value })} />
          {TEMPLATES[open].fields.length > 0 && (
            <div className="tb-fields"><span className="muted">Insert</span>{TEMPLATES[open].fields.map((f) => (
              <button key={f} type="button" className="tb-field" onClick={() => setTexts({ ...texts, [open]: `${texts[open]}{${f}}` })}>{`{${f}}`}</button>
            ))}</div>
          )}
          <p className="tb-preview-label">Preview</p>
          <div className="wa-chat"><div className="wa-bubble" aria-label="Preview"><WaText text={open === "signOff" ? texts.signOff : message(draft, open, sample[open])} /></div></div>
          <p className="muted tb-note">{"{words}"} is {(words[0] ?? "1fold").toUpperCase()} — your first reply word.</p>
        </div>
      </div>
      <footer className="tb-actions">
        <button type="submit" className="btn btn-primary" disabled={!changed || !words.length}>Save templates</button>
      </footer>
    </form>
  );
}

// ---------- Deliveries ----------

const DELIVERY: Record<Delivery["status"], { label: string; tone: "green" | "blue" | "orange" | "red" | "grey" }> = {
  sent: { label: "Delivered", tone: "green" },
  email: { label: "By email", tone: "blue" },
  waiting: { label: "Waiting", tone: "orange" },
  failed: { label: "Failed", tone: "red" },
  none: { label: "Nothing to send", tone: "grey" },
};
const KIND: Record<string, string> = { urgent: "Urgent alert", brief: "Daily brief" };

export function DeliveriesTab({ log, onRefresh }: { log: Delivery[]; onRefresh: () => void }) {
  const { personById } = useMe();
  const [only, setOnly] = useState<"all" | "problems">("all");
  const problems = log.filter((d) => d.status === "failed" || d.status === "waiting");
  const shown = only === "all" ? log : problems;
  return (
    <section className="tb-section" aria-labelledby="tb-deliveries">
      <header className="tb-section-head">
        <div>
          <h2 id="tb-deliveries">Deliveries</h2>
          <p>The last two weeks: every urgent alert and daily brief, and whether it arrived.</p>
        </div>
        <div className="tb-head-tools">
          <div className="docs-view-switch" role="group" aria-label="Show">
            <button type="button" aria-pressed={only === "all"} onClick={() => setOnly("all")}>All</button>
            <button type="button" aria-pressed={only === "problems"} onClick={() => setOnly("problems")}>Problems{problems.length ? ` · ${problems.length}` : ""}</button>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onRefresh}><RefreshCw aria-hidden /> Refresh</button>
        </div>
      </header>
      <div className="tb-table is-deliveries" role="table" aria-label="Deliveries">
        <div className="tb-row tb-head" role="row">
          <span role="columnheader">Status</span><span role="columnheader">Type</span><span role="columnheader">To</span>
          <span role="columnheader">Message</span><span role="columnheader">When</span>
        </div>
        {shown.length === 0 && <div className="tb-row is-empty" role="row"><span role="cell">{only === "all" ? "Nothing sent yet." : "No problems — everything arrived."}</span></div>}
        {shown.map((d, i) => {
          const st = DELIVERY[d.status];
          const who = personById(d.personId ?? undefined);
          return (
            <div key={`${d.at}-${i}`} className="tb-row" role="row">
              <Status tone={st.tone}>{st.label}</Status>
              <span role="cell">{KIND[d.kind] ?? d.kind}</span>
              <span role="cell" className="tb-person">{who ? <><Avatar personId={who.id} size="sm" /><strong>{who.name}</strong></> : <span className="muted">Someone who left</span>}</span>
              <span role="cell" className="tb-preview muted">{d.preview}</span>
              <span role="cell" className="muted">{relativeTime(d.at)} ago</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
