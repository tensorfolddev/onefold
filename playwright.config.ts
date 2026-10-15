import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
// Emails land in this folder instead of being sent (the server and the tests both read this variable).
process.env.EMAIL_OUTBOX_DIR ??= join(tmpdir(), "onefold-e2e-outbox");

// End-to-end journeys against a production build (`npm run build` first). Uses the installed Chrome.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: true,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], channel: "chrome", baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/signin`,
    env: { RESEND_API_KEY: "" }, // never send real email from tests, even if .env.local has a key
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
