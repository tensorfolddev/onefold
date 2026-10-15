// The worker: one per environment, next to the website (`node src/worker/index.ts`, the image's second process). It
// runs the scheduled jobs. Stops cleanly on SIGTERM (docker stop).
import { closeDatabase } from "../server/db/client.ts";
import { cleanupFiles } from "../server/files.ts";

const HOUR = 60 * 60_000;
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

async function stop(signal: string) {
  console.log(`[worker] ${signal}: stopping`);
  timers.forEach(clearInterval);
  await closeDatabase();
  process.exit(0);
}
process.on("SIGTERM", () => void stop("SIGTERM"));
process.on("SIGINT", () => void stop("SIGINT"));
console.log("[worker] started");
