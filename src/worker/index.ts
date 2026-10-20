// The worker: one per environment, next to the website (`node src/worker/index.ts`, the image's second process). It
// runs each company's own WhatsApp number and the scheduled jobs. Stops cleanly on SIGTERM (docker stop).
import { closeDatabase } from "../server/db/client.ts";
import { cleanupFiles } from "../server/files.ts";
import { backUpDue } from "../server/backup/drive.ts";
import { cleanupLinkCodes, handleMessage } from "../server/whatsapp/bot.ts";
import { sendDueBriefs } from "../server/whatsapp/brief.ts";
import { sendOutbox } from "../server/whatsapp/outbox.ts";
import { whatsappLinkBase } from "../server/whatsapp/appLink.ts";
import { createBridge, type Bridge } from "../server/whatsapp/bridge.ts";
import { companyBot, companyBotIds, dropCompanyBot, setCompanyBotState, takeCompanyBotRequests } from "../server/whatsapp/companyBot.ts";

const HOUR = 60 * 60_000;
const MINUTE = 60_000;
const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const LINK_URL = whatsappLinkBase(APP_URL); // what WhatsApp messages link to (a phone can't open localhost)
if (LINK_URL !== APP_URL) console.log(`[worker] WhatsApp links use ${LINK_URL} — APP_URL is localhost, which phones can't open`);
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
// Each company with its own Google Drive connected: a backup of only that company there, once a day.
every("company Drive backups", HOUR, backUpDue);

// WhatsApp: every company has its own number — its own linked device (its own session folder), answering only for
// that company. Made when an admin asks for it, and for every company that had one when the worker starts; with a
// saved session it connects by itself. There's no shared number: a company without its own has no WhatsApp.
const WHATSAPP_DIR = process.env.WHATSAPP_DIR ?? "data/whatsapp";
const COMPANIES_DIR = "companies";
const ORG_ID = /^[A-Za-z0-9_-]{1,64}$/;
const companies = new Map<string, Bridge>();
function companyBridge(orgId: string): Bridge {
  if (!ORG_ID.test(orgId)) throw new Error("Bad company id");
  let own = companies.get(orgId);
  if (!own) {
    const made: Bridge = createBridge(`${WHATSAPP_DIR}/${COMPANIES_DIR}/${orgId}`, {
      onState: (state, extra) => setCompanyBotState(orgId, state, extra),
      onMessage: (msg) => handleMessage(msg, made, LINK_URL, orgId),
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
    if (request === "pair") { // set up — or, while it's pairing, a fresh QR (Regenerate)
      if (own.running() && !own.connected()) await own.stop();
      if (!own.running()) await own.start();
    }
    if (request === "logout") { // no number until its admins set one up again
      await own.logout();
      companies.delete(orgId);
      await dropCompanyBot(orgId);
    }
  }
  // A setup cancelled before it was paired is gone at once (requestCompanyBot): stop its pairing here too.
  const ids = new Set(await companyBotIds());
  for (const [orgId, own] of companies) {
    if (!ids.has(orgId)) { await own.logout(); companies.delete(orgId); }
  }
  return requests.length ? requests : undefined;
});
/** A company's own number, once it's paired (a session saved — connected, or reconnecting); else none. */
const ownFor = (orgId: string | null) => {
  const own = orgId ? companies.get(orgId) : undefined;
  return own?.hasSession() ? own : null;
};
/** Who sends for a company: its own number, while it's connected — else nothing goes (alerts wait). */
const senderFor = (orgId: string | null) => {
  const own = ownFor(orgId);
  return own?.connected() ? own : null;
};

// Alerts like "Ayla mentioned you in Design spec": within seconds, while the right bot is connected.
every("whatsapp alerts", 5_000, async () => sendOutbox(senderFor));

every("daily briefs", MINUTE, async () => {
  const run = await sendDueBriefs({ appUrl: LINK_URL, whatsappFor: ownFor });
  return run.whatsapp + run.email + run.none + run.failed > 0 ? run : undefined;
});

async function stop(signal: string) {
  console.log(`[worker] ${signal}: stopping`);
  timers.forEach(clearInterval);
  for (const [orgId, own] of companies) {
    const had = own.hasSession();
    await own.stop();
    await setCompanyBotState(orgId, had ? "connecting" : "off").catch(() => {});
  }
  await closeDatabase();
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
console.log("[worker] started");
