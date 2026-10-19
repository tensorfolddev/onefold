"use client";

// One integration's page, monday-style: its banner (logo, what it is, whether it's connected, the button that
// connects it), then Overview (what it does, as recipes; how it works; the facts). The WhatsApp bot adds its number
// (which one, and connecting it); Team WhatsApp adds what admins run: who's linked, deliveries, the brief, reply words
// and messages.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Zap } from "lucide-react";
import { useState } from "react";
import { useMe } from "@/data/StoreProvider";
import { daysText } from "@/domain/whatsapp";
import { McpDialog } from "@/features/mcp/McpDialog";
import {
  BriefTab, ConnectedTab, DeliveriesTab, MessagesTab, useCompanyWhatsApp, WordsTab, type Company,
} from "@/features/whatsapp/CompanyWhatsApp";
import { useWhatsApp, WhatsAppBotSettings, WhatsAppDialog } from "@/features/whatsapp/WhatsApp";
import { Tabs } from "@/ui/primitives";
import { appOf, RecipeText, useAppStatuses, type App, type AppStatus, type Recipe } from "./catalog";

const BOT_TABS = ["Overview", "Number"] as const;
const TEAM_TABS = ["Overview", "Connected", "Deliveries", "Daily brief", "Reply words", "Messages"] as const;

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
  if (app.id === "whatsapp-bot") return <BotApp app={app} status={statuses[app.id]} />;
  if (app.id === "team-whatsapp") return <TeamApp app={app} status={statuses[app.id]} />;
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

function Banner({ app, status, action }: { app: App; status: AppStatus; action: React.ReactNode }) {
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
        <div className="int-app-cta">
          {status.label && <span className={`int-status${status.connected ? " is-on" : ""}`} role="status"><span className="int-dot" aria-hidden />{status.label}</span>}
          {action}
        </div>
      </div>
    </header>
  );
}

function Overview({ app, recipes }: { app: App; recipes?: Recipe[] }) {
  return (
    <div className="int-overview">
      <div className="int-overview-main">
        <section aria-labelledby="int-recipes">
          <h2 id="int-recipes" className="int-h2">What it does</h2>
          <ul className="int-recipes">
            {(recipes ?? app.recipes).map((r, i) => (
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

/** Claude and your own WhatsApp: connected from a dialog, explained on the Overview. */
function PersonalApp({ app, status }: { app: App; status: AppStatus }) {
  const [open, setOpen] = useState(false);
  const label = app.id === "claude" ? (status.connected ? "Manage tokens" : "Connect Claude") : status.connected ? "Manage" : "Connect WhatsApp";
  return (
    <div className="page int-app">
      <Banner app={app} status={status} action={<button type="button" className={`btn ${status.connected ? "btn-secondary" : "btn-primary"} int-cta`} onClick={() => setOpen(true)}>{label}</button>} />
      <Overview app={app} />
      {open && (app.id === "claude" ? <McpDialog onClose={() => setOpen(false)} /> : <WhatsAppDialog onClose={() => setOpen(false)} />)}
    </div>
  );
}

/** The WhatsApp bot, for admins: which number everything comes from, and connecting it. */
function BotApp({ app, status }: { app: App; status: AppStatus }) {
  const [tab, setTab] = useTab(BOT_TABS);
  return (
    <div className="page int-app">
      <Banner app={app} status={status} action={tab === "Number" ? null : <button type="button" className="btn btn-primary int-cta" onClick={() => setTab("Number")}>Connect the bot</button>} />
      <Tabs ariaLabel={app.name} active={tab} onSelect={(t) => setTab(t as (typeof BOT_TABS)[number])} items={BOT_TABS.map((label) => ({ label }))} />
      <div className="int-tab-body">{tab === "Overview" ? <Overview app={app} /> : <BotTab />}</div>
    </div>
  );
}

/** Team WhatsApp, for admins: how the bot talks to the team — a tab each. */
function TeamApp({ app, status }: { app: App; status: AppStatus }) {
  const [tab, setTab] = useTab(TEAM_TABS);
  const company = useCompanyWhatsApp();
  const d = company.data;
  const recipes: Recipe[] | undefined = d ? [
    d.settings.briefOn ? ["Every ", { b: `${daysText(d.settings.briefDays)} at ${d.settings.briefAt}` }, ", send each teammate ", { b: "their pending tasks" }]
      : ["The daily brief is ", { b: "off" }, " — teammates ask for it when they like"],
    ...app.recipes.slice(1),
  ] : undefined;
  return (
    <div className="page int-app">
      <Banner app={app} status={status} action={tab === "Overview" ? <button type="button" className="btn btn-primary int-cta" onClick={() => setTab("Daily brief")}>Set the daily brief</button> : null} />
      <Tabs ariaLabel={app.name} active={tab} onSelect={(t) => setTab(t as (typeof TEAM_TABS)[number])}
        items={TEAM_TABS.map((label) => ({ label, ...(label === "Connected" && d ? { count: d.linked.length } : {}) }))} />
      <div className="int-tab-body">
        {tab === "Overview" ? <Overview app={app} recipes={recipes} />
          : company.failed ? <p className="muted">Couldn&apos;t load your company&apos;s WhatsApp. <button type="button" className="btn btn-tertiary" onClick={company.reload}>Try again</button></p>
          : !d ? <div className="doc-skeleton" aria-busy="true" />
          : <CompanyTab tab={tab} data={d} company={company} />}
      </div>
    </div>
  );
}

function CompanyTab({ tab, data, company }: { tab: string; data: Company; company: ReturnType<typeof useCompanyWhatsApp> }) {
  return (
    <div className="int-panel">
      {tab === "Connected" && <ConnectedTab linked={data.linked} />}
      {tab === "Deliveries" && <DeliveriesTab log={data.log} onRefresh={company.reload} />}
      {tab === "Daily brief" && <BriefTab settings={data.settings} timeZone={data.timeZone} save={company.save} />}
      {tab === "Reply words" && <WordsTab settings={data.settings} save={company.save} />}
      {tab === "Messages" && <MessagesTab settings={data.settings} save={company.save} />}
    </div>
  );
}

/** Which number everything comes from: 1FOLD's bot (a platform admin connects it). */
function BotTab() {
  const { status: wa } = useWhatsApp(30_000);
  const mayPair = !!wa?.bot;
  return (
    <div className="int-panel int-bot">
      <section className="int-bot-option is-current" aria-labelledby="int-bot-main">
        <span className="int-bot-check" aria-hidden><Check /></span>
        <div>
          <h3 id="int-bot-main">1FOLD&apos;s bot</h3>
          <p className="muted">The number your teammates link to and the brief comes from — shared across 1FOLD, run by the 1FOLD team.</p>
          {mayPair && <WhatsAppBotSettings bare />}
        </div>
      </section>
    </div>
  );
}
