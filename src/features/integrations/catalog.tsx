"use client";

// The integrations 1Fold has — what each is, who it's for, what it does (as monday-style recipes) — and whether each
// is connected right now, for the person looking.
import { Bot, Mail, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/data/api";
import { useMe } from "@/data/StoreProvider";
import { useWhatsApp } from "@/features/whatsapp/WhatsApp";

export type AppId = "claude" | "whatsapp" | "team-bot" | "email";
export type Category = "AI" | "Communication" | "For your company";

/** A recipe: a sentence with its moving parts in bold — what the integration does, said the way a person would. */
export type Recipe = (string | { b: string })[];

export interface App {
  id: AppId;
  name: string;
  tagline: string;
  about: string;
  category: Category;
  icon: LucideIcon;
  tile: string; // the logo tile's colour class
  adminOnly?: boolean;
  recipes: Recipe[];
  steps: string[];
  worksWith: string;
}

export const APPS: App[] = [
  {
    id: "claude", name: "Claude", category: "AI", icon: Sparkles, tile: "is-claude",
    tagline: "Ask about your work — and get it done — from Claude.",
    about: "Connect Claude to 1Fold and it can read and change your tickets, docs and decisions — with exactly your permissions. Ask what's due, plan a sprint, write the doc; Claude does it in 1Fold for you.",
    recipes: [
      ["Ask Claude ", { b: "what's due this week" }, " and get your tickets, with links"],
      ["Let Claude ", { b: "create tickets" }, " from ", { b: "a meeting summary" }],
      ["Have Claude ", { b: "write a doc" }, " in your project's docs"],
      ["Ask Claude to ", { b: "log a decision" }, " the team just made"],
    ],
    steps: ["Make a personal token — it acts as you, with your access.", "Add 1Fold to Claude Code or Claude Desktop with it.", "Ask away: Claude works in 1Fold for you."],
    worksWith: "Claude Code, Claude Desktop (MCP)",
  },
  {
    id: "whatsapp", name: "WhatsApp", category: "Communication", icon: MessageCircle, tile: "is-whatsapp",
    tagline: "Your tasks every morning, and an alert when you're needed.",
    about: "Link your WhatsApp and 1Fold's bot sends you your pending tasks every working morning, project by project — and messages you the moment someone @@mentions you. Reply anytime to get your tasks again.",
    recipes: [
      ["Every ", { b: "working morning" }, ", send me ", { b: "my pending tasks" }],
      ["When someone ", { b: "@@mentions me" }, ", send me ", { b: "an alert" }, " right away"],
      ["When I reply ", { b: "1FOLD" }, ", send me ", { b: "my tasks" }, " now"],
    ],
    steps: ["Get a one-time code in 1Fold.", "Send it to the bot on WhatsApp — the link opens the chat with it typed in.", "You're linked: the brief starts the next working morning."],
    worksWith: "WhatsApp on any phone",
  },
  {
    id: "team-bot", name: "Team Bot", category: "For your company", icon: Bot, tile: "is-bot", adminOnly: true,
    tagline: "Your company's own WhatsApp bot: the brief, the replies, the alerts.",
    about: "Set up the bot on your company's own number — scan a code, like WhatsApp Web — then see who's linked and whether every message arrived, set when the daily brief goes, and reword everything the bot sends.",
    recipes: [
      ["Every ", { b: "working day at 09:00" }, ", send each teammate ", { b: "their pending tasks" }],
      ["When someone ", { b: "@@mentions" }, " a teammate, ", { b: "alert them" }, " on WhatsApp"],
      ["When a teammate replies ", { b: "a word you choose" }, ", send them ", { b: "their tasks" }],
    ],
    steps: ["Set up the bot: scan its code with your company's phone.", "Teammates link their own WhatsApp from Integrations → WhatsApp.", "Set the brief, the reply words and the templates — here."],
    worksWith: "WhatsApp (linked device)",
  },
  {
    id: "email", name: "Email", category: "Communication", icon: Mail, tile: "is-email", adminOnly: true,
    tagline: "Invites, password resets and the brief by email — sent through Resend.",
    about: "1Fold sends email through Resend: invite links, password resets, email confirmations, the daily brief when WhatsApp is down, and an alert to platform admins when the bot is logged out. Its API key is set on the server, never in a page.",
    recipes: [
      ["When someone's ", { b: "invited" }, ", email them ", { b: "their invite link" }],
      ["When someone ", { b: "forgets their password" }, ", email ", { b: "a reset link" }],
      ["When WhatsApp is down, send the daily brief ", { b: "by email" }],
      ["When the bot is ", { b: "logged out" }, ", email ", { b: "the platform admins" }],
    ],
    steps: [
      "Create an API key at resend.com, and verify the domain you'll send from.",
      "On the server, set RESEND_API_KEY — and EMAIL_FROM, like \"1Fold <hello@yourcompany.com>\" — then restart 1Fold.",
      "Send yourself a test email from here.",
    ],
    worksWith: "Resend",
  },
];

export const CATEGORIES: Category[] = ["AI", "Communication", "For your company"];
export const appOf = (id: string) => APPS.find((a) => a.id === id);

export interface AppStatus { connected: boolean; label: string }

/** Whether each integration is connected for the person looking: Claude (a token of theirs), their WhatsApp (linked),
 * the bot (connected). Statuses not known yet read "Checking…". */
export interface EmailStatus { mode: "resend" | "outbox" | "off"; from: string }

/** How email is set up here (admins only), or null while it's being asked. */
export function useEmailStatus(): EmailStatus | null {
  const { panel } = useMe();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  useEffect(() => {
    if (panel !== "admin") return;
    let live = true;
    api<EmailStatus>("/api/email/status").then((s) => { if (live) setStatus(s); }).catch(() => { if (live) setStatus({ mode: "off", from: "" }); });
    return () => { live = false; };
  }, [panel]);
  return status;
}

export const emailLabel = (e: EmailStatus) => (e.mode === "resend" ? `Sending as ${e.from}` : e.mode === "outbox" ? "Test inbox (development)" : "Not set up");

export function useAppStatuses(): Record<AppId, AppStatus> {
  const { status } = useWhatsApp(30_000);
  const email = useEmailStatus();
  const [tokens, setTokens] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api<{ tokens: unknown[] }>("/api/tokens/list").then((r) => { if (live) setTokens(r.tokens.length); }).catch(() => { if (live) setTokens(0); });
    return () => { live = false; };
  }, []);
  const checking = { connected: false, label: "Checking…" };
  const bot = status?.botInfo;
  return {
    claude: tokens === null ? checking : tokens ? { connected: true, label: `Connected · ${tokens} token${tokens > 1 ? "s" : ""}` } : { connected: false, label: "Not connected" },
    whatsapp: !status ? checking : status.me.linked ? { connected: true, label: `Linked · +${status.me.linked.phone}` } : { connected: false, label: "Not linked" },
    // Connected once the company's own number is: until then it's 1FOLD's bot, and there's something to set up.
    "team-bot": bot?.own && bot.state === "connected" ? { connected: true, label: `Connected · +${bot.phone ?? ""}` } : { connected: false, label: "" },
    email: !email ? checking : { connected: email.mode === "resend", label: emailLabel(email) },
  };
}

/** A recipe, as a sentence: its moving parts bold and underlined, like monday's. */
export function RecipeText({ recipe }: { recipe: Recipe }) {
  return <>{recipe.map((part, i) => (typeof part === "string" ? part : <strong key={i} className="int-recipe-var">{part.b}</strong>))}</>;
}
