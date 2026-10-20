"use client";

// The pages behind emailed links, and the form that sends one: "forgot password" → the reset link → a new password;
// and the "confirm your email" link.
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ArrowRight, CircleAlert, KeyRound, Mail, MailCheck } from "lucide-react";
import { api, ApiError } from "@/data/api";
import { EMAIL_RE } from "@/data/commands";
import { AuthField, AuthShell, PasswordField } from "./AuthShell";
import { newPasswordError } from "./SignUp";

const RESET_MINUTES = 60;
const problemOf = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong — please try again");

function Notice({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="auth-form">
      <span className="auth-badge-icon">{icon}</span>
      <div className="auth-heading">
        <h1 className="auth-title">{title}</h1>
        <p className="auth-sub">{children}</p>
      </div>
      {action}
    </div>
  );
}

const toSignIn = <Link href="/signin" className="btn btn-primary btn-lg auth-submit">Go to sign in</Link>;

/** Asks for the email, then always says the same thing — whether that email has a login stays private. */
export function Forgot() {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email.trim())) { setError("Enter a valid email address"); return; }
    setBusy(true);
    try {
      await api("/api/auth/forgot", { email: email.trim() });
      setSent(true);
    } catch (problem) {
      setError(problemOf(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell aside={<>Remembered it? <Link href="/signin">Sign in</Link></>}>
      <div className="auth-panel">
        {sent ? (
          <Notice icon={<KeyRound aria-hidden />} title="Check your email" action={toSignIn}>
            If <strong>{email.trim()}</strong> has a 1Fold login, we&apos;ve sent it a link to choose a new password. The link
            works once, for {RESET_MINUTES} minutes. Nothing there? Check spam, or ask an admin of your company to set a new
            password from <strong>People → Edit</strong>.
          </Notice>
        ) : (
          <form className="auth-form" noValidate onSubmit={submit} aria-busy={busy}>
            <div className="auth-heading">
              <span className="auth-badge-icon" aria-hidden><KeyRound /></span>
              <h1 className="auth-title">Forgot your password?</h1>
              <p className="auth-sub">Enter the email you sign in with and we&apos;ll email you a link to choose a new one.</p>
            </div>
            <AuthField id={`${uid}-email`} label="Email" error={error}>
              <span className="auth-input">
                <Mail aria-hidden className="auth-input-icon" />
                <input id={`${uid}-email`} type="email" inputMode="email" value={email} autoComplete="username" spellCheck={false} autoFocus
                  aria-invalid={!!error || undefined} aria-describedby={`${uid}-email-msg`}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }} />
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

/** /reset/<token>: checks the link first, then takes the new password. Signs every device out. */
export function ResetPassword({ token }: { token: string }) {
  const uid = useId();
  const [problem, setProblem] = useState<string | null | undefined>(undefined); // undefined = still checking
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    api<{ problem: string | null }>("/api/auth/reset", { token })
      .then((r) => { if (alive) setProblem(r.problem); })
      .catch((e: unknown) => { if (alive) setProblem(problemOf(e)); });
    return () => { alive = false; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = newPasswordError(password);
    if (err) { setError(err); return; }
    setBusy(true);
    try {
      await api("/api/auth/reset", { token, password });
      setDone(true);
    } catch (p) {
      setError(problemOf(p));
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (done) {
    body = (
      <Notice icon={<KeyRound aria-hidden />} title="Password changed" action={toSignIn}>
        Sign in with your new password. For safety, every device that was signed in has been signed out.
      </Notice>
    );
  } else if (problem === undefined) {
    body = <div className="auth-loading" aria-busy="true"><span className="auth-spinner" /> Checking your link…</div>;
  } else if (problem) {
    body = (
      <Notice icon={<CircleAlert aria-hidden />} title="This link can't be used"
        action={<Link href="/forgot" className="btn btn-primary btn-lg auth-submit">Send a new link</Link>}>
        {problem}
      </Notice>
    );
  } else {
    body = (
      <form className="auth-form" noValidate onSubmit={submit} aria-busy={busy}>
        <div className="auth-heading">
          <h1 className="auth-title">Choose a new password</h1>
          <p className="auth-sub">You&apos;ll use it to sign in to every company you&apos;re in on 1Fold.</p>
        </div>
        <PasswordField id={`${uid}-password`} label="New password" value={password} error={error}
          onChange={(v) => { setPassword(v); setError(null); }} />
        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={busy}>
          {busy ? <><span className="auth-spinner" aria-hidden /> Saving…</> : <>Save new password <ArrowRight aria-hidden /></>}
        </button>
      </form>
    );
  }

  return (
    <AuthShell aside={<>Remembered it? <Link href="/signin">Sign in</Link></>}>
      <div className="auth-panel">{body}</div>
    </AuthShell>
  );
}

/** /verify/<token>: confirms the email once the page opens (the page does it, so mail scanners fetching links can't). */
export function VerifyEmail({ token }: { token: string }) {
  const [problem, setProblem] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    api("/api/auth/verify", { token })
      .then(() => { if (alive) setProblem(null); })
      .catch((e: unknown) => { if (alive) setProblem(problemOf(e)); });
    return () => { alive = false; };
  }, [token]);

  const toApp = <Link href="/" className="btn btn-primary btn-lg auth-submit">Go to 1Fold <ArrowRight aria-hidden /></Link>;
  return (
    <AuthShell>
      <div className="auth-panel">
        {problem === undefined ? (
          <div className="auth-loading" aria-busy="true"><span className="auth-spinner" /> Confirming your email…</div>
        ) : problem ? (
          <Notice icon={<CircleAlert aria-hidden />} title="This link can't be used" action={toApp}>
            {problem} Signed in? You can send a new one from the invite screen.
          </Notice>
        ) : (
          <Notice icon={<MailCheck aria-hidden />} title="Email confirmed" action={toApp}>
            Thanks — you can now invite your team.
          </Notice>
        )}
      </div>
    </AuthShell>
  );
}
