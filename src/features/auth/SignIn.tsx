"use client";

// Sign in (with "which company?" when one email is in several), the demo company, and "forgot password".
import Link from "next/link";
import { useId, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Building2, Code2, KeyRound, LayoutDashboard, Users } from "lucide-react";
import { EMAIL_RE } from "@/domain/commands";
import { panelFromSlug, safeNext } from "@/data/session";
import { useAuth } from "@/data/StoreProvider";
import type { Panel } from "@/domain/types";
import { AuthField, AuthShell, PasswordField } from "./AuthShell";

const DEMO: { panel: Panel; title: string; text: string; icon: React.ReactNode }[] = [
  { panel: "admin", title: "Admin", text: "The whole company: people, products, settings", icon: <LayoutDashboard aria-hidden /> },
  { panel: "manager", title: "Manager", text: "Runs products, plans the board, approves work", icon: <Users aria-hidden /> },
  { panel: "developer", title: "Developer", text: "My Work and the boards they're on", icon: <Code2 aria-hidden /> },
];

export function SignIn() {
  const auth = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const uid = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"signin" | Panel | null>(null);
  const [companies, setCompanies] = useState<{ slug: string; name: string }[] | null>(null);

  // ?next= only survives inside your own panel (no open redirects).
  const go = (home: string) => {
    const panel = panelFromSlug(home.slice(1));
    router.replace(panel ? safeNext(next, panel) : home);
  };

  const signIn = async (slug?: string) => {
    if (!EMAIL_RE.test(email.trim()) || !password) { setError("Enter your email and password"); return; }
    setBusy("signin");
    setError(null);
    const res = await auth.signIn(email, password, slug);
    if (res.ok === true) { go(res.home); return; } // stay busy while the next page loads
    setBusy(null);
    if (res.ok === "choose") setCompanies(res.companies);
    else setError(res.error);
  };

  const demo = async (panel: Panel) => {
    setBusy(panel);
    go(await auth.startDemo(panel));
  };

  return (
    <AuthShell aside={<>New to 1Fold? <Link href="/signup">Create your company</Link></>}>
      <div className="auth-panel">
        {companies ? (
          <div className="auth-form">
            <div className="auth-heading">
              <h1 className="auth-title">Which company?</h1>
              <p className="auth-sub">{email.trim()} belongs to more than one.</p>
            </div>
            <ul className="auth-choices">
              {companies.map((c) => (
                <li key={c.slug}>
                  <button type="button" className="auth-choice" disabled={!!busy} onClick={() => signIn(c.slug)}>
                    <span className="auth-choice-icon"><Building2 aria-hidden /></span>
                    <span className="auth-choice-text"><strong>{c.name}</strong><span>{c.slug}</span></span>
                    <ArrowRight aria-hidden className="auth-choice-go" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-tertiary" onClick={() => { setCompanies(null); setPassword(""); }}>Use a different account</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); void signIn(); }} noValidate aria-busy={busy === "signin"}>
            <div className="auth-heading">
              <h1 className="auth-title">Welcome back</h1>
              <p className="auth-sub">Sign in to your company on 1Fold.</p>
            </div>
            <AuthField id={`${uid}-email`} label="Email">
              <span className="auth-input">
                <input id={`${uid}-email`} type="email" inputMode="email" value={email} autoComplete="username" spellCheck={false} autoFocus
                  aria-invalid={!!error || undefined} onChange={(e) => { setEmail(e.target.value); setError(null); }} />
              </span>
            </AuthField>
            <PasswordField id={`${uid}-password`} value={password} meter={false} autoComplete="current-password"
              onChange={(v) => { setPassword(v); setError(null); }} />
            <Link href="/forgot" className="auth-forgot">Forgot password?</Link>
            {error && <p className="auth-error auth-form-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={!!busy}>
              {busy === "signin" ? <><span className="auth-spinner" aria-hidden /> Signing in…</> : <>Sign in <ArrowRight aria-hidden /></>}
            </button>
          </form>
        )}

        <section className="auth-demo" id="demo" aria-labelledby={`${uid}-demo`}>
          <div className="auth-divider"><span>or</span></div>
          <h2 id={`${uid}-demo`} className="auth-demo-title">Explore the demo company</h2>
          <p className="auth-sub">TensorFold — sample products, tickets and a team. Pick a role; changes stay in this browser.</p>
          <ul className="auth-demo-grid">
            {DEMO.map((d) => (
              <li key={d.panel}>
                <button type="button" className="auth-demo-card" data-panel={d.panel} disabled={!!busy} aria-busy={busy === d.panel} onClick={() => demo(d.panel)}>
                  <span className="auth-demo-icon">{busy === d.panel ? <span className="auth-spinner" /> : d.icon}</span>
                  <strong>{d.title}</strong>
                  <span>{d.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AuthShell>
  );
}

/** No email service yet, so a reset is done by an admin (People → Edit → New password). Says so plainly. */
export function Forgot() {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  return (
    <AuthShell aside={<>Remembered it? <Link href="/signin">Sign in</Link></>}>
      <div className="auth-panel">
        {sent ? (
          <div className="auth-form">
            <span className="auth-badge-icon"><KeyRound aria-hidden /></span>
            <div className="auth-heading">
              <h1 className="auth-title">Ask your admin for a new password</h1>
              <p className="auth-sub">
                Self-serve reset emails are on the way. For now, an admin of your company can set a new password for
                <strong> {email.trim()}</strong> from <strong>People → Edit</strong>, and send it to you.
              </p>
            </div>
            <Link href="/signin" className="btn btn-primary btn-lg auth-submit">Back to sign in</Link>
          </div>
        ) : (
          <form className="auth-form" noValidate onSubmit={(e) => {
            e.preventDefault();
            if (!EMAIL_RE.test(email.trim())) { setError("Enter a valid email address"); return; }
            setSent(true);
          }}>
            <div className="auth-heading">
              <h1 className="auth-title">Forgot your password?</h1>
              <p className="auth-sub">Enter the email you sign in with.</p>
            </div>
            <AuthField id={`${uid}-email`} label="Email" error={error}>
              <span className="auth-input">
                <input id={`${uid}-email`} type="email" inputMode="email" value={email} autoComplete="username" spellCheck={false} autoFocus
                  aria-invalid={!!error || undefined} aria-describedby={`${uid}-email-msg`}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }} />
              </span>
            </AuthField>
            <button type="submit" className="btn btn-primary btn-lg auth-submit">Continue <ArrowRight aria-hidden /></button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
