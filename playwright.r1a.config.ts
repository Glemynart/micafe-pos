import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_R1A_BASE_URL ?? "http://127.0.0.1:3000";
const evidencia = process.env.E2E_R1A_EVIDENCE_DIR ?? "artifacts/e2e/r1a";

export default defineConfig({
  testDir: "./tests/e2e/r1a/specs",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  outputDir: `${evidencia}/test-results`,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${evidencia}/html`, open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  globalSetup: "./tests/e2e/r1a/fixtures/global-setup.ts",
  webServer: {
    command: "cross-env NEXT_PUBLIC_USE_EMULATORS=1 next dev -H 127.0.0.1 -p 3000",
    url: `${baseURL}/pos`,
    // R1-A debe arrancar Next con el projectId del runner; reutilizar un
    // `next dev` local deja el navegador apuntando a otro entorno Firebase.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "web", use: { ...devices["Desktop Chrome"] } },
    // El driver PWA conserva contexto de navegador persistente; R1-A no prescribe instalación ni Service Worker.
    { name: "pwa", use: { ...devices["Desktop Chrome"] } },
    { name: "electron", use: { ...devices["Desktop Chrome"] } },
  ],
});
