import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.E2E_BODEGA_BASE_URL ?? "http://127.0.0.1:3010"

export default defineConfig({
  testDir: "./tests/e2e/bodega-u4-u5",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  outputDir: process.env.E2E_BODEGA_OUTPUT_DIR ?? `${process.env.TEMP ?? "."}/bodega-u4-u5-playwright`,
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", ...devices["Desktop Chrome"] },
  webServer: {
    command: "cross-env NEXT_PUBLIC_USE_EMULATORS=1 next dev -H 127.0.0.1 -p 3010",
    url: `${baseURL}/pos`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
