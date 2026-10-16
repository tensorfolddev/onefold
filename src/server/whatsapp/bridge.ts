// The WhatsApp connection, run the way Hermes Agent runs it: Baileys (no browser), bot mode on its own number, the
// session saved on disk (WHATSAPP_DIR — a private, backed-up volume) so restarts don't need a new scan, one message
// sent at a time with a time limit, reconnecting on drops, and stopping for good when WhatsApp logs the bot out.
// Only text from one-to-one chats reaches the bot; groups, broadcasts and its own messages never do.
import { readFileSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
// (Renamed on import: it's a plain function, not a React hook, whatever its name says.)
import { DisconnectReason, fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState as multiFileAuthState, type WASocket } from "@whiskeysockets/baileys";
import pino from "pino";
import type { Sender } from "./brief.ts";
import type { BotState, Inbound } from "./bot.ts";

const SEND_TIMEOUT_MS = 60_000; // Baileys can hang on a send; give up and let the caller fall back
const VERSION_TIMEOUT_MS = 15_000;

type Message = NonNullable<import("@whiskeysockets/baileys").proto.IWebMessageInfo["message"]>;

/** A message's text, from inside the envelopes WhatsApp may wrap it in (disappearing messages, view once, edits…). */
export function textOf(message: Message | null | undefined): string {
  let m = message;
  for (let depth = 0; m && depth < 5; depth++) {
    const inner = m.ephemeralMessage?.message ?? m.viewOnceMessage?.message ?? m.viewOnceMessageV2?.message
      ?? m.documentWithCaptionMessage?.message ?? m.editedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m?.conversation ?? m?.extendedTextMessage?.text ?? "";
}

/** "…4476@lid" — enough to tell chats apart in a log without writing down anyone's number. */
const redacted = (jid: string) => jid ? `…${jid.replace(/@.*/, "").slice(-4)}@${jid.split("@")[1] ?? ""}` : "(none)";

export interface Bridge extends Sender {
  /** Connects with the saved session, or starts pairing (a QR) when there isn't one. */
  start: () => Promise<void>;
  running: () => boolean;
  hasSession: () => boolean;
  /** Logs the bot out on WhatsApp's side and forgets the session. */
  logout: () => Promise<void>;
  stop: () => Promise<void>;
}

export function createBridge(dir: string, events: {
  onState: (state: BotState, extra: { qr?: string | null; phone?: string | null }) => Promise<void>;
  onMessage: (msg: Inbound) => Promise<void>;
}): Bridge {
  const logger = pino({ level: process.env.WHATSAPP_LOG_LEVEL ?? "warn" });
  let sock: WASocket | null = null;
  let open = false;
  let stopping = false;
  let starting: Promise<void> | null = null; // one socket per session, ever: two would knock each other off
  let reconnecting = false;
  let version: [number, number, number] | undefined;
  let sending: Promise<unknown> = Promise.resolve();

  const forget = async () => {
    await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true, mode: 0o700 });
    for (const f of await readdir(/*turbopackIgnore: true*/ dir)) await rm(/*turbopackIgnore: true*/ join(dir, f), { recursive: true, force: true });
  };
  const report = (state: BotState, extra: { qr?: string | null; phone?: string | null } = {}) =>
    events.onState(state, extra).catch((e: unknown) => console.error("[whatsapp] couldn't save the bot's state", e));
  const logged = (what: string) => (e: unknown) => console.error(`[whatsapp] ${what}`, e);

  async function latestVersion() {
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), VERSION_TIMEOUT_MS));
      version = (await Promise.race([fetchLatestBaileysVersion(), timeout])).version;
    } catch (e) {
      console.warn(`[whatsapp] couldn't look up the latest WhatsApp Web version (${e instanceof Error ? e.message : e}); using ${version ? "the last one" : "Baileys' default"}`);
    }
    return version;
  }

  /** Starts a socket unless one is already running or on its way. */
  function start(): Promise<void> {
    if (sock || starting) return starting ?? Promise.resolve();
    starting = connect().finally(() => { starting = null; });
    return starting;
  }

  async function connect(): Promise<void> {
    stopping = false;
    reconnecting = false;
    await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true, mode: 0o700 });
    const { state, saveCreds } = await multiFileAuthState(dir);
    const v = await latestVersion();
    const me = makeWASocket({
      ...(v ? { version: v } : {}),
      auth: state,
      logger,
      browser: ["1Fold", "Chrome", "120.0"],
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      getMessage: async () => ({ conversation: "" }), // no message store; enough for Baileys' retry handshake
    });
    sock = me;
    me.ev.on("creds.update", () => { saveCreds().catch(logged("couldn't save the session")); });

    me.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (sock !== me) return; // an old socket we've already replaced
      if (qr) void report("pairing", { qr });
      if (connection === "open") {
        open = true;
        void report("connected", { phone: (me.user?.id ?? "").replace(/[:@].*/, "") || null });
      }
      if (connection !== "close") return;
      open = false;
      if (stopping) return;
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode;
      sock = null;
      if (code === DisconnectReason.loggedOut) {
        console.error("[whatsapp] logged out by WhatsApp — an admin needs to scan again");
        forget().then(() => report("logged_out"), logged("couldn't forget the session"));
        return;
      }
      if (code === DisconnectReason.forbidden) { // restricted: keep the session (it may lift), stop knocking
        console.error("[whatsapp] WhatsApp refused the bot (403) — not reconnecting until an admin asks");
        void report("logged_out");
        return;
      }
      if (!state.creds.me && code === DisconnectReason.timedOut) {
        // Nobody scanned the QR in time: forget the half-made session and wait for the admin to ask again.
        forget().then(() => report("off"), logged("couldn't forget the session"));
        return;
      }
      void report("connecting");
      reconnecting = true;
      const delay = code === DisconnectReason.restartRequired ? 1000 : 3000;
      setTimeout(() => { if (!stopping) start().catch(retry); }, delay);
    });

    me.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return; // history sync and the like, not new messages
      for (const m of messages) {
        const chat = m.key.remoteJid ?? "";
        if (m.key.fromMe) { // the bot's own replies — or someone typing on the bot's phone, worth one hint if it's a code
          if (/1FOLD-/i.test(textOf(m.message))) console.log(`[whatsapp] a code was sent from the bot's own number — send it from your own phone instead`);
          continue;
        }
        const skip = !chat || chat.endsWith("@g.us") || chat.endsWith("@broadcast") || chat.endsWith("@newsletter") ? "it isn't a one-to-one chat"
          : !m.message ? "WhatsApp hasn't decrypted it yet" : null;
        const text = skip ? "" : textOf(m.message);
        if (skip || !text.trim()) {
          console.log(`[whatsapp] ignored a message from ${redacted(chat)}: ${skip ?? `no text in it (${Object.keys(m.message ?? {}).join(", ")})`}`);
          continue;
        }
        // WhatsApp may hide the number behind a private id (…@lid); the phone form, when given, is in remoteJidAlt.
        const phoneJid = [chat, m.key.remoteJidAlt ?? ""].find((j) => j.endsWith("@s.whatsapp.net")) ?? "";
        try {
          await events.onMessage({ jid: chat, phone: phoneJid.replace(/[:@].*/, ""), text });
        } catch (e) {
          console.error("[whatsapp] couldn't handle a message", e);
        }
      }
    });
  }

  function retry(e: unknown) {
    console.error("[whatsapp] reconnect failed; trying again in 5 s", e);
    reconnecting = true;
    setTimeout(() => { if (!stopping) start().catch(retry); }, 5000);
  }

  /** One send at a time on the socket: overlapping sends can misroute messages (Hermes #33360). */
  function send(jid: string, text: string): Promise<void> {
    const task = sending.then(async () => {
      if (!sock || !open) throw new Error("WhatsApp isn't connected");
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("send timed out")), SEND_TIMEOUT_MS); });
      try {
        await Promise.race([sock.sendMessage(jid, { text }), timeout]);
      } finally {
        clearTimeout(timer);
      }
    });
    sending = task.catch(() => {});
    return task;
  }

  return {
    start,
    send,
    connected: () => open,
    waiting: () => !open && !stopping && (sock !== null || starting !== null || reconnecting),
    running: () => sock !== null || starting !== null,
    hasSession: () => { // a scanned session: Baileys writes creds.json before pairing, but `me` only after it
      try { return !!JSON.parse(readFileSync(/*turbopackIgnore: true*/ join(dir, "creds.json"), "utf8"))?.me?.id; } catch { return false; }
    },
    async logout() {
      stopping = true;
      reconnecting = false;
      const current = sock;
      sock = null;
      open = false;
      try { await current?.logout(); } catch { /* already gone on WhatsApp's side */ }
      await forget();
    },
    async stop() {
      stopping = true;
      reconnecting = false;
      sock?.end(undefined);
      sock = null;
      open = false;
    },
  };
}
