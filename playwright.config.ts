import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

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
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
