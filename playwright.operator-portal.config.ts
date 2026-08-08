import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3001";
const evidencia = process.env.OPERATOR_PORTAL_EVIDENCE_DIR ?? "artifacts/e2e/operator-portal";

export default defineConfig({
  testDir: "./tests/e2e/operator-portal/specs",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // Márgenes dimensionados sobre el coste real del entorno, no sobre el de la
  // aplicación: `next dev` compila cada ruta la primera vez que se visita y el
  // emulador de Functions arranca un runtime por callable. Medido en Windows,
  // `solicitarBootstrapEmpresarialSaas` responde en ~1 s en caliente y supera
  // los 15 s en frío; con 15 s de aserción el caso fallaba con el Bootstrap aún
  // en curso.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: `${evidencia}/test-results`,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${evidencia}/html`, open: "never" }],
  ],
  globalSetup: "./tests/e2e/operator-portal/global-setup.ts",
  webServer: {
    command: "cross-env NEXT_PUBLIC_USE_EMULATORS=1 next dev -H 127.0.0.1 -p 3001",
    url: `${baseURL}/backoffice/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "web", use: { ...devices["Desktop Chrome"] } }],
});
