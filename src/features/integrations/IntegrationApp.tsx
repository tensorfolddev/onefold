"use client";

// One integration's page, monday-style. Claude and WhatsApp — the same for everyone, admins included: a banner (logo,
// what it is, the button that connects it) and what it does (recipes), how it works and the facts. Team Bot, for
// admins: Set up bot at the top (the QR right there, a fresh one, or cancel) — Connected once it is — then its tabs:
// Members, Daily brief, Templates, Deliveries.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Mail, RefreshCw, Smartphone, Unlink, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { api, message as problemOf } from "@/data/api";
import { useMe } from "@/data/StoreProvider";
import { McpDialog } from "@/features/mcp/McpDialog";
import {
  BriefTab, DeliveriesTab, MembersTab, TemplatesTab, useCompanyWhatsApp, type Company, type CompanyBot,
} from "@/features/whatsapp/CompanyWhatsApp";
import { PairingQr, WhatsAppDialog } from "@/features/whatsapp/WhatsApp";
import { ConfirmDialog } from "@/ui/ConfirmDialog";
import { Tabs } from "@/ui/primitives";
import { appOf, emailLabel, RecipeText, useAppStatuses, useEmailStatus, type App, type AppStatus, type EmailStatus } from "./catalog";

const TEAM_TABS = ["Members", "Daily brief", "Templates", "Deliveries"] as const;
const POLL_MS = 2000; // while the bot is being set up: the QR changes every ~20 s

export function IntegrationApp({ id }: { id: string }) {
  const { panel, href } = useMe();
  const statuses = useAppStatuses();
  const app = appOf(id);
  if (!app || (app.adminOnly && panel !== "admin")) {
    return (
      <div className="page int-app">
        <p className="int-empty">That integration isn&apos;t here.</p>
        <Link href={href("/integrations")} className="btn btn-secondary"><ArrowLeft aria-hidden /> All integrations</Link>
      </div>
    );
  }
  if (app.id === "team-bot") return <TeamBotApp app={app} />;
  if (app.id === "email") return <EmailApp app={app} />;
  return <PersonalApp app={app} status={statuses[app.id]} />;
}

/** The tab in the address (?tab=…), so a tab can be linked to and survives a reload. */
function useTab<T extends string>(tabs: readonly T[]): [T, (t: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const asked = params.get("tab") as T | null;
  const tab = asked && tabs.includes(asked) ? asked : tabs[0];
  return [tab, (t) => router.replace(t === tabs[0] ? "?" : `?tab=${encodeURIComponent(t)}`, { scroll: false })];
}

function Banner({ app, action }: { app: App; action: React.ReactNode }) {
  const { href } = useMe();
  return (
    <header className={`int-app-hero ${app.tile}`}>
      <nav className="int-crumbs" aria-label="Breadcrumb">
        <Link href={href("/integrations")}>Integrations</Link><ChevronRight aria-hidden /><span aria-current="page">{app.name}</span>
      </nav>
      <div className="int-app-head">
        <span className={`int-logo is-lg ${app.tile}`} aria-hidden><app.icon /></span>
        <div className="int-app-title">
          <h1>{app.name}</h1>
          <p className="int-app-by">by 1FOLD · {app.category}{app.adminOnly ? " · admins" : ""}</p>
          <p className="int-app-tagline">{app.tagline}</p>
        </div>
        <div className="int-app-cta">{action}</div>
      </div>
    </header>
  );
}

const Connected = ({ label }: { label: string }) => <span className="int-connected-pill" role="status"><Check aria-hidden /> {label}</span>;

/** What an integration does (as recipes), how it works, and the facts. */
function Overview({ app }: { app: App }) {
  return (
      <div className="int-overview">
        <div className="int-overview-main">
          <section aria-labelledby="int-recipes">
            <h2 id="int-recipes" className="int-h2">What it does</h2>
            <ul className="int-recipes">
              {app.recipes.map((r, i) => (
                <li key={i}><span className={`int-recipe-icon ${app.tile}`} aria-hidden><Zap /></span><span><RecipeText recipe={r} /></span></li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="int-how">
            <h2 id="int-how" className="int-h2">How it works</h2>
            <ol className="int-steps">{app.steps.map((s, i) => <li key={i}><span className="int-step-n" aria-hidden>{i + 1}</span>{s}</li>)}</ol>
          </section>
        </div>
        <aside className="int-about" aria-labelledby="int-about-title">
          <h2 id="int-about-title" className="int-h2">About</h2>
          <p>{app.about}</p>
          <dl>
            <dt>Category</dt><dd>{app.category}</dd>
            <dt>Works with</dt><dd>{app.worksWith}</dd>
            <dt>Who can use it</dt><dd>{app.adminOnly ? "Your company's admins" : "Everyone, for themselves"}</dd>
            <dt>Made by</dt><dd>1FOLD</dd>
          </dl>
        </aside>
      </div>
  );
}

/** Email, for admins: the company's own Resend — set, tested before saving, replaced or removed — and how it works. */
function EmailApp({ app }: { app: App }) {
  const [status, setStatus] = useEmailStatus();
  return (
    <div className="page int-app">
      <Banner app={app} action={status && (status.mode === "own"
        ? <Connected label={emailLabel(status)} />
        : <span className="int-status" role="status"><span className="int-dot" aria-hidden />{emailLabel(status)}</span>)} />
      {status && <ResendSetup key={`${status.mode}:${status.from}:${status.hint}`} status={status} onSaved={setStatus} />}
      <Overview app={app} />
    </div>
  );
}

/** The company's Resend: API key (never shown — only its last 4) and From address. A blank key keeps the saved one. */
function ResendSetup({ status, onSaved }: { status: EmailStatus; onSaved: (s: EmailStatus) => void }) {
  const { toast } = useMe();
  const own = status.mode === "own";
  const [key, setKey] = useState("");
  const [from, setFrom] = useState(own ? status.from : "");
  const [busy, setBusy] = useState<"test" | "save" | "remove" | null>(null);
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null); // Resend's reason, kept on screen (a toast goes too soon)
  const changed = !!key || from.trim() !== (own ? status.from : "");

  const run = async (what: "test" | "save" | "remove", fn: () => Promise<void>) => {
    setBusy(what);
    setProblem(null);
    try { await fn(); } catch (e) { setProblem(problemOf(e)); } finally { setBusy(null); }
  };
  const test = () => run("test", async () => {
    const { to } = await api<{ to: string }>("/api/email/test", { key: key.trim(), from: from.trim() });
    toast(`Test email sent to ${to} — check your inbox`, undefined, "success");
  });
  const save = () => run("save", async () => {
    const { to, ...saved } = await api<EmailStatus & { to: string }>("/api/email/save", { key: key.trim(), from: from.trim() });
    onSaved(saved);
    toast(`Saved — it works: a test email went to ${to}`, undefined, "success");
  });
  const remove = () => run("remove", async () => {
    onSaved(await api<EmailStatus>("/api/email/remove", {}));
    toast("Removed your Resend", undefined, "success");
  });

  return (
    <section className="int-setup" aria-labelledby="int-resend">
      <header className="int-setup-head">
        <div>
          <h2 id="int-resend" className="int-h2">Your Resend</h2>
          <p className="muted">{own
            ? <>Key ending <strong>{status.hint}</strong>. Paste a new one to replace it.</>
            : <>Send from your own address. Get an API key at <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer noopener">resend.com</a>, and verify your domain at <a href="https://resend.com/domains" target="_blank" rel="noreferrer noopener">resend.com/domains</a>.</>}
          </p>
        </div>
        {own && <button type="button" className="btn btn-tertiary is-danger" disabled={!!busy} onClick={() => setRemoving(true)}><Unlink aria-hidden /> Remove</button>}
      </header>
      <form className="admin-form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
        <label className="admin-field">
          <span className="admin-field-label">API key</span>
          <input className="admin-input" type="password" autoComplete="off" spellCheck={false} value={key} maxLength={200}
            placeholder={own ? `re_••••••••${status.hint}` : "re_…"} onChange={(e) => { setKey(e.target.value); setProblem(null); }} />
        </label>
        <label className="admin-field">
          <span className="admin-field-label">From</span>
          <input className="admin-input" type="text" autoComplete="off" value={from} maxLength={200}
            placeholder="Acme <hello@acme.com>" onChange={(e) => { setFrom(e.target.value); setProblem(null); }} />
          <span className="admin-hint muted">On a domain verified in Resend — not gmail.com or another free address</span>
        </label>
        {problem && <p className="admin-error" role="alert">{problem}</p>}
        <div className="admin-form-actions">
          {!own && <span className="muted int-setup-note">Save sends you a test email first, and keeps it only if Resend accepts it</span>}
          <button type="button" className="btn btn-secondary" disabled={!!busy || (!key && status.mode === "off")} onClick={() => void test()}>
            <Mail aria-hidden /> {busy === "test" ? "Sending…" : "Send a test email"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={!!busy || !changed || !from.trim() || (!own && !key)}>
            {busy === "save" ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
      {removing && (
        <ConfirmDialog title="Remove your Resend?" confirmLabel="Remove"
          body={<p>Invites, password resets and email briefs go back to 1FOLD&apos;s email — or, where this server has none, aren&apos;t sent.</p>}
          onCancel={() => setRemoving(false)} onConfirm={() => { setRemoving(false); void remove(); }} />
      )}
    </section>
  );
}

/** Claude and your own WhatsApp — the same panel for everyone: connected from a dialog, explained below. */
function PersonalApp({ app, status }: { app: App; status: AppStatus }) {
  const [open, setOpen] = useState(false);
  const label = app.id === "claude" ? (status.connected ? "Manage tokens" : "Connect Claude") : status.connected ? "Manage" : "Connect WhatsApp";
  return (
    <div className="page int-app">
      <Banner app={app} action={(
        <>
          {status.connected && <Connected label={status.label} />}
          <button type="button" className={`btn btn-lg ${status.connected ? "btn-secondary" : "btn-primary"}`} onClick={() => setOpen(true)}>{label}</button>
        </>
      )} />
      <Overview app={app} />
      {open && (app.id === "claude" ? <McpDialog onClose={() => setOpen(false)} /> : <WhatsAppDialog onClose={() => setOpen(false)} />)}
    </div>
  );
}

/** Team Bot, for admins: the company's own number (set up at the top), then how it talks to the team, a tab each. */
function TeamBotApp({ app }: { app: App }) {
  const { toast } = useMe();
  const [tab, setTab] = useTab(TEAM_TABS);
  const company = useCompanyWhatsApp();
  const [asking, setAsking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const own = company.data?.companyBot ?? null;
  const connected = own?.state === "connected";
  const reconnecting = own?.state === "connecting" && !!own.phone; // paired, briefly down: nothing to set up
  const { reload } = company;
  useEffect(() => { // keep up while it's being set up: the worker takes the request, shows a QR, then connects
    if (!own || connected || own.state === "logged_out") return;
    const t = setInterval(reload, POLL_MS);
    return () => clearInterval(t);
  }, [own, connected, reload]);

  const ask = async (request: "pair" | "logout") => {
    setAsking(true);
    try {
      await api("/api/whatsapp/company-bot", { request });
      reload();
    } catch (e) {
      toast(problemOf(e), undefined, "error");
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="page int-app">
      <Banner app={app} action={connected ? (
        <>
          <Connected label={`Connected · +${own?.phone ?? ""}`} />
          <button type="button" className="btn btn-tertiary" onClick={() => setDisconnecting(true)}><Unlink aria-hidden /> Disconnect</button>
        </>
      ) : reconnecting ? (
        <span className="int-status" role="status"><span className="auth-spinner" aria-hidden /> Reconnecting +{own?.phone}…</span>
      ) : !own && company.data ? (
        <button type="button" className="btn btn-primary btn-lg" disabled={asking} onClick={() => void ask("pair")}><Smartphone aria-hidden /> Set up bot</button>
      ) : null} />

      {own && !connected && !reconnecting && <BotSetup own={own} busy={asking} onRegenerate={() => void ask("pair")} onCancel={() => void ask("logout")} />}

      <Tabs ariaLabel={app.name} active={tab} onSelect={(t) => setTab(t as (typeof TEAM_TABS)[number])}
        items={TEAM_TABS.map((label) => ({ label, ...(label === "Members" && company.data ? { count: company.data.linked.length } : {}) }))} />
      <div className="int-tab-body">
        {company.failed ? <p className="muted">Couldn&apos;t load your company&apos;s WhatsApp. <button type="button" className="btn btn-tertiary" onClick={reload}>Try again</button></p>
          : !company.data ? <div className="doc-skeleton" aria-busy="true" />
          : <TeamTab tab={tab} data={company.data} company={company} />}
      </div>

      {disconnecting && (
        <ConfirmDialog title="Disconnect your team bot?" confirmLabel="Disconnect"
          body={<p>Briefs, alerts and replies go back to coming from 1FOLD&apos;s bot. You can set yours up again any time.</p>}
          onCancel={() => setDisconnecting(false)} onConfirm={() => { setDisconnecting(false); void ask("logout"); }} />
      )}
    </div>
  );
}

function TeamTab({ tab, data, company }: { tab: string; data: Company; company: ReturnType<typeof useCompanyWhatsApp> }) {
  if (tab === "Daily brief") return <BriefTab settings={data.settings} timeZone={data.timeZone} save={company.save} />;
  if (tab === "Templates") return <TemplatesTab settings={data.settings} save={company.save} />;
  if (tab === "Deliveries") return <DeliveriesTab log={data.log} onRefresh={company.reload} />;
  return <MembersTab linked={data.linked} />;
}

/** Setting up the bot: the QR right at the top, how to scan it, a fresh one, or cancel. */
function BotSetup({ own, busy, onRegenerate, onCancel }: { own: CompanyBot; busy: boolean; onRegenerate: () => void; onCancel: () => void }) {
  const waiting = !!own.request || own.state === "connecting" || (own.state === "pairing" && !own.qr);
  const expired = !waiting && !own.qr; // nobody scanned in time (or WhatsApp logged it out): ask for a fresh code
  return (
    <section className="tb-setup" aria-labelledby="tb-setup-title">
      <div className="tb-setup-qr">
        {own.qr && !own.request ? <PairingQr text={own.qr} />
          : <div className="tb-qr-wait">{waiting ? <><span className="auth-spinner" aria-hidden /> Making a code…</> : <>The code expired</>}</div>}
      </div>
      <div className="tb-setup-text">
        <h2 id="tb-setup-title">Set up your team bot</h2>
        <ol className="int-steps">
          <li><span className="int-step-n" aria-hidden>1</span><span>Use a phone with your company&apos;s own number — a dedicated SIM, not someone&apos;s personal phone.</span></li>
          <li><span className="int-step-n" aria-hidden>2</span><span>On it, open WhatsApp → <strong>Settings → Linked devices → Link a device</strong>.</span></li>
          <li><span className="int-step-n" aria-hidden>3</span><span>Scan this code. It refreshes about every 20 seconds — this page keeps up.</span></li>
        </ol>
        {own.state === "logged_out" && <p className="auth-error">WhatsApp logged this number out — scan a fresh code to connect it again.</p>}
        <p className="muted tb-setup-note">Until it&apos;s connected, your team gets messages from 1FOLD&apos;s bot.</p>
        <div className="tb-setup-actions">
          <button type="button" className={`btn ${expired ? "btn-primary" : "btn-secondary"}`} disabled={busy || waiting} onClick={onRegenerate}><RefreshCw aria-hidden /> Regenerate QR</button>
          <button type="button" className="btn btn-tertiary" disabled={busy} onClick={onCancel}>Cancel pairing</button>
        </div>
      </div>
    </section>
  );
}
