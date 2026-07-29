import { verificarSaludE2E } from "../../tests/e2e/r1a/fixtures/entorno";

void (async () => {
  await verificarSaludE2E();
  console.log("R1-A E2E preflight: Auth, Firestore y Functions están disponibles.");
})().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
