"use client";

// Company sign-up (you → your company → your team) and joining by invite link.
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Info, LogOut } from "lucide-react";
import { domainOf, EMAIL_RE, isFreeMail, MIN_PASSWORD, slugError, slugify } from "@/data/commands";
import { passwordStrength } from "@/data/passwords";
import { useAuth, type CreatedInvite, type InviteView } from "@/data/StoreProvider";
import { InviteForm, InviteLinks } from "@/features/people/Invites";
import { PANEL_LABEL } from "@/features/shell/AppShell";
import { AuthField, AuthShell, PasswordField, Steps } from "./AuthShell";

const STEPS = ["Your account", "Your company", "Your team"];

type Errors = Partial<Record<"name" | "email" | "password" | "company" | "slug" | "form", string | null>>;
const hasErrors = (e: Errors) => Object.values(e).some(Boolean);

export const nameError = (v: string) => (v.trim() ? null : "Enter your name");
const emailError = (v: string) => (EMAIL_RE.test(v.trim()) ? null : "Enter a valid email address");
export const newPasswordError = (pw: string) =>
  pw.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters`
    : passwordStrength(pw).score < 1 ? "That password is too easy to guess — try a short sentence" : null;

/** Moves focus to the step's heading when the step changes, so screen readers announce it. */
function useStepFocus(step: number) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    ref.current?.focus();
  }, [step]);
  return ref;
}

/** The first focusable invalid field gets focus after a failed submit. */
const focusFirstInvalid = (form: HTMLFormElement) => (form.querySelector("[aria-invalid='true']") as HTMLElement | null)?.focus();

export function SignUp() {
  const router = useRouter();
  const auth = useAuth();
  const uid = useId();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [home, setHome] = useState("/admin");
  const [invited, setInvited] = useState<CreatedInvite[] | null>(null);
  const [checked, setChecked] = useState<{ slug: string; problem: string | null } | null>(null);
  const heading = useStepFocus(step);

  const shownSlug = slugEdited ? slug : slugify(company);
  const formatProblem = shownSlug ? slugError(shownSlug, () => false) : null;
  const slugChecked = checked?.slug === shownSlug;
  const slugProblem = formatProblem ?? (slugChecked ? checked.problem : null);
  // Ask the server whether the short name is free, once typing pauses.
  const { checkSlug } = auth;
  useEffect(() => {
    if (!shownSlug || formatProblem) return;
    let alive = true;
    const timer = setTimeout(() => { void checkSlug(shownSlug).then((problem) => { if (alive) setChecked({ slug: shownSlug, problem }); }); }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [shownSlug, formatProblem, checkSlug]);
  const domain = domainOf(email);
  const clear = (k: keyof Errors) => errors[k] && setErrors((e) => ({ ...e, [k]: null, form: null }));

  const toCompany = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs: Errors = { name: nameError(name), email: emailError(email), password: newPasswordError(password) };
    setErrors(errs);
    if (hasErrors(errs)) { const form = e.currentTarget; requestAnimationFrame(() => focusFirstInvalid(form)); return; }
    setStep(1);
  };

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const errs: Errors = { company: company.trim() ? null : "Enter your company's name", slug: shownSlug ? slugProblem : "Choose a short name" };
    setErrors(errs);
    if (hasErrors(errs)) { requestAnimationFrame(() => focusFirstInvalid(form)); return; }
    setBusy(true);
    const res = await auth.createCompany({ name, email, password, company, slug: shownSlug });
    setBusy(false);
    if (!res.ok) { setErrors({ form: res.error }); return; }
    setHome(res.home);
    setStep(2);
  };

  return (
    <AuthShell company={step > 0 ? company : undefined} aside={step < 2 && <>Already have an account? <Link href="/signin">Sign in</Link></>}>
      <div className="auth-panel">
        <Steps steps={STEPS} current={step} />

        {step === 0 && (
          <form className="auth-form" onSubmit={toCompany} noValidate>
            <div className="auth-heading">
              <h1 ref={heading} tabIndex={-1} className="auth-title">Create your company on 1Fold</h1>
              <p className="auth-sub">You&apos;ll be its first admin. Boards, tickets and your team — set up in a minute.</p>
            </div>
            <AuthField id={`${uid}-name`} label="Full name" error={errors.name}>
              <span className="auth-input">
                <input id={`${uid}-name`} value={name} autoComplete="name" autoFocus placeholder="Ayla Khan"
                  aria-invalid={!!errors.name || undefined} aria-describedby={`${uid}-name-msg`}
                  onChange={(e) => { setName(e.target.value); clear("name"); }} />
              </span>
            </AuthField>
            <AuthField id={`${uid}-email`} label="Work email" error={errors.email} hint="Use your work email — teammates with the same domain can join.">
              <span className="auth-input">
                <input id={`${uid}-email`} type="email" inputMode="email" value={email} autoComplete="email" spellCheck={false} placeholder="ayla@acme.io"
                  aria-invalid={!!errors.email || undefined} aria-describedby={`${uid}-email-msg`}
                  onChange={(e) => { setEmail(e.target.value); clear("email"); }} />
              </span>
            </AuthField>
            <PasswordField id={`${uid}-password`} value={password} error={errors.password} onChange={(v) => { setPassword(v); clear("password"); }} />
            <button type="submit" className="btn btn-primary btn-lg auth-submit">Continue <ArrowRight aria-hidden /></button>
          </form>
        )}

        {step === 1 && (
          <form className="auth-form" onSubmit={create} noValidate aria-busy={busy}>
            <div className="auth-heading">
              <h1 ref={heading} tabIndex={-1} className="auth-title">Name your company</h1>
              <p className="auth-sub">This is what your team sees when they sign in.</p>
            </div>
            <AuthField id={`${uid}-company`} label="Company name" error={errors.company}>
              <span className="auth-input">
                <input id={`${uid}-company`} value={company} autoComplete="organization" autoFocus placeholder="Acme Labs"
                  aria-invalid={!!errors.company || undefined} aria-describedby={`${uid}-company-msg`}
                  onChange={(e) => { setCompany(e.target.value); clear("company"); clear("slug"); }} />
              </span>
            </AuthField>
            <AuthField
              id={`${uid}-slug`} label="Short name" error={errors.slug ?? (shownSlug && slugProblem ? slugProblem : null)}
              hint={!shownSlug ? "Lowercase letters, numbers and dashes. Tells your company apart if you're in more than one."
                : slugChecked ? <><Check aria-hidden className="auth-ok" /> <strong>{shownSlug}</strong> is free</> : "Checking…"}
            >
              <span className="auth-input has-prefix">
                <span className="auth-prefix" aria-hidden>1fold /</span>
                <input id={`${uid}-slug`} value={shownSlug} spellCheck={false} autoCapitalize="off" maxLength={32} placeholder="acme-labs"
                  aria-invalid={!!(errors.slug || (shownSlug && slugProblem)) || undefined} aria-describedby={`${uid}-slug-msg`}
                  onChange={(e) => { setSlugEdited(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); clear("slug"); }} />
              </span>
            </AuthField>
            <p className="auth-note">
              <Info aria-hidden />
              {domain && !isFreeMail(domain)
                ? <span>Only <strong>@{domain}</strong> emails can join by invite. Admins can change this in Settings.</span>
                : <span>You signed up with a personal email, so invites aren&apos;t limited to one domain.</span>}
            </p>
            {errors.form && <p className="auth-error auth-form-error" role="alert">{errors.form}</p>}
            <div className="auth-actions">
              <button type="button" className="btn btn-tertiary btn-lg" onClick={() => { setErrors({}); setStep(0); }} disabled={busy}>
                <ArrowLeft aria-hidden /> Back
              </button>
              <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={busy}>
                {busy ? <><span className="auth-spinner" aria-hidden /> Creating your company…</> : <>Create company <ArrowRight aria-hidden /></>}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="auth-form">
            <div className="auth-heading">
              <h1 ref={heading} tabIndex={-1} className="auth-title">{invited ? "Send your invites" : "Invite your team"}</h1>
              <p className="auth-sub">
                {invited ? "Copy each link and send it — they pick their own password." : `${company.trim()} is ready. Add the people you work with, or do it later from People.`}
              </p>
            </div>
            {invited ? (
              <>
                <InviteLinks invites={invited} />
                <button type="button" className="btn btn-primary btn-lg auth-submit" onClick={() => router.replace(home)}>
                  Go to {company.trim()} <ArrowRight aria-hidden />
                </button>
              </>
            ) : (
              <InviteForm onInvited={setInvited} onCancel={() => router.replace(home)} cancelLabel="Skip for now" />
            )}
          </div>
        )}
      </div>
    </AuthShell>
  );
}

/** /invite/<token>: the invitee picks a name and password and lands in their panel. */
export function AcceptInvite({ token }: { token: string }) {
  const auth = useAuth();
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<InviteView | null>(null);
  const { lookupInvite } = auth;
  useEffect(() => {
    let alive = true;
    void lookupInvite(token).then((view) => { if (alive) setFound(view); });
    return () => { alive = false; };
  }, [lookupInvite, token]);
  const hasLogin = !!found?.hasLogin; // the email already has a 1Fold login: confirm with that password

  const join = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const errs: Errors = { name: nameError(name), password: hasLogin ? (password ? null : "Enter your password") : newPasswordError(password) };
    setErrors(errs);
    if (hasErrors(errs)) { requestAnimationFrame(() => focusFirstInvalid(form)); return; }
    setBusy(true);
    const res = await auth.acceptInvite(token, name, password);
    setBusy(false);
    if (!res.ok) { setErrors({ form: res.error }); return; }
    router.replace(res.home);
  };

  let body: React.ReactNode;
  if (!found) {
    body = <div className="auth-loading" aria-busy="true"><span className="auth-spinner" /> Checking your invite…</div>;
  } else if (found.problem || !found.email || !found.panel) {
    body = (
      <div className="auth-form">
        <div className="auth-heading">
          <h1 className="auth-title">This invite can&apos;t be used</h1>
          <p className="auth-sub">{found.problem ?? "This invite link isn't valid."} Check you copied the whole link, or ask whoever invited you for a new one.</p>
        </div>
        <Link href="/signin" className="btn btn-primary btn-lg auth-submit">Go to sign in</Link>
      </div>
    );
  } else if (auth.signedIn) {
    body = (
      <div className="auth-form">
        <div className="auth-heading">
          <h1 className="auth-title">You&apos;re already signed in</h1>
          <p className="auth-sub">To join {found.orgName} as {found.email}, sign out first, then open this invite link again.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-lg auth-submit" onClick={auth.signOut}><LogOut aria-hidden /> Sign out</button>
      </div>
    );
  } else {
    body = (
      <form className="auth-form" onSubmit={join} noValidate aria-busy={busy}>
        <div className="auth-heading">
          <p className="auth-kicker-inline">{found.inviterName ? `${found.inviterName} invited you` : "You're invited"}</p>
          <h1 className="auth-title">Join {found.orgName}</h1>
          <p className="auth-sub">
            You&apos;ll join as <strong>{PANEL_LABEL[found.panel]}</strong> · {found.role}.{" "}
            {hasLogin ? "This email already has a 1Fold login — use its password." : "Choose your name and a password."}
          </p>
        </div>
        <div className="auth-field">
          <span className="auth-label">Email</span>
          <span className="auth-input is-readonly"><span className="auth-static">{found.email}</span></span>
        </div>
        <AuthField id={`${uid}-name`} label="Full name" error={errors.name}>
          <span className="auth-input">
            <input id={`${uid}-name`} value={name} autoComplete="name" autoFocus
              aria-invalid={!!errors.name || undefined} aria-describedby={`${uid}-name-msg`}
              onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: null })); }} />
          </span>
        </AuthField>
        <PasswordField id={`${uid}-password`} value={password} error={errors.password} meter={!hasLogin}
          label={hasLogin ? "Your 1Fold password" : "Password"} autoComplete={hasLogin ? "current-password" : "new-password"}
          onChange={(v) => { setPassword(v); setErrors((x) => ({ ...x, password: null })); }} />
        {errors.form && <p className="auth-error auth-form-error" role="alert">{errors.form}</p>}
        <button type="submit" className="btn btn-primary btn-lg auth-submit" disabled={busy}>
          {busy ? <><span className="auth-spinner" aria-hidden /> Joining…</> : <>Join {found.orgName} <ArrowRight aria-hidden /></>}
        </button>
      </form>
    );
  }

  return (
    <AuthShell company={found?.orgName} aside={<>Have an account? <Link href="/signin">Sign in</Link></>}>
      <div className="auth-panel">{body}</div>
    </AuthShell>
  );
}
