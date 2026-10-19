"use client";

// Integrations → WhatsApp bot, for admins — its tabs: who's linked to the bot, what went out (and whether it arrived),
// when the daily brief goes and on which days, the words that ask the bot for it, and every message the bot sends —
// each previewed exactly as a teammate will see it, and each back to 1FOLD's own in one click.
import { Check, Clock3, MailCheck, MessageSquareText, RefreshCw, RotateCcw, Send, Users, X, CircleSlash, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, message as problemOf } from "@/data/api";
import { useMe } from "@/data/StoreProvider";
import { relativeTime } from "@/domain/status";
import {
  DEFAULT_SETTINGS, fill, message, normalWord, scheduleText, TEMPLATE_KEYS, TEMPLATES, WEEKDAY_NAMES, wordsText,
  type TemplateKey, type WhatsAppSettings,
} from "@/domain/whatsapp";
import { Avatar } from "@/ui/primitives";

interface Linked { personId: string; phone: string; briefs: boolean; linkedAt: string }
interface Delivery { at: string; personId: string | null; kind: string; status: "sent" | "email" | "waiting" | "failed" | "none"; preview: string }
export interface Company { settings: WhatsAppSettings; timeZone: string; linked: Linked[]; log: Delivery[] }

const STATUS: Record<Delivery["status"], { label: string; icon: React.ReactNode; tone: string }> = {
  sent: { label: "Delivered", icon: <Check />, tone: "is-good" },
  email: { label: "By email", icon: <MailCheck />, tone: "is-info" },
  waiting: { label: "Waiting", icon: <Clock3 />, tone: "is-wait" },
  failed: { label: "Failed", icon: <TriangleAlert />, tone: "is-bad" },
  none: { label: "Nothing to send", icon: <CircleSlash />, tone: "is-muted" },
};
const KIND: Record<string, string> = { urgent: "Urgent alert", brief: "Daily brief" };

/** WhatsApp's own formatting, as WhatsApp shows it: *bold*, _italic_, line breaks. */
function WaText({ text }: { text: string }) {
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

/** The company's WhatsApp for its admins (settings, who's linked, what went out), and saving changes to it. */
export function useCompanyWhatsApp() {
  const { toast } = useMe();
  const [data, setData] = useState<Company | null>(null);
  const [failed, setFailed] = useState(false);
  const [loads, setLoads] = useState(0);
  const reload = () => setLoads((n) => n + 1);
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

export function ConnectedTab({ linked }: { linked: Linked[] }) {
  const { db } = useMe();
  const team = db.people.filter((p) => p.active && p.panel);
  const byId = new Map(linked.map((l) => [l.personId, l]));
  const rows = [...team].sort((a, b) => Number(byId.has(b.id)) - Number(byId.has(a.id)) || a.name.localeCompare(b.name));
  return (
    <>
      <p className="company-wa-lead"><Users aria-hidden /> <strong>{linked.length} of {team.length}</strong> linked to the bot. Each links their own number from <em>My WhatsApp</em>; nobody can be added from here.</p>
      <ul className="wa-people" aria-label="Who's linked">
        {rows.map((p) => {
          const l = byId.get(p.id);
          return (
            <li key={p.id} className={l ? "is-linked" : undefined}>
              <Avatar personId={p.id} size="sm" />
              <span className="wa-person"><strong>{p.name}</strong><span className="muted">{p.role}</span></span>
              {l ? (
                <>
                  <span className="wa-phone">{l.phone}</span>
                  <span className={`wa-chip ${l.briefs ? "is-good" : "is-muted"}`}>{l.briefs ? "Gets the brief" : "Brief off"}</span>
                  <span className="muted wa-when">since {relativeTime(l.linkedAt)} ago</span>
                </>
              ) : <span className="wa-chip is-muted">Not linked</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function DeliveriesTab({ log, onRefresh }: { log: Delivery[]; onRefresh: () => void }) {
  const { personById } = useMe();
  const [only, setOnly] = useState<"all" | "problems">("all");
  const shown = only === "all" ? log : log.filter((d) => d.status === "failed" || d.status === "waiting");
  const failed = log.filter((d) => d.status === "failed").length;
  return (
    <>
      <div className="company-wa-bar">
        <p className="company-wa-lead"><Send aria-hidden /> The last two weeks: urgent alerts and daily briefs, and whether each arrived.</p>
        <div className="docs-view-switch" role="group" aria-label="Show">
          <button type="button" aria-pressed={only === "all"} onClick={() => setOnly("all")}>All</button>
          <button type="button" aria-pressed={only === "problems"} onClick={() => setOnly("problems")}>Problems{failed ? ` · ${failed}` : ""}</button>
        </div>
        <button type="button" className="btn btn-tertiary" onClick={onRefresh}><RefreshCw aria-hidden /> Refresh</button>
      </div>
      {shown.length === 0 ? <p className="archived-empty">{only === "all" ? "Nothing sent yet." : "No problems — everything arrived."}</p> : (
        <ul className="wa-log" aria-label="Deliveries">
          {shown.map((d, i) => {
            const st = STATUS[d.status];
            const who = personById(d.personId ?? undefined);
            return (
              <li key={`${d.at}-${i}`}>
                <span className={`wa-chip ${st.tone}`}>{st.icon}{st.label}</span>
                <span className="wa-kind">{KIND[d.kind] ?? d.kind}</span>
                <span className="wa-person">{who ? <><Avatar personId={who.id} size="sm" /> {who.name}</> : <span className="muted">Someone who left</span>}</span>
                <span className="wa-preview muted">{d.preview}</span>
                <span className="muted wa-when">{relativeTime(d.at)} ago</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export type Save = (settings: Partial<WhatsAppSettings>, success: string) => Promise<boolean>;

export function BriefTab({ settings, timeZone, save }: { settings: WhatsAppSettings; timeZone: string; save: Save }) {
  const [on, setOn] = useState(settings.briefOn);
  const [at, setAt] = useState(settings.briefAt);
  const [days, setDays] = useState(settings.briefDays);
  const draft = { ...settings, briefOn: on, briefAt: at, briefDays: days };
  const changed = on !== settings.briefOn || at !== settings.briefAt || days.join() !== settings.briefDays.join();
  const flipDay = (d: number) => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b)));
  return (
    <form className="wa-form" onSubmit={(e) => { e.preventDefault(); void save({ briefOn: on, briefAt: at, briefDays: days }, "Daily brief saved"); }}>
      <label className="settings-toggle">
        <input type="checkbox" role="switch" checked={on} onChange={(e) => setOn(e.target.checked)} />
        <span><strong>Send the daily brief</strong><span className="muted">Each linked teammate gets their pending tasks, project by project. Off, they can still ask for it.</span></span>
      </label>
      <fieldset className="wa-fieldset" disabled={!on}>
        <label className="wa-field">
          <span className="field-label">Time</span>
          <input className="input wa-time" type="time" step={300} value={at} onChange={(e) => setAt(e.target.value)} aria-describedby="wa-zone" />
          <span id="wa-zone" className="muted">{timeZone.replace(/_/g, " ")} time</span>
        </label>
        <div className="wa-field">
          <span className="field-label" id="wa-days">Days</span>
          <div className="wa-days" role="group" aria-labelledby="wa-days">
            {WEEKDAY_NAMES.map((name, d) => (
              <button key={name} type="button" aria-pressed={days.includes(d)} onClick={() => flipDay(d)}>{name}</button>
            ))}
          </div>
        </div>
      </fieldset>
      <p className="wa-preview-line"><MessageSquareText aria-hidden /> Teammates are told: <WaText text={scheduleText(draft)} /></p>
      <div className="wa-actions">
        <button type="submit" className="btn btn-primary" disabled={!changed || (on && !days.length)}>Save</button>
        {(settings.briefAt !== DEFAULT_SETTINGS.briefAt || settings.briefDays.join() !== DEFAULT_SETTINGS.briefDays.join()) && (
          <button type="button" className="btn btn-tertiary" onClick={() => { setAt(DEFAULT_SETTINGS.briefAt); setDays(DEFAULT_SETTINGS.briefDays); }}>
            <RotateCcw aria-hidden /> 9:00, Monday to Friday
          </button>
        )}
      </div>
    </form>
  );
}

export function WordsTab({ settings, save }: { settings: WhatsAppSettings; save: Save }) {
  const [words, setWords] = useState(settings.words);
  const [typed, setTyped] = useState("");
  const add = () => {
    const w = normalWord(typed);
    if (w && !words.includes(w)) setWords([...words, w]);
    setTyped("");
  };
  const changed = words.join() !== settings.words.join();
  return (
    <form className="wa-form" onSubmit={(e) => { e.preventDefault(); void save({ words }, "Reply words saved"); }}>
      <p className="company-wa-lead"><MessageSquareText aria-hidden /> A teammate who sends one of these gets their brief straight away. Capitals, spaces and dots don&apos;t matter — <em>1 Fold</em> is <em>1FOLD</em>. The first is the one the bot&apos;s messages mention.</p>
      <ul className="wa-words" aria-label="Reply words">
        {words.map((w, i) => (
          <li key={w}>
            <span className="wa-word">{w.toUpperCase()}</span>{i === 0 && <span className="muted"> · mentioned</span>}
            {words.length > 1 && (
              <button type="button" className="doc-row-btn" aria-label={`Remove ${w.toUpperCase()}`} onClick={() => setWords(words.filter((x) => x !== w))}><X aria-hidden /></button>
            )}
          </li>
        ))}
      </ul>
      <div className="wa-add">
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Add a word, like STATUS" aria-label="New reply word"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn btn-secondary" disabled={!normalWord(typed)} onClick={add}>Add</button>
      </div>
      <div className="wa-actions">
        <button type="submit" className="btn btn-primary" disabled={!changed}>Save</button>
        {words.join() !== DEFAULT_SETTINGS.words.join() && (
          <button type="button" className="btn btn-tertiary" onClick={() => setWords(DEFAULT_SETTINGS.words)}><RotateCcw aria-hidden /> 1FOLD and TODAY</button>
        )}
      </div>
    </form>
  );
}

export function MessagesTab({ settings, save }: { settings: WhatsAppSettings; save: Save }) {
  const { db } = useMe();
  const [texts, setTexts] = useState(settings.templates);
  const [open, setOpen] = useState<TemplateKey>("urgent");
  const draft = useMemo(() => ({ ...settings, templates: texts }), [settings, texts]);
  const sample: Record<TemplateKey, Record<string, string>> = {
    urgent: { actor: "Ayla Khan", place: "CH-12 · Fix the checkout total", message: ":\n\n“Can you take this today?”", link: `${location.origin}/t/CH-12` },
    connected: { company: db.org.name, schedule: scheduleText(settings) },
    help: {},
    signOff: {},
  };
  const changed = TEMPLATE_KEYS.some((k) => texts[k] !== settings.templates[k]);
  return (
    <form className="wa-form" onSubmit={(e) => { e.preventDefault(); void save({ templates: texts }, "Messages saved"); }}>
      <p className="company-wa-lead"><MessageSquareText aria-hidden /> Reword any message the bot sends. <em>*Stars*</em> make bold, <em>_lines_</em> italic; the <code>{"{fields}"}</code> are filled in for each person.</p>
      <div className="wa-templates">
        <ul className="wa-template-list" role="tablist" aria-label="Messages">
          {TEMPLATE_KEYS.map((k) => (
            <li key={k}>
              <button type="button" role="tab" aria-selected={open === k} onClick={() => setOpen(k)}>
                <strong>{TEMPLATES[k].label}</strong><span className="muted">{TEMPLATES[k].hint}</span>
                {texts[k] !== DEFAULT_SETTINGS.templates[k] && <span className="wa-chip is-info">Reworded</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="wa-template-edit" role="tabpanel" aria-label={TEMPLATES[open].label}>
          <label className="field-label" htmlFor="wa-template">{TEMPLATES[open].label}</label>
          <textarea id="wa-template" className="input wa-textarea" rows={8} value={texts[open]} maxLength={1500}
            onChange={(e) => setTexts({ ...texts, [open]: e.target.value })} />
          {TEMPLATES[open].fields.length > 0 && (
            <p className="wa-fields">Fields: {TEMPLATES[open].fields.map((f) => (
              <button key={f} type="button" className="wa-field-chip" onClick={() => setTexts({ ...texts, [open]: `${texts[open]}{${f}}` })}>{`{${f}}`}</button>
            ))}</p>
          )}
          {texts[open] !== DEFAULT_SETTINGS.templates[open] && (
            <button type="button" className="btn btn-tertiary" onClick={() => setTexts({ ...texts, [open]: DEFAULT_SETTINGS.templates[open] })}><RotateCcw aria-hidden /> Back to 1FOLD&apos;s</button>
          )}
          <p className="field-label">What they&apos;ll see</p>
          <div className="wa-bubble" aria-label="Preview">
            <WaText text={open === "signOff" ? texts.signOff : message(draft, open, sample[open])} />
          </div>
          <p className="muted wa-note">{open === "urgent" ? `${fill("{actor}", sample.urgent)} is the person who @@mentioned them; the link opens the ticket.` : `Mentions ${wordsText(settings.words)} — the first reply word.`}</p>
        </div>
      </div>
      <div className="wa-actions">
        <button type="submit" className="btn btn-primary" disabled={!changed}>Save messages</button>
      </div>
    </form>
  );
}
