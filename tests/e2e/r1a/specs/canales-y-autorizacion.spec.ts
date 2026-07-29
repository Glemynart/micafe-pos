import { test, expect } from "../fixtures/test";
import { limpiarFixtureR1A, prepararFixtureR1A } from "../fixtures/datos";
import { adminE2E } from "../fixtures/entorno";
import { contarTurnosAbiertos, esperarAperturaConfirmada } from "../helpers/firestore-admin";
import { esperarConfirmacionListener } from "../helpers/espera-listener";
import { TurnoGatePage } from "../pages/turno-gate.page";
import { ShiftsModulePage } from "../pages/shifts-module.page";
import { abrirWeb } from "../drivers/web";

test.describe("R1-A canales y autorización", () => {
  test("Shifts Module abre un único turno confirmado", async ({ canal }, testInfo) => {
    const fixture = await prepararFixtureR1A(`${testInfo.project.name}-shifts`);
    try {
      const gate = new TurnoGatePage(canal.page);
      await gate.iniciarSesion(fixture.admin);
      const shifts = new ShiftsModulePage(canal.page);
      await shifts.abrirModulo();
      await shifts.abrirTurno();
      await esperarAperturaConfirmada(fixture.empresaId, fixture.admin.uid);
      await expect.poll(() => contarTurnosAbiertos(fixture.empresaId, fixture.admin.uid)).toBe(1);
    } finally {
      await limpiarFixtureR1A(fixture);
    }
  });

  test("retry tras pérdida de red conserva una sola apertura", async ({ canal }, testInfo) => {
    const fixture = await prepararFixtureR1A(`${testInfo.project.name}-retry`);
    try {
      const gate = new TurnoGatePage(canal.page);
      await gate.iniciarSesion(fixture.cajero);
      await canal.page.route("**/abrirTurnoOperativoV1", (route) => route.abort("internetdisconnected"));
      await gate.abrir();
      await expect(canal.page.getByRole("heading", { name: "Abre tu turno" })).toBeVisible();
      await canal.page.unrouteAll({ behavior: "wait" });
      await gate.abrir();
      await esperarConfirmacionListener(canal.page);
      await esperarAperturaConfirmada(fixture.empresaId, fixture.cajero.uid);
      await expect.poll(() => contarTurnosAbiertos(fixture.empresaId, fixture.cajero.uid)).toBe(1);
    } finally {
      await limpiarFixtureR1A(fixture);
    }
  });

  test("permiso revocado durante la acción no crea turno", async ({ canal }, testInfo) => {
    const fixture = await prepararFixtureR1A(`${testInfo.project.name}-revocacion`);
    try {
      const gate = new TurnoGatePage(canal.page);
      await gate.iniciarSesion(fixture.cajero);
      await adminE2E().db.collection("membresias").doc(`${fixture.empresaId}_${fixture.cajero.uid}`).update({ permisos: ["sell"] });
      await gate.abrir();
      await expect.poll(() => contarTurnosAbiertos(fixture.empresaId, fixture.cajero.uid)).toBe(0);
    } finally {
      await limpiarFixtureR1A(fixture);
    }
  });

  test("Electron invoca el contrato Callable de apertura", async ({ canal }, testInfo) => {
    test.skip(testInfo.project.name !== "electron", "Contrato específico del renderer Electron.");
    const fixture = await prepararFixtureR1A("electron-contrato");
    let invocoCallable = false;
    try {
      canal.page.on("request", (request) => { if (request.url().includes("abrirTurnoOperativoV1")) invocoCallable = true; });
      const gate = new TurnoGatePage(canal.page);
      await gate.iniciarSesion(fixture.cajero);
      await gate.abrir();
      await esperarAperturaConfirmada(fixture.empresaId, fixture.cajero.uid);
      expect(invocoCallable).toBe(true);
    } finally {
      await limpiarFixtureR1A(fixture);
    }
  });

  test("historial conserva aislamiento cross-tenant", async ({ canal, browser }, testInfo) => {
    test.skip(testInfo.project.name !== "web", "El aislamiento entre dos contextos se certifica en web.");
    const propia = await prepararFixtureR1A("historial-propio");
    const ajena = await prepararFixtureR1A("historial-ajeno");
    const canalAjeno = await abrirWeb(browser);
    try {
      const gatePropio = new TurnoGatePage(canal.page);
      await gatePropio.iniciarSesion(propia.admin);
      const shifts = new ShiftsModulePage(canal.page);
      await shifts.abrirModulo();
      await shifts.abrirTurno();
      await esperarAperturaConfirmada(propia.empresaId, propia.admin.uid);

      const gateAjeno = new TurnoGatePage(canalAjeno.page);
      await gateAjeno.iniciarSesion(ajena.cajero);
      await gateAjeno.abrir();
      await esperarAperturaConfirmada(ajena.empresaId, ajena.cajero.uid);

      await expect(canal.page.getByText(propia.admin.nombre)).toBeVisible();
      await expect(canal.page.getByText(ajena.cajero.nombre)).toHaveCount(0);
    } finally {
      await canalAjeno.cerrar();
      await limpiarFixtureR1A(propia);
      await limpiarFixtureR1A(ajena);
    }
  });
});
