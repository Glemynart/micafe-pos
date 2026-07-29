import { test, expect } from "../fixtures/test";
import { limpiarFixtureR1A, prepararFixtureR1A } from "../fixtures/datos";
import { esperarAperturaConfirmada, contarTurnosAbiertos } from "../helpers/firestore-admin";
import { esperarConfirmacionListener } from "../helpers/espera-listener";
import { TurnoGatePage } from "../pages/turno-gate.page";

test.describe("R1-A apertura server-authoritative", () => {
  test("TurnoGate confirma la apertura por listener con un único hecho autoritativo", async ({ canal }, testInfo) => {
    const fixture = await prepararFixtureR1A(`${testInfo.project.name}-turno-gate`);
    try {
      const gate = new TurnoGatePage(canal.page);
      await gate.iniciarSesion(fixture.cajero);
      await gate.abrir();
      await esperarConfirmacionListener(canal.page);
      await esperarAperturaConfirmada(fixture.empresaId, fixture.cajero.uid);
      await expect(canal.page.getByRole("heading", { name: "Abre tu turno" })).toHaveCount(0);
    } finally {
      await limpiarFixtureR1A(fixture);
    }
  });

  test("doble envío mantiene un único turno confirmado", async ({ canal }, testInfo) => {
    const fixture = await prepararFixtureR1A(`${testInfo.project.name}-doble-envio`);
    try {
      const gate = new TurnoGatePage(canal.page);
      await gate.iniciarSesion(fixture.cajero);
      await canal.page.getByPlaceholder("0").fill("150000");
      await canal.page.getByRole("button", { name: "Iniciar Turno" }).dblclick();
      await esperarConfirmacionListener(canal.page);
      await esperarAperturaConfirmada(fixture.empresaId, fixture.cajero.uid);
      await expect.poll(() => contarTurnosAbiertos(fixture.empresaId, fixture.cajero.uid)).toBe(1);
    } finally {
      await limpiarFixtureR1A(fixture);
    }
  });

  test("lifecycle no operativo no crea turno", async ({ canal }, testInfo) => {
    const fixture = await prepararFixtureR1A(`${testInfo.project.name}-suspendida`);
    try {
      const gate = new TurnoGatePage(canal.page);
      await gate.iniciarSesion(fixture.cajero);
      const { adminE2E } = await import("../fixtures/entorno");
      await adminE2E().db.collection("empresas").doc(fixture.empresaId).update({ estado: "suspendida" });
      await gate.abrir();
      await expect(canal.page.getByRole("heading", { name: "Abre tu turno" })).toBeVisible();
      await expect.poll(() => contarTurnosAbiertos(fixture.empresaId, fixture.cajero.uid)).toBe(0);
    } finally {
      await limpiarFixtureR1A(fixture);
    }
  });
});
