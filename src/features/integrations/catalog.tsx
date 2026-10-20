"use client";

// The integrations 1Fold has — what each is, who it's for, what it does (as monday-style recipes) — and whether each
// is connected right now, for the person looking.
import { Bot, HardDrive, Mail, MessageCircle, Sparkles, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/data/api";
import { useMe } from "@/data/StoreProvider";
import { useWhatsApp } from "@/features/whatsapp/WhatsApp";

export type AppId = "claude" | "whatsapp" | "team-bot" | "email" | "drive";
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
    about: "Link your WhatsApp and your company's bot sends you your pending tasks every working morning, project by project — and messages you the moment someone @@mentions you. Reply anytime to get your tasks again. Your chat with it is yours alone.",
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
    tagline: "Invites, password resets and the brief by email — from your own address, through Resend.",
    about: "1Fold sends your company's email through your own Resend account: invite links and the daily brief when WhatsApp is down. The API key is kept encrypted and never shown again — only its last 4 characters. Until you add one, 1Fold doesn't email your team: invite links are shown to copy instead. (Sign-up confirmations and password resets always come from 1Fold, so nobody's locked out.)",
    recipes: [
      ["When someone's ", { b: "invited" }, ", email them ", { b: "their invite link" }],
      ["When WhatsApp is down, send the daily brief ", { b: "by email" }],
    ],
    steps: [
      "Create an API key at resend.com, and verify the domain you'll send from.",
      "Paste the key and your From address above, like \"Acme <hello@acme.com>\".",
      "Send yourself a test email, then save.",
    ],
    worksWith: "Resend",
  },
  {
    id: "drive", name: "Google Drive", category: "For your company", icon: HardDrive, tile: "is-drive", adminOnly: true,
    tagline: "A backup of your company in your own Google Drive, every day.",
    about: "Connect your company's Google Drive and 1Fold saves a backup of everything there every day — products, tickets, docs with every version, decisions, people and files — keeping the newest 30. Only your company's data, never anyone else's, and never a password or secret. 1Fold can only see the files it makes in that Drive.",
    recipes: [
      ["Every ", { b: "day" }, ", save ", { b: "a backup of the company" }, " to our Drive"],
      ["Keep ", { b: "the newest 30" }, ", and remove ", { b: "older ones" }],
      ["When we press ", { b: "Back up now" }, ", save ", { b: "one right away" }],
    ],
    steps: [
      "Connect with the Google account that should hold the backups.",
      "1Fold makes a “1Fold backups” folder there and saves one every day.",
      "To put one back, ask the 1Fold team — they restore only your company.",
    ],
    worksWith: "Google Drive",
  },
];

export const CATEGORIES: Category[] = ["AI", "Communication", "For your company"];
export const appOf = (id: string) => APPS.find((a) => a.id === id);

export interface AppStatus { connected: boolean; label: string }

/** Whether each integration is connected for the person looking: Claude (a token of theirs), their WhatsApp (linked),
 * the bot (connected). Statuses not known yet read "Checking…". */
/** How email is set up for the company: its own Resend (`hint`: the key's last 4), a test inbox, or none. */
export interface EmailStatus { mode: "own" | "outbox" | "off"; from: string; hint: string | null }

/** How email is set up here (admins only) — null while it's being asked — and a way to show a newer answer. */
export function useEmailStatus(): [EmailStatus | null, (s: EmailStatus) => void] {
  const { panel } = useMe();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  useEffect(() => {
    if (panel !== "admin") return;
    let live = true;
    api<EmailStatus>("/api/email/status").then((s) => { if (live) setStatus(s); }).catch(() => { if (live) setStatus({ mode: "off", from: "", hint: null }); });
    return () => { live = false; };
  }, [panel]);
  return [status, setStatus];
}

/** The company's Google Drive, as Integrations shows it (admins only); the backups only on its own page. */
export interface DriveStatus {
  available: boolean; // the server can connect to Google at all
  keep: number;
  connected: { email: string; connectedAt: string; lastOkAt: string | null; lastError: string | null; lastBytes: number | null; running: boolean } | null;
  backups: { id: string; name: string; createdAt: string; bytes: number; link: string }[];
}

/** How the company's Drive is set up (admins only) — null while it's being asked — and a way to show a newer answer. */
export function useDriveStatus(withBackups = false): [DriveStatus | null, (s: DriveStatus) => void] {
  const { panel } = useMe();
  const [status, setStatus] = useState<DriveStatus | null>(null);
  useEffect(() => {
    if (panel !== "admin") return;
    let live = true;
    api<DriveStatus>(`/api/drive/status${withBackups ? "?backups=1" : ""}`)
      .then((s) => { if (live) setStatus(s); })
      .catch(() => { if (live) setStatus({ available: false, keep: 30, connected: null, backups: [] }); });
    return () => { live = false; };
  }, [panel, withBackups]);
  return [status, setStatus];
}

export const emailLabel = (e: EmailStatus) => (e.mode === "own" ? `Sending as ${e.from}` : e.mode === "outbox" ? "Test inbox (development)" : "Not set up");

export function useAppStatuses(): Record<AppId, AppStatus> {
  const { status } = useWhatsApp(30_000);
  const [email] = useEmailStatus();
  const [drive] = useDriveStatus();
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
    // Connected once the company's own number is — until then the team has no WhatsApp, and there's something to set up.
    "team-bot": bot?.state === "connected" && bot.phone ? { connected: true, label: `Connected · +${bot.phone}` } : { connected: false, label: "" },
    email: !email ? checking : { connected: email.mode === "own", label: emailLabel(email) },
    drive: !drive ? checking : drive.connected ? { connected: true, label: `Connected · ${drive.connected.email}` } : { connected: false, label: "Not connected" },
  };
}

/** A recipe, as a sentence: its moving parts bold and underlined, like monday's. */
export function RecipeText({ recipe }: { recipe: Recipe }) {
  return <>{recipe.map((part, i) => (typeof part === "string" ? part : <strong key={i} className="int-recipe-var">{part.b}</strong>))}</>;
}
