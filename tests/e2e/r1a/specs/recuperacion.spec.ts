import { test, expect } from "../fixtures/test";
import { limpiarFixtureR1A, prepararFixtureR1A } from "../fixtures/datos";
import { TurnoGatePage } from "../pages/turno-gate.page";

test.describe("R1-A recuperación de intención", () => {
  test("la recuperación no ejecuta una apertura automáticamente", async ({ canal }, testInfo) => {
    const fixture = await prepararFixtureR1A(`${testInfo.project.name}-recarga`);
    try {
      let sesion = canal;
      const gate = new TurnoGatePage(sesion.page);
      await gate.iniciarSesion(fixture.cajero);
      let llamadas = 0;
      await sesion.page.route("**/abrirTurnoOperativoV1", async (route) => {
        llamadas += 1;
        await route.continue();
      });
      if (testInfo.project.name === "web") await sesion.page.reload();
      else {
        sesion = await sesion.reiniciar!();
        await sesion.page.goto("/pos");
      }
      await expect(sesion.page.getByRole("heading", { name: "Abre tu turno" })).toBeVisible();
      expect(llamadas).toBe(0);
    } finally {
      await limpiarFixtureR1A(fixture);
    }
  });
});
