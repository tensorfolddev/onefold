"use client";

// Integrations: what 1Fold connects to. Everyone: Claude (MCP — ask about your work, and update it, from Claude) and
// their own WhatsApp (the daily brief, urgent alerts). Admins: the company's WhatsApp — who's linked, what went out,
// when the brief goes, the reply words, the messages. Platform admins: pairing the bot itself.
import { MessageCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { useMe } from "@/data/StoreProvider";
import { McpDialog } from "@/features/mcp/McpDialog";
import { CompanyWhatsApp } from "@/features/whatsapp/CompanyWhatsApp";
import { useWhatsApp, WhatsAppBotSettings, WhatsAppDialog } from "@/features/whatsapp/WhatsApp";

const STATUS_EVERY_MS = 30_000;

export function Integrations() {
  const { panel } = useMe();
  const [mcp, setMcp] = useState(false);
  const [whatsApp, setWhatsApp] = useState(false);
  const { status } = useWhatsApp(STATUS_EVERY_MS);
  const linked = status?.me.linked;

  return (
    <div className="page admin-page integrations">
      <header className="page-header">
        <div>
          <h1 className="page-title">Integrations</h1>
          <p className="page-subtitle">Your work, where you already are — in Claude, and on WhatsApp</p>
        </div>
      </header>

      <section className="integration-section" aria-labelledby="int-yours">
        <h2 id="int-yours" className="integration-heading">Yours</h2>
        <div className="integration-grid">
          <article className="integration-card">
            <span className="integration-tile is-claude" aria-hidden><Sparkles /></span>
            <div className="integration-text">
              <h3>Claude</h3>
              <p>Ask Claude about your tickets and docs — or let it make and update them for you. Connects through MCP with a personal token.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setMcp(true)}>Connect Claude</button>
          </article>
          <article className="integration-card">
            <span className="integration-tile is-whatsapp" aria-hidden><MessageCircle /></span>
            <div className="integration-text">
              <h3>WhatsApp</h3>
              <p>Your pending tasks every working morning, and an alert the moment someone @@mentions you.</p>
              <p className={`integration-status${linked ? " is-on" : ""}`} role="status">
                {!status ? "Checking…" : linked ? `Linked · +${linked.phone}` : status.me.available ? "Not linked yet" : "The bot isn't connected right now"}
              </p>
            </div>
            <button type="button" className={`btn ${linked ? "btn-secondary" : "btn-primary"}`} onClick={() => setWhatsApp(true)}>
              {linked ? "Manage" : "Connect WhatsApp"}
            </button>
          </article>
        </div>
      </section>

      {panel === "admin" && (
        <section className="integration-section" aria-labelledby="int-company">
          <h2 id="int-company" className="integration-heading">Company WhatsApp</h2>
          <p className="muted integration-lead">Who&apos;s linked to the bot, what it sent and whether it arrived, and how it talks to your team.</p>
          <CompanyWhatsApp />
        </section>
      )}

      <WhatsAppBotSettings />
      {mcp && <McpDialog onClose={() => setMcp(false)} />}
      {whatsApp && <WhatsAppDialog onClose={() => setWhatsApp(false)} />}
    </div>
  );
}
