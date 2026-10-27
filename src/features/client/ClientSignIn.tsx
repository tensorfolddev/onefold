"use client";

// Client sign-in: no password — they ask for a link by email, and the link's page has one button, Continue (a POST,
// so an email scanner opening the link can't use it up).
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, MailCheck } from "lucide-react";
import { api, message } from "@/data/api";
import { EMAIL_RE } from "@/data/commands";
import { AuthField, AuthShell } from "@/features/auth/AuthShell";

const TEAM_LINK = <>On the team? <Link href="/signin">Sign in here</Link></>;

/** /c/signin — "Email me a link". */
export function ClientSignIn() {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!EMAIL_RE.test(email.trim())) { setError("Enter your email address"); return; }
    setBusy(true);
    try { await api("/api/client/link", { email }); setSent(true); } catch (e) { setError(message(e)); }
    setBusy(false);
  };
  return (
    <AuthShell aside={TEAM_LINK}>
      <div className="auth-panel">
        {sent ? (
          <div className="auth-form">
            <div className="auth-heading">
              <MailCheck aria-hidden className="client-signin-icon" />
              <h1 className="auth-title">Check your inbox</h1>
              <p className="auth-sub">If {email.trim()} is on a project, a sign-in link is on its way. It works once, for 30 minutes.</p>
            </div>
            <button type="button" className="btn btn-tertiary" onClick={() => setSent(false)}>Use a different email</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate aria-busy={busy}>
            <div className="auth-heading">
              <h1 className="auth-title">Follow your project</h1>
              <p className="auth-sub">No password needed — we&apos;ll email you a link that signs you in.</p>
            </div>
            <AuthField id={`${uid}-email`} label="Your email" error={error}>
              <span className="auth-input">
                <input id={`${uid}-email`} type="email" inputMode="email" value={email} autoComplete="email" spellCheck={false} autoFocus
                  aria-invalid={!!error || undefined} onChange={(e) => { setEmail(e.target.value); setError(null); }} />
              </span>
            </AuthField>
            <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={busy}>
              {busy ? <><span className="auth-spinner" aria-hidden /> Sending…</> : <>Email me a link <ArrowRight aria-hidden /></>}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

/** /c/link/<token> (an emailed link) or /c/l/<code> (a client's own): which company it opens, and Continue. */
export function ClientLink({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ problem: string | null; company?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ problem: string | null; company?: string }>("/api/client/check", { token })
      .then(setState, (e: unknown) => setState({ problem: message(e) }));
  }, [token]);
  const go = async () => {
    setBusy(true);
    try {
      const { home } = await api<{ home: string }>("/api/client/signin", { token });
      router.replace(home); // stay busy while it loads
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  };
  return (
    <AuthShell aside={TEAM_LINK}>
      <div className="auth-panel">
        <div className="auth-form" aria-busy={!state}>
          {!state ? <div className="app-loading" aria-busy="true" /> : state.problem ? (
            <>
              <div className="auth-heading">
                <h1 className="auth-title">This link can&apos;t be used</h1>
                <p className="auth-sub">{state.problem}</p>
              </div>
              <Link href="/c/signin" className="btn btn-primary btn-lg auth-submit">Get a new link</Link>
            </>
          ) : (
            <>
              <div className="auth-heading">
                <h1 className="auth-title">{state.company}</h1>
                <p className="auth-sub">Your projects with {state.company} are ready.</p>
              </div>
              {error && <p className="auth-error auth-form-error" role="alert">{error}</p>}
              <button type="button" className="btn btn-primary btn-lg auth-submit" disabled={busy} onClick={() => void go()} autoFocus>
                {busy ? <><span className="auth-spinner" aria-hidden /> Opening…</> : <>Continue <ArrowRight aria-hidden /></>}
              </button>
            </>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
