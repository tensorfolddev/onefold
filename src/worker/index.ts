// The worker: one per environment, next to the website (`node src/worker/index.ts`, the image's second process). It
// runs the WhatsApp bot and the scheduled jobs. Stops cleanly on SIGTERM (docker stop).
import { closeDatabase } from "../server/db/client.ts";
import { cleanupFiles } from "../server/files.ts";
import { botStatus, cleanupLinkCodes, handleMessage, setBotState, takeBotRequest } from "../server/whatsapp/bot.ts";
import { sendDueBriefs } from "../server/whatsapp/brief.ts";
import { sendOutbox } from "../server/whatsapp/outbox.ts";
import { createBridge, type Bridge } from "../server/whatsapp/bridge.ts";
import { companyBot, companyBotIds, dropCompanyBot, setCompanyBotState, takeCompanyBotRequests } from "../server/whatsapp/companyBot.ts";

const HOUR = 60 * 60_000;
const MINUTE = 60_000;
const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const timers: NodeJS.Timeout[] = [];

/** Runs `job` now and then every `ms`. A failure is logged and simply tried again next time; runs never overlap. */
export function every(name: string, ms: number, job: () => Promise<unknown>) {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await job();
      if (result !== undefined) console.log(`[worker] ${name}: ${JSON.stringify(result)}`);
    } catch (e) {
      console.error(`[worker] ${name} failed`, e);
    } finally {
      running = false;
    }
  };
  void run();
  timers.push(setInterval(run, ms));
}

every("clean up unused images", HOUR, async () => ({ removed: await cleanupFiles() }));
every("clean up old WhatsApp codes", HOUR, async () => { await cleanupLinkCodes(); return undefined; });

// WhatsApp: with a saved session the bot connects by itself; without one it waits until an admin asks for a QR.
const WHATSAPP_DIR = process.env.WHATSAPP_DIR ?? "data/whatsapp";
const COMPANIES_DIR = "companies"; // companies' own numbers, beside 1FOLD's session — never forgotten with it
const bridge = createBridge(WHATSAPP_DIR, {
  onState: (state, extra) => setBotState(state, extra, APP_URL),
  onMessage: (msg) => handleMessage(msg, bridge, APP_URL),
}, { keep: [COMPANIES_DIR] });
if (bridge.hasSession()) {
  bridge.start().catch((e: unknown) => console.error("[worker] WhatsApp didn't start", e));
} else if ((await botStatus()).state !== "logged_out") { // a logged-out bot stays flagged until someone scans again
  await setBotState("off", { phone: null });
}
every("WhatsApp requests", 3000, async () => {
  const request = await takeBotRequest();
  if (request === "pair" && !bridge.running()) await bridge.start();
  if (request === "logout") { await bridge.logout(); await setBotState("off", { phone: null }); }
  return request ?? undefined;
});
// Companies with their own number: each its own linked device (its own session folder), answering only for that
// company. Made when an admin asks for it, and for every company that had one when the worker starts.
const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/;
const companies = new Map<string, Bridge>();
function companyBridge(orgId: string): Bridge {
  if (!ORG_ID.test(orgId)) throw new Error("Bad company id");
  let own = companies.get(orgId);
  if (!own) {
    const made: Bridge = createBridge(`${WHATSAPP_DIR}/${COMPANIES_DIR}/${orgId}`, {
      onState: (state, extra) => setCompanyBotState(orgId, state, extra),
      onMessage: (msg) => handleMessage(msg, made, APP_URL, orgId),
    });
    own = made;
    companies.set(orgId, own);
  }
  return own;
}
for (const orgId of await companyBotIds()) {
  const own = companyBridge(orgId);
  if (own.hasSession()) own.start().catch((e: unknown) => console.error(`[worker] ${orgId}'s WhatsApp didn't start`, e));
  else if ((await companyBot(orgId))?.state !== "logged_out") await setCompanyBotState(orgId, "off", { phone: null });
}
every("company WhatsApp requests", 3000, async () => {
  const requests = await takeCompanyBotRequests();
  for (const { orgId, request } of requests) {
    const own = companyBridge(orgId);
    if (request === "pair" && !own.running()) await own.start();
    if (request === "logout") { // back on 1FOLD's bot
      await own.logout();
      companies.delete(orgId);
      await dropCompanyBot(orgId);
    }
  }
  return requests.length ? requests : undefined;
});
/** Who sends for a company: its own number if it has one (even while that's down — then nothing goes), else 1FOLD's. */
const senderFor = (orgId: string | null) => {
  const own = orgId ? companies.get(orgId) : undefined;
  if (own) return own.connected() ? own : null;
  return bridge.connected() ? bridge : null;
};

// Alerts like "Ayla mentioned you in Design spec": within seconds, while the right bot is connected.
every("whatsapp alerts", 5_000, async () => sendOutbox(senderFor));

every("daily briefs", MINUTE, async () => {
  const run = await sendDueBriefs({ whatsapp: bridge, appUrl: APP_URL, whatsappFor: (orgId) => companies.get(orgId) ?? null });
  return run.whatsapp + run.email + run.none + run.failed > 0 ? run : undefined;
});

async function stop(signal: string) {
  console.log(`[worker] ${signal}: stopping`);
  timers.forEach(clearInterval);
  const hadSession = bridge.hasSession();
  await bridge.stop();
  for (const [orgId, own] of companies) {
    const had = own.hasSession();
    await own.stop();
    await setCompanyBotState(orgId, had ? "connecting" : "off").catch(() => {});
  }
  // Not "connected" while nobody's listening (so no one is handed a code to send into the void).
  await setBotState(hadSession ? "connecting" : "off").catch(() => {});
  await closeDatabase();
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
console.log("[worker] started");
