"use client";

// The vault page (from the first 1Fold): set up (a master password, then the recovery code to keep), unlock, and the
// passwords themselves (VaultBrowser). Forgot the master password? An emailed link, then the recovery code and a new
// one — nobody else is involved, and nobody else can open it. Lost the code too? Start over.
import { useEffect, useState } from "react";
import { Check, Copy, Download, Eye, EyeOff, KeyRound, Lock, LockKeyhole, MailCheck, ShieldCheck, X } from "lucide-react";
import { api, message } from "@/data/api";
import { useMe } from "@/data/StoreProvider";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { RESET_PHRASE } from "@/domain/commands/vault";
import { formatRecoveryCode, passwordStrength, WrongPasswordError, WrongRecoveryCodeError } from "./crypto";
import { StrengthBar, VaultBrowser } from "./VaultBrowser";
import { useVault } from "./VaultProvider";

/** Password box with a show/hide eye. */
function SecretInput({ label, value, onChange, autoFocus, autoComplete, state }: {
  label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean; autoComplete: string;
  state?: "ok" | "bad";
}) {
  const [show, setShow] = useState(false);
  return (
    <label className="vault-field">
      <span>{label}</span>
      <span className={`vault-secret${state ? ` is-${state}` : ""}`}>
        <input type={show ? "text" : "password"} value={value} autoFocus={autoFocus} autoComplete={autoComplete}
          spellCheck={false} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        {state === "ok" && <Check className="vault-secret-state" aria-label="Matches" />}
        {state === "bad" && <X className="vault-secret-state" aria-label="Doesn't match" />}
        <button type="button" className="vault-eye" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}
          onClick={() => setShow((v) => !v)}>
          {show ? <EyeOff /> : <Eye />}
        </button>
      </span>
    </label>
  );
}

/** A new master password: strong enough, typed twice. Null when it's fine; else what's wrong. */
const newPasswordProblem = (pw: string, again: string) =>
  passwordStrength(pw) < 3 ? "Make it stronger — at least 12 characters with letters, numbers and symbols"
    : pw !== again ? "The two passwords don't match" : null;

function Art({ kind }: { kind: "setup" | "unlock" | "recover" }) {
  return (
    <aside className="vault-setup-art">
      <span className="vault-setup-shield" aria-hidden>{kind === "unlock" ? <LockKeyhole /> : <ShieldCheck />}</span>
      <h2>{kind === "setup" ? "Your passwords, sealed." : kind === "unlock" ? "Welcome back." : "Back in, with your code."}</h2>
      <ul>
        <li><Lock aria-hidden /><span><strong>Encrypted on this device</strong>before anything is saved</span></li>
        <li><EyeOff aria-hidden /><span><strong>Nobody else can read it</strong>not admins, not the server, not us</span></li>
        <li><KeyRound aria-hidden /><span><strong>Only you hold the keys</strong>your master password, and your recovery code</span></li>
      </ul>
    </aside>
  );
}

/** Not set up → set up; locked → unlock (and "forgot it?"). */
function Gate({ onRecoveryCode }: { onRecoveryCode: (code: string) => void }) {
  const { status, setup, unlock, forgot, reset } = useVault();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [asked, setAsked] = useState(false); // the reset link is on its way
  const [resetting, setResetting] = useState(false);
  const isSetup = status === "none";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (isSetup) {
      const problem = newPasswordProblem(pw, confirm);
      if (problem) return setError(problem);
    }
    setBusy(true);
    try {
      if (isSetup) { const code = await setup(pw); if (code) onRecoveryCode(code); } else await unlock(pw);
    } catch (err) {
      setError(err instanceof WrongPasswordError ? "Wrong master password" : "Something went wrong — try again");
      setPw(""); setConfirm("");
    } finally {
      setBusy(false);
    }
  };
  const askReset = async () => {
    setError("");
    try { await forgot(); setAsked(true); } catch (err) { setError(message(err)); }
  };

  return (
    <div className="vault-gate">
      <div className="vault-setup">
        <Art kind={isSetup ? "setup" : "unlock"} />
        <form className="vault-form" onSubmit={submit} noValidate>
          <h1 className="vault-gate-title">{isSetup ? "Create your master password" : "Unlock your vault"}</h1>
          <p className="muted">{isSetup ? "This one password unlocks your vault. Make it long and memorable — a phrase works well. Next, you'll get a recovery code to keep." : "Enter your master password. It never leaves this browser."}</p>
          <SecretInput label="Master password" value={pw} onChange={setPw} autoFocus autoComplete={isSetup ? "new-password" : "current-password"} />
          {isSetup && (
            <>
              <StrengthBar value={pw} />
              <SecretInput label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password"
                state={confirm ? (confirm === pw ? "ok" : "bad") : undefined} />
            </>
          )}
          {error && <p className="vault-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg vault-gate-submit" disabled={busy || !pw}>
            {busy ? (isSetup ? "Securing your vault…" : "Unlocking…") : isSetup ? "Create my vault" : "Unlock"}
          </button>
          {!isSetup && (asked ? (
            <p className="vault-sent" role="status"><MailCheck aria-hidden /> We emailed you a link. Open it, then enter your recovery code and a new master password.</p>
          ) : (
            <button type="button" className="btn btn-tertiary vault-forgot" onClick={() => void askReset()}>Forgot your master password? Email me a reset link</button>
          ))}
          {!isSetup && <button type="button" className="btn btn-tertiary vault-forgot is-quiet" onClick={() => setResetting(true)}>Lost your recovery code too? Reset my vault</button>}
          <p className="vault-e2e"><ShieldCheck aria-hidden /> End-to-end encrypted · AES-256 · keys never leave your browser</p>
        </form>
      </div>
      {resetting && <ResetVault onCancel={() => setResetting(false)} onReset={(phrase) => { setResetting(false); reset(phrase); }} />}
    </div>
  );
}

/** Lost both the master password and the recovery code: the vault goes for good — so it takes ticking and typing it out. */
function ResetVault({ onCancel, onReset }: { onCancel: () => void; onReset: (phrase: string) => void }) {
  const [understood, setUnderstood] = useState(false);
  const [typed, setTyped] = useState("");
  const ok = understood && typed.trim().toLowerCase() === RESET_PHRASE;
  return (
    <ConfirmDialog
      title="Delete your vault for good?" confirmLabel="Delete my vault" confirmDisabled={!ok}
      onCancel={onCancel} onConfirm={() => { if (ok) onReset(typed); }}
      body={(
        <div className="vault-reset">
          <p>Only do this if you&apos;ve lost <strong>both</strong> your master password and your recovery code. Still have the code? Use <strong>Forgot your master password?</strong> instead — it keeps everything.</p>
          <ul className="vault-reset-list">
            <li>Every password in your Personal vault is deleted. Nobody can bring it back — not an admin, not 1Fold.</li>
            <li>Passwords others shared with you are gone from your vault until they share them again.</li>
            <li>Passwords you shared stay with the people you shared them with.</li>
          </ul>
          <label className="vault-check">
            <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
            <span>I understand my passwords will be gone for good.</span>
          </label>
          <label className="vault-field">
            <span>Type <strong>{RESET_PHRASE}</strong> to confirm</span>
            <span className="vault-secret"><input value={typed} autoComplete="off" spellCheck={false} onChange={(e) => setTyped(e.target.value)} aria-label={`Type ${RESET_PHRASE} to confirm`} /></span>
          </label>
        </div>
      )}
    />
  );
}

/** Straight after setup: the recovery code, once — copied, downloaded or written down — before the vault opens. */
function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const { me, db } = useMe();
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(code).then(() => setCopied(true), () => {});
  const download = () => {
    const text = `1Fold vault recovery code\n\n${code}\n\nFor: ${me.name} (${me.email}) at ${db.org.name}\n\nKeep it somewhere safe and private — printed, or in a password manager you trust.\nIf you forget your master password, open "Forgot your master password?" in the vault, follow the emailed link, and enter this code.\nNobody else can recover your vault for you — not an admin, not 1Fold.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = "1fold-vault-recovery-code.txt"; a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };
  return (
    <div className="vault-gate">
      <div className="vault-setup vault-code-step">
        <Art kind="setup" />
        <div className="vault-form">
          <h1 className="vault-gate-title">Save your recovery code</h1>
          <p className="muted">If you ever forget your master password, this code — and only this code — gets your vault back. It&apos;s shown this once and never sent anywhere.</p>
          <p className="vault-code" aria-label="Your recovery code">{formatRecoveryCode(code)}</p>
          <div className="vault-code-actions">
            <button type="button" className="btn btn-secondary" onClick={download}><Download aria-hidden /> Download</button>
            <button type="button" className="btn btn-secondary" onClick={() => void copy()}>{copied ? <><Check aria-hidden /> Copied</> : <><Copy aria-hidden /> Copy</>}</button>
          </div>
          <label className="vault-check">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
            <span>I&apos;ve saved my recovery code somewhere safe. Without it <strong>and</strong> my master password, my vault can&apos;t be opened — not even by an admin.</span>
          </label>
          <button type="button" className="btn btn-primary btn-lg vault-gate-submit" disabled={!saved} onClick={onDone}>Open my vault</button>
        </div>
      </div>
    </div>
  );
}

/** From the emailed link: the recovery code and a new master password. */
function Recover({ token, onDone }: { token: string; onDone: () => void }) {
  const { status, recover } = useVault();
  const [problem, setProblem] = useState<string | null | undefined>(undefined); // undefined: still checking the link
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ problem: string | null }>("/api/vault/check", { token }).then((r) => setProblem(r.problem), (e: unknown) => setProblem(message(e)));
  }, [token]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const bad = !code.trim() ? "Enter your recovery code" : newPasswordProblem(pw, confirm);
    if (bad) return setError(bad);
    setBusy(true);
    try {
      await recover(token, code, pw);
      onDone();
    } catch (err) {
      setError(err instanceof WrongRecoveryCodeError ? "That recovery code doesn't open your vault — check it and try again" : message(err));
    } finally {
      setBusy(false);
    }
  };
  if (status === "none") return <p className="vault-error" role="alert">You don&apos;t have a vault yet — set one up from the Vault page.</p>;
  return (
    <div className="vault-gate">
      <div className="vault-setup">
        <Art kind="recover" />
        <form className="vault-form" onSubmit={submit} noValidate>
          <h1 className="vault-gate-title">Choose a new master password</h1>
          {problem === undefined ? <p className="muted" aria-busy="true">Checking your link…</p> : problem ? <p className="vault-error" role="alert">{problem}</p> : (
            <>
              <p className="muted">Your recovery code opens your vault here, in this browser; then the new master password locks it again. Everything inside stays as it is.</p>
              <label className="vault-field">
                <span>Recovery code</span>
                <span className="vault-secret"><input value={code} autoFocus autoComplete="off" spellCheck={false} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" onChange={(e) => setCode(e.target.value)} aria-label="Recovery code" /></span>
              </label>
              <SecretInput label="New master password" value={pw} onChange={setPw} autoComplete="new-password" />
              <StrengthBar value={pw} />
              <SecretInput label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password" state={confirm ? (confirm === pw ? "ok" : "bad") : undefined} />
              {error && <p className="vault-error" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary btn-lg vault-gate-submit" disabled={busy || !code || !pw}>{busy ? "Opening your vault…" : "Set new master password"}</button>
            </>
          )}
          <p className="vault-e2e"><ShieldCheck aria-hidden /> Your code and passwords never leave this browser</p>
        </form>
      </div>
    </div>
  );
}

/** While unlocked: a new master password, knowing the current one. */
function ChangePassword({ onClose }: { onClose: () => void }) {
  const { changePassword } = useVault();
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setError("");
    const bad = newPasswordProblem(pw, confirm);
    if (bad) return setError(bad);
    setBusy(true);
    try { if (await changePassword(current, pw)) onClose(); } catch (err) { setError(err instanceof WrongPasswordError ? "That's not your current master password" : message(err)); }
    setBusy(false);
  };
  return (
    <ConfirmDialog title="Change your master password" confirmLabel={busy ? "Changing…" : "Change it"} tone="primary" confirmDisabled={busy || !current || !pw}
      body={(
        <div className="vault-change">
          <SecretInput label="Current master password" value={current} onChange={setCurrent} autoFocus autoComplete="current-password" />
          <SecretInput label="New master password" value={pw} onChange={setPw} autoComplete="new-password" />
          <StrengthBar value={pw} />
          <SecretInput label="Type it again" value={confirm} onChange={setConfirm} autoComplete="new-password" state={confirm ? (confirm === pw ? "ok" : "bad") : undefined} />
          {error && <p className="vault-error" role="alert">{error}</p>}
        </div>
      )}
      onConfirm={() => void submit()} onCancel={onClose} />
  );
}

function Vault({ recoverToken }: { recoverToken?: string }) {
  const vault = useVault();
  const { href } = useMe();
  const [token, setToken] = useState(recoverToken); // the emailed link, until it's used
  const [code, setCode] = useState<string | null>(null); // the recovery code, straight after setup
  const [changing, setChanging] = useState(false);
  // Back to /vault in place: navigating would remount the provider and drop the key just unlocked.
  const recovered = () => { setToken(undefined); window.history.replaceState(null, "", href("/vault")); };
  const body = code ? <RecoveryCode code={code} onDone={() => setCode(null)} />
    : token ? <Recover token={token} onDone={recovered} /> // the emailed link is checked even when it's already open here
      : vault.status === "unlocked" ? <VaultBrowser />
        : !vault.ready ? <div className="doc-skeleton" aria-busy="true" aria-label="Opening your vault" /> // a kept key may open it
          : <Gate onRecoveryCode={setCode} />;
  return (
    <div className="page vault-page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Vault</h1>
          <p className="page-subtitle"><ShieldCheck aria-hidden className="vault-sub-icon" /> Zero-knowledge · encrypted in your browser · nobody else can read it</p>
        </div>
        <span className="spacer" />
        {vault.status === "unlocked" && !code && (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setChanging(true)}><KeyRound aria-hidden /> Change master password</button>
            <button type="button" className="btn btn-secondary" onClick={vault.lock}><Lock aria-hidden /> Lock</button>
          </>
        )}
      </header>
      {body}
      {changing && <ChangePassword onClose={() => setChanging(false)} />}
    </div>
  );
}

/** /vault, and /vault/recover/<token> (the emailed link). The keys live in the panel shell's VaultProvider. */
export default function VaultPage({ recoverToken }: { recoverToken?: string }) {
  return <Vault recoverToken={recoverToken} />;
}
