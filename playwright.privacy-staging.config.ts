import { defineConfig, devices } from "@playwright/test";

const expectedProject = "micafe-pos-staging";
const expectedFunctionsUrl = "https://us-central1-micafe-pos-staging.cloudfunctions.net";

if (process.env.OPERATOR_PORTAL_E2E_TARGET !== "staging"
  || process.env.OPERATOR_PORTAL_PROJECT_ID !== expectedProject
  || process.env.OPERATOR_PORTAL_FUNCTIONS_BASE_URL !== expectedFunctionsUrl) {
  throw new Error("El E2E de privacidad solo puede apuntar explícitamente a micafe-pos-staging y sus Functions us-central1.");
}

const evidence = process.env.OPERATOR_PORTAL_EVIDENCE_DIR
  ?? "artifacts/e2e/operator-portal-staging/privacy-claims";

export default defineConfig({
  testDir: "./tests/e2e/operator-portal/specs",
  testMatch: "privacy-claims.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: "https://micafe-pos--micafe-pos-staging.us-central1.hosted.app",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  outputDir: `${evidence}/test-results`,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${evidence}/html`, open: "never" }],
  ],
  projects: [{ name: "staging-chromium", use: { ...devices["Desktop Chrome"] } }],
});
