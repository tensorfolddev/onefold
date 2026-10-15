import { now } from "./clock.ts";
import type { Health, Stage, StatusCategory, Tone } from "./types.ts";

export const CATEGORY_LABEL: Record<StatusCategory, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

export const CATEGORY_ORDER: StatusCategory[] = ["in_progress", "todo", "backlog", "done", "cancelled"];

/** Group colour per category (group bar + group title). */
export const CATEGORY_TONE: Record<StatusCategory, Tone> = {
  backlog: "backlog",
  todo: "todo",
  in_progress: "working",
  done: "done",
  cancelled: "cancelled",
};

export const toneVar = (tone: Tone) => `var(--tone-${tone})`;

export const STAGES: Stage[] = ["INTAKE", "DEFINE", "PLAN", "BUILD", "RELEASE"];

export const STAGE_TONE: Record<Stage, string> = {
  INTAKE: "var(--color-sofia_pink)",
  DEFINE: "var(--color-purple)",
  PLAN: "var(--color-chili-blue)",
  BUILD: "var(--color-working_orange)",
  RELEASE: "var(--color-done-green)",
};

export const HEALTH: Record<Health, { label: string; color: string }> = {
  good: { label: "Good", color: "var(--color-done-green)" },
  watch: { label: "Watch", color: "var(--color-working_orange)" },
  risk: { label: "At risk", color: "var(--color-stuck-red)" },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-02" → "Oct 2" (no timezone drift: parse the parts, not Date). */
export const shortDate = (iso?: string) => {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

/** "2026-10-15" → "Thursday, 15 October". */
export const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

export const formatHours = (h: number) => (Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`);

/** ISO datetime → relative label against the fixed demo "now". */
export const relativeTime = (iso: string, nowIso = now()) => {
  const mins = Math.round((Date.parse(nowIso) - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / (60 * 24))}d`;
};
