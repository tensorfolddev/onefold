"use client";

// Integrations center, monday-style: a hero with search, categories down the side (with what's connected), and a card
// per integration — its logo, what it does (one of its recipes) and whether it's connected for you. A card opens the
// integration's own page.
import Link from "next/link";
import { ArrowRight, LayoutGrid, Plug, Search, Zap } from "lucide-react";
import { useState } from "react";
import { useMe } from "@/data/StoreProvider";
import { APPS, CATEGORIES, RecipeText, useAppStatuses, type App, type AppStatus, type Category } from "./catalog";

type Filter = "All" | "Connected" | Category;

export function IntegrationsCenter() {
  const { panel, href } = useMe();
  const statuses = useAppStatuses();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const apps = APPS.filter((a) => !a.adminOnly || panel === "admin");
  const query = q.trim().toLowerCase();
  const matches = (a: App) => !query || `${a.name} ${a.tagline} ${a.category}`.toLowerCase().includes(query);
  const inFilter = (a: App) => filter === "All" || (filter === "Connected" ? statuses[a.id].connected : a.category === filter);
  const shown = apps.filter((a) => matches(a) && inFilter(a));
  const connected = apps.filter((a) => statuses[a.id].connected);
  const filters: { id: Filter; count: number }[] = [
    { id: "All", count: apps.length },
    { id: "Connected", count: connected.length },
    ...CATEGORIES.map((c) => ({ id: c, count: apps.filter((a) => a.category === c).length })).filter((c) => c.count > 0),
  ];

  return (
    <div className="int-center">
      <header className="int-hero">
        <div className="int-hero-text">
          <p className="int-eyebrow"><Plug aria-hidden /> Integrations center</p>
          <h1>Your work, wherever you are</h1>
          <p>Connect Claude and WhatsApp to 1Fold in a few clicks — your tasks, alerts and answers follow you there.</p>
          <label className="int-search">
            <Search aria-hidden />
            <input type="search" placeholder="Search integrations" aria-label="Search integrations" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="int-hero-art" aria-hidden>
          {apps.map((a, i) => <span key={a.id} className={`int-logo is-float f${i} ${a.tile}`}><a.icon /></span>)}
        </div>
      </header>

      <div className="int-body">
        <nav className="int-cats" aria-label="Categories">
          {filters.map((f) => (
            <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.id === "All" && <LayoutGrid aria-hidden />}{f.id === "Connected" && <span className="int-dot" aria-hidden />}
              <span>{f.id === "All" ? "All integrations" : f.id}</span><span className="int-cat-count">{f.count}</span>
            </button>
          ))}
        </nav>

        <div className="int-main">
          {filter === "All" && !query && connected.length > 0 && (
            <section aria-labelledby="int-connected-title" className="int-section">
              <h2 id="int-connected-title">Connected</h2>
              <div className="int-connected">
                {connected.map((a) => (
                  <Link key={a.id} href={href(`/integrations/${a.id}`)} className="int-connected-chip">
                    <span className={`int-logo is-sm ${a.tile}`} aria-hidden><a.icon /></span>
                    <span><strong>{a.name}</strong><span className="muted">{statuses[a.id].label}</span></span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section aria-labelledby="int-all-title" className="int-section">
            <h2 id="int-all-title">{filter === "All" ? "All integrations" : filter}</h2>
            {shown.length ? (
              <div className="int-grid">{shown.map((a) => <AppCard key={a.id} app={a} status={statuses[a.id]} />)}</div>
            ) : <p className="int-empty">{query ? `No integration matches “${q.trim()}”.` : "Nothing here yet."}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function AppCard({ app, status }: { app: App; status: AppStatus }) {
  const { href } = useMe();
  return (
    <Link href={href(`/integrations/${app.id}`)} className={`int-card ${app.tile}`} aria-label={`${app.name} — ${status.label}`}>
      <span className="int-card-top">
        <span className={`int-logo ${app.tile}`} aria-hidden><app.icon /></span>
        <span className={`int-status${status.connected ? " is-on" : ""}`}><span className="int-dot" aria-hidden />{status.connected ? "Connected" : status.label}</span>
      </span>
      <span className="int-card-name">{app.name}</span>
      <span className="int-card-by">by 1FOLD · {app.category}</span>
      <span className="int-card-desc">{app.tagline}</span>
      <span className="int-card-recipe"><Zap aria-hidden /><span><RecipeText recipe={app.recipes[0]} /></span></span>
      <span className="int-card-go">{status.connected ? "Open" : "Connect"} <ArrowRight aria-hidden /></span>
    </Link>
  );
}
