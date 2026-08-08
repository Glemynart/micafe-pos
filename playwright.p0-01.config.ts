import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_P0_01_BASE_URL ?? "http://127.0.0.1:3003";
const evidenceDir = process.env.E2E_P0_01_EVIDENCE_DIR ?? "artifacts/e2e/p0-01";

export default defineConfig({
  testDir: "./tests/e2e/p0-01/specs",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  outputDir: `${evidenceDir}/test-results`,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${evidenceDir}/html`, open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "cross-env NEXT_PUBLIC_USE_EMULATORS=1 next dev --webpack -H 127.0.0.1 -p 3003",
    url: `${baseURL}/admin/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "web", use: { ...devices["Desktop Chrome"] } }],
});
