import { test, expect } from "../fixtures/test";
import { limpiarFixtureR1A, prepararFixtureR1A } from "../fixtures/datos";
import { TurnoGatePage } from "../pages/turno-gate.page";

test.describe("R1-A recuperación de intención", () => {
  test("la recuperación no ejecuta una apertura automáticamente", async ({ canal }, testInfo) => {
    test.setTimeout(120_000);
    const fixture = await prepararFixtureR1A(`${testInfo.project.name}-recarga`);
    try {
      let sesion = canal;
      const gate = new TurnoGatePage(sesion.page);
      await gate.iniciarSesion(fixture.cajero);
      let llamadas = 0;
      await sesion.page.route("**/*abrirTurnoOperativoV1*", async (route) => {
        llamadas += 1;
        await route.continue();
      });
      if (testInfo.project.name === "web") await sesion.page.reload();
      else {
        sesion = await sesion.reiniciar!();
        const baseUrl = process.env.E2E_R1A_BASE_URL ?? "http://127.0.0.1:3000";
        await sesion.page.goto(new URL("/pos", baseUrl).toString());
        const login = sesion.page.locator("#username");
        const compuerta = sesion.page.getByRole("heading", { name: "Abre tu turno" });
        await Promise.race([
          login.waitFor({ state: "visible", timeout: 60_000 }),
          compuerta.waitFor({ state: "visible", timeout: 60_000 }),
        ]);
        if (await login.isVisible().catch(() => false)) {
          await login.fill(fixture.cajero.codigo);
          await sesion.page.locator("#password").fill(fixture.cajero.pin);
          await sesion.page.getByRole("button", { name: /Iniciar/ }).click();
        }
      }
      await expect(sesion.page.getByRole("heading", { name: "Abre tu turno" })).toBeVisible({ timeout: 60_000 });
      expect(llamadas).toBe(0);
    } finally {
      await limpiarFixtureR1A(fixture);
    }
  });
});
