import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.E2E_B2_EVENTOS_BASE_URL ?? "http://127.0.0.1:3004"
const publicSlug = process.env.E2E_B2_PUBLIC_SLUG ?? "b2-tenant-a"
const evidenceDir = process.env.E2E_B2_EVENTOS_EVIDENCE_DIR ?? "artifacts/e2e/b2-eventos"

export default defineConfig({
  testDir: "./tests/e2e/b2-eventos/specs",
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
    command: `cross-env NEXT_PUBLIC_USE_EMULATORS=1 NEXT_PUBLIC_RESERVATION_SLUG=${publicSlug} next dev --webpack -H 127.0.0.1 -p 3004`,
    url: `${baseURL}/api/public/eventos?slug=${encodeURIComponent(publicSlug)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "web", use: { ...devices["Desktop Chrome"] } }],
})
