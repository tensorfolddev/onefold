"use client";

// The frame every signed-out page shares: the form on the left, a live board on the right that shows what you're setting up.
import Link from "next/link";
import { useId, useState } from "react";
import { Check, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { passwordStrength } from "@/data/passwords";
import { BrandMark } from "@/features/shell/AppShell";
import { EnvBadge } from "@/ui/primitives";

export function AuthShell({ children, aside, company }: {
  children: React.ReactNode;
  /** Top-right link, e.g. "Already have an account? Sign in". */
  aside?: React.ReactNode;
  /** Shown on the preview board as the person types it. */
  company?: string;
}) {
  return (
    <div className="auth">
      <main className="auth-main">
        <header className="auth-top">
          <Link href="/" className="auth-brand" aria-label="1Fold">
            <BrandMark /><span>1Fold</span>
          </Link>
          <EnvBadge />
          <span className="spacer" />
          {aside && <span className="auth-top-aside">{aside}</span>}
        </header>
        <div className="auth-body">{children}</div>
        <footer className="auth-foot">
          © {new Date().getFullYear()} 1Fold · Product &amp; ticket management · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
        </footer>
      </main>
      <BoardPreview company={company} />
    </div>
  );
}

/** Label + control + error/hint, wired for screen readers. */
export function AuthField({ label, error, hint, children, id }: {
  label: string; error?: string | null; hint?: React.ReactNode; children: React.ReactNode; id: string;
}) {
  return (
    <div className="auth-field" data-invalid={!!error || undefined}>
      <label htmlFor={id} className="auth-label">{label}</label>
      {children}
      {error ? <p id={`${id}-msg`} className="auth-error" role="alert">{error}</p>
        : hint ? <p id={`${id}-msg`} className="auth-hint">{hint}</p> : null}
    </div>
  );
}

const STRENGTH_TONE = ["var(--negative-color)", "var(--negative-color)", "var(--color-working_orange)", "var(--color-done-green)", "var(--color-done-green)"];

/** Password with show/hide and a live strength meter (new passwords only). */
export function PasswordField({ id, value, onChange, error, autoComplete = "new-password", meter = true, label = "Password" }: {
  id: string; value: string; onChange: (v: string) => void; error?: string | null;
  autoComplete?: "new-password" | "current-password"; meter?: boolean; label?: string;
}) {
  const [shown, setShown] = useState(false);
  const { score, label: strength } = passwordStrength(value);
  const meterId = useId();
  return (
    <AuthField id={id} label={label} error={error} hint={meter && !value ? "At least 8 characters. A short sentence is easy to remember." : undefined}>
      <span className="auth-input has-action">
        <LockKeyhole aria-hidden className="auth-input-icon" />
        <input
          id={id} type={shown ? "text" : "password"} value={value} autoComplete={autoComplete} spellCheck={false}
          aria-invalid={!!error || undefined} aria-describedby={`${id}-msg${meter && value ? ` ${meterId}` : ""}`}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="auth-input-action" aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} onClick={() => setShown((s) => !s)}>
          {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      </span>
      {meter && value && (
        <div className="auth-strength" id={meterId} aria-live="polite">
          <span className="auth-strength-bars" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className="auth-strength-bar" style={{ background: n <= score ? STRENGTH_TONE[score] : undefined }} />
            ))}
          </span>
          <span className="auth-strength-label">Password strength: <strong>{strength}</strong></span>
        </div>
      )}
    </AuthField>
  );
}

/** "Step 2 of 3" with the step names. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="auth-steps" aria-label={`Step ${current + 1} of ${steps.length}`}>
      {steps.map((s, i) => (
        <li key={s} className="auth-step" data-state={i < current ? "done" : i === current ? "current" : "todo"} aria-current={i === current ? "step" : undefined}>
          <span className="auth-step-dot" aria-hidden>{i < current ? <Check /> : i + 1}</span>
          <span className="auth-step-name">{s}</span>
        </li>
      ))}
    </ol>
  );
}

const COLUMNS = [
  { name: "To do", tone: "var(--tone-todo)", cards: [["Pricing page copy", "var(--tone-todo)"], ["SSO for enterprise", "var(--tone-todo)"]] },
  { name: "In progress", tone: "var(--tone-working)", cards: [["Checkout redesign", "var(--tone-working)"]] },
  { name: "Done", tone: "var(--tone-done)", cards: [["Onboarding emails", "var(--tone-done)"], ["Mobile nav", "var(--tone-done)"]] },
];

/** Decorative: a small board whose top card moves To do → In progress → Done, on a loop (still when motion is reduced). */
function BoardPreview({ company }: { company?: string }) {
  const name = company?.trim() || "Your company";
  return (
    <aside className="auth-aside" aria-hidden>
      <div className="auth-aside-copy">
        <p className="auth-kicker">Built for product teams</p>
        <p className="auth-aside-title">Every product, from intake to release — on one board.</p>
        <ul className="auth-points">
          <li><Check /> Boards, tickets and epics with one clear template</li>
          <li><Check /> Roles for admins, managers and developers</li>
          <li><Check /> Docs, decisions and roadmap next to the work</li>
        </ul>
      </div>
      <BoardMock name={name} />
    </aside>
  );
}

/** The live board: a card moving To do → Working on it → Done (the sign-in side, and the home page). */
export function BoardMock({ name }: { name: string }) {
  return (
    <div className="bp" role="presentation">
      <div className="bp-head">
        <span className="bp-tile">{name[0]?.toUpperCase()}</span>
        <span className="bp-title"><strong>{name}</strong><span>Product board</span></span>
        <span className="bp-avatars"><i style={{ background: "var(--color-purple)" }} /><i style={{ background: "var(--tone-working)" }} /><i style={{ background: "var(--tone-done)" }} /></span>
      </div>
      <div className="bp-board">
        {COLUMNS.map((c) => (
          <div key={c.name} className="bp-col">
            <span className="bp-col-head"><i style={{ background: c.tone }} />{c.name}</span>
            <span className="bp-card bp-slot" />
            {c.cards.map(([title, tone]) => (
              <span key={title} className="bp-card">
                <span className="bp-card-title">{title}</span>
                <span className="bp-card-meta"><i style={{ background: tone }} /><span className="bp-line" /></span>
              </span>
            ))}
          </div>
        ))}
        <span className="bp-mover">
          <span className="bp-card">
            <span className="bp-card-title">Launch v1 board</span>
            <span className="bp-card-meta">
              <span className="bp-pill"><i className="is-todo">To do</i><i className="is-working">Working on it</i><i className="is-done">Done</i></span>
            </span>
          </span>
        </span>
      </div>
      <span className="bp-toast"><Check /> Ticket moved to Done</span>
    </div>
  );
}
