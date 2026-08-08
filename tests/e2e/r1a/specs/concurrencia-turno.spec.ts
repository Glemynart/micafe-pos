import { test, expect } from "../fixtures/test";
import { abrirWeb } from "../drivers/web";
import { limpiarFixtureR1A, prepararFixtureR1A } from "../fixtures/datos";
import { contarTurnosAbiertos, esperarAperturaConfirmada } from "../helpers/firestore-admin";
import { esperarConfirmacionListener } from "../helpers/espera-listener";
import { TurnoGatePage } from "../pages/turno-gate.page";

test.describe("R1-A concurrencia de apertura", () => {
  test("Web Locks mantiene una intención pendiente entre dos pestañas", async ({ canal }, testInfo) => {
    test.skip(testInfo.project.name !== "web", "Web Locks se certifica en el canal web.");
    const fixture = await prepararFixtureR1A("web-locks");
    const segunda = await canal.context.newPage();
    try {
      const primera = new TurnoGatePage(canal.page);
      await primera.iniciarSesion(fixture.cajero);
      const baseUrl = process.env.E2E_R1A_BASE_URL ?? "http://127.0.0.1:3000";
      await segunda.goto(new URL("/pos", baseUrl).toString());
      await expect(segunda.getByRole("heading", { name: "Abre tu turno" })).toBeVisible({ timeout: 30_000 });
      await canal.page.getByPlaceholder("0").fill("150000");
      await segunda.getByPlaceholder("0").fill("150000");
      await Promise.all([
        // El primer listener puede desmontar la compuerta de la segunda
        // pestaña inmediatamente; el click DOM evita que Playwright espere
        // estabilidad sobre un nodo que la propia prueba está provocando que
        // desaparezca.
        canal.page.getByRole("button", { name: "Iniciar Turno" }).evaluate((button) => (button as HTMLButtonElement).click()),
        segunda.getByRole("button", { name: "Iniciar Turno" }).evaluate((button) => (button as HTMLButtonElement).click()),
      ]);
      await esperarConfirmacionListener(canal.page);
      await esperarAperturaConfirmada(fixture.empresaId, fixture.cajero.uid);
      await expect.poll(() => contarTurnosAbiertos(fixture.empresaId, fixture.cajero.uid)).toBe(1);
    } finally {
      await segunda.close();
      await limpiarFixtureR1A(fixture);
    }
  });

  test("dos dispositivos no crean turnos paralelos", async ({ canal, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "web", "La segunda sesión independiente se certifica en web.");
    const fixture = await prepararFixtureR1A("dos-dispositivos");
    const segundoCanal = await abrirWeb(browser);
    try {
      const primero = new TurnoGatePage(canal.page);
      const segundo = new TurnoGatePage(segundoCanal.page);
      await primero.iniciarSesion(fixture.cajero);
      await segundo.iniciarSesion(fixture.cajero);
      await Promise.all([primero.abrir(), segundo.abrir()]);
      await esperarAperturaConfirmada(fixture.empresaId, fixture.cajero.uid);
      await expect.poll(() => contarTurnosAbiertos(fixture.empresaId, fixture.cajero.uid)).toBe(1);
    } finally {
      await segundoCanal.cerrar();
      await limpiarFixtureR1A(fixture);
    }
  });
});
