// What a company's admins can set for WhatsApp, and 1FOLD's own defaults: the daily brief (on or off, its time, its
// days), the words a teammate replies to get their tasks right away, and the bot's messages. Pure, so the settings
// screen previews exactly what the bot will send.
import { ValidationError } from "./commands/shared.ts";

export type TemplateKey = "briefGreeting" | "briefEmpty" | "briefClosing" | "urgent" | "connected" | "help" | "signOff";
export interface WhatsAppSettings {
  briefOn: boolean;
  briefAt: string; // "09:00", the company's local time
  briefDays: number[]; // 0 = Sunday
  words: string[]; // as the bot hears them: lowercase letters and digits ("1fold")
  templates: Record<TemplateKey, string>;
}

/** Each message the bot sends that a company can reword: what it's for, the {fields} it fills in, and 1FOLD's own text. */
export const TEMPLATES: Record<TemplateKey, { label: string; hint: string; fields: string[]; text: string; group: "Daily brief" | "Messages" }> = {
  briefGreeting: {
    label: "Greeting", hint: "Opens each person's daily brief, above their tasks", fields: ["greeting", "name"], group: "Daily brief",
    text: "*{greeting}, {name},*",
  },
  briefEmpty: {
    label: "Nothing pending", hint: "When someone has no pending tasks", fields: [], group: "Daily brief",
    text: "You have no pending tasks 🎉",
  },
  briefClosing: {
    label: "Closing", hint: "Ends the daily brief, below the tasks", fields: ["link", "words", "signOff"], group: "Daily brief",
    text: "📋 All your work: {link}\n\nReply {words} anytime for updates.\n\n{signOff}",
  },
  urgent: {
    label: "Urgent alert", hint: "Sent the moment someone @@mentions a teammate", fields: ["actor", "place", "message", "link"], group: "Messages",
    text: "🚨 *{actor}* needs you\nThey mentioned you in *{place}*{message}\n\nPlease check it: {link}",
  },
  connected: {
    label: "Number linked", hint: "The bot's reply when a teammate links their WhatsApp", fields: ["company", "schedule", "words", "signOff"], group: "Messages",
    text: "✅ *You're connected to 1FOLD*\n_{company}_\n\n{schedule}\n\nReply {words} anytime for updates.\n\n{signOff}",
  },
  help: {
    label: "Help reply", hint: "When a teammate sends the bot anything else", fields: ["words", "signOff"], group: "Messages",
    text: "👋 *This is 1FOLD*\n\nReply {words} anytime for your pending tasks.\n\n{signOff}",
  },
  signOff: { label: "Sign-off", hint: "Ends the daily brief and the bot's replies", fields: [], text: "🤍 *1FOLD By TensorFold* 🤍", group: "Messages" },
};
export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export const DEFAULT_SETTINGS: WhatsAppSettings = {
  briefOn: true, briefAt: "09:00", briefDays: [1, 2, 3, 4, 5], words: ["1fold", "today"],
  templates: Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, TEMPLATES[k].text])) as Record<TemplateKey, string>,
};

export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MAX_WORDS = 10;
const MAX_TEMPLATE = 1500;

/** A word as the bot hears it: "1 Fold!" → "1fold". */
export const normalWord = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Minutes after midnight of "HH:MM". */
export const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
/** Fills {field}s; one it doesn't know stays as typed. */
export const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

/** The word the bot's messages tell people to reply — the first one ("*1FOLD*"); the others work too, unadvertised. */
export const wordsText = (words: string[]) => `*${(words[0] ?? "1fold").toUpperCase()}*`;
/** "working day", "day", or "Mon, Wed and Fri". */
export function daysText(days: number[]): string {
  const d = [...days].sort((a, b) => a - b);
  if (d.join() === "1,2,3,4,5") return "working day";
  if (d.length === 7) return "day";
  const names = d.map((n) => WEEKDAY_NAMES[n]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "";
}
/** The line that tells a teammate when their brief comes. */
export const scheduleText = (s: WhatsAppSettings) =>
  s.briefOn ? `Every ${daysText(s.briefDays)} at *${s.briefAt}* you'll get your pending tasks here.` : "Ask for your pending tasks whenever you like.";

/** One of the bot's messages, as this company words it — {words} and {signOff} filled in, then `values`. */
export const message = (s: WhatsAppSettings, key: TemplateKey, values: Record<string, string> = {}) =>
  fill(s.templates[key], { words: wordsText(s.words), signOff: s.templates.signOff, ...values });

/** Settings as given (by an admin, or from storage), checked: anything left out is the default. */
export function cleanSettings(input: unknown, base: WhatsAppSettings = DEFAULT_SETTINGS): WhatsAppSettings {
  const i = (input && typeof input === "object" ? input : {}) as Partial<Record<keyof WhatsAppSettings, unknown>>;
  const out: WhatsAppSettings = { ...base, templates: { ...base.templates } };
  if (i.briefOn !== undefined) out.briefOn = i.briefOn === true;
  if (i.briefAt !== undefined) {
    if (typeof i.briefAt !== "string" || !TIME.test(i.briefAt)) throw new ValidationError("Pick a time like 09:00");
    out.briefAt = i.briefAt;
  }
  if (i.briefDays !== undefined) {
    const days = Array.isArray(i.briefDays) ? [...new Set(i.briefDays.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))] : [];
    if (!days.length) throw new ValidationError("Pick at least one day for the brief");
    out.briefDays = days.sort((a, b) => a - b);
  }
  if (i.words !== undefined) {
    const words = Array.isArray(i.words) ? [...new Set(i.words.filter((w): w is string => typeof w === "string").map(normalWord).filter(Boolean))] : [];
    if (!words.length) throw new ValidationError("Keep at least one word that asks for the brief");
    if (words.length > MAX_WORDS) throw new ValidationError(`Up to ${MAX_WORDS} words`);
    if (words.some((w) => w.length > 20)) throw new ValidationError("Keep each word under 20 letters");
    out.words = words;
  }
  if (i.templates !== undefined) {
    const t = (i.templates && typeof i.templates === "object" ? i.templates : {}) as Record<string, unknown>;
    for (const k of TEMPLATE_KEYS) {
      if (t[k] === undefined) continue;
      if (typeof t[k] !== "string") throw new ValidationError(`${TEMPLATES[k].label}: that isn't text`);
      const text = (t[k] as string).trim();
      if (text.length > MAX_TEMPLATE) throw new ValidationError(`${TEMPLATES[k].label}: keep it under ${MAX_TEMPLATE} characters`);
      out.templates[k] = text || TEMPLATES[k].text; // emptied: back to 1FOLD's own
    }
  }
  return out;
}
