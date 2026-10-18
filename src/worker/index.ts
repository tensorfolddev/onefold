// The worker: one per environment, next to the website (`node src/worker/index.ts`, the image's second process). It
// runs the WhatsApp bot and the scheduled jobs. Stops cleanly on SIGTERM (docker stop).
import { closeDatabase } from "../server/db/client.ts";
import { cleanupFiles } from "../server/files.ts";
import { botStatus, cleanupLinkCodes, handleMessage, setBotState, takeBotRequest } from "../server/whatsapp/bot.ts";
import { sendDueBriefs } from "../server/whatsapp/brief.ts";
import { sendOutbox } from "../server/whatsapp/outbox.ts";
import { createBridge } from "../server/whatsapp/bridge.ts";

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
const bridge = createBridge(process.env.WHATSAPP_DIR ?? "data/whatsapp", {
  onState: (state, extra) => setBotState(state, extra, APP_URL),
  onMessage: (msg) => handleMessage(msg, bridge, APP_URL),
});
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
// Alerts like "Ayla mentioned you in Design spec": within seconds, while the bot is connected.
every("whatsapp alerts", 5_000, async () => (bridge.connected() ? sendOutbox(bridge) : undefined));

every("daily briefs", MINUTE, async () => {
  const run = await sendDueBriefs({ whatsapp: bridge, appUrl: APP_URL });
  return run.whatsapp + run.email + run.none + run.failed > 0 ? run : undefined;
});

async function stop(signal: string) {
  console.log(`[worker] ${signal}: stopping`);
  timers.forEach(clearInterval);
  const hadSession = bridge.hasSession();
  await bridge.stop();
  // Not "connected" while nobody's listening (so no one is handed a code to send into the void).
  await setBotState(hadSession ? "connecting" : "off").catch(() => {});
  await closeDatabase();
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
console.log("[worker] started");
