import { test, expect } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { prepararFixtureP001, limpiarFixtureP001 } from "../fixtures/datos";
import { adminP001, verificarSaludP001 } from "../fixtures/entorno";

test.describe("P0-01 — certificación operativa en emuladores", () => {
  test("inicia sesión, resuelve el tenant y muestra espacios y módulos explícitos", async ({ page }, testInfo) => {
    await verificarSaludP001();
    const fixture = await prepararFixtureP001(testInfo.testId);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const notFoundResponses: string[] = [];
    const unauthorizedResponses: string[] = [];
    const forbiddenResponses: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() === 404) notFoundResponses.push(response.url());
      if (response.status() === 401) unauthorizedResponses.push(`${response.request().method()} ${response.url()}`);
      if (response.status() === 403) forbiddenResponses.push(`${response.request().method()} ${response.url()}`);
    });

    try {
      await test.step("login operativo", async () => {
        await page.goto("/admin/login?from=%2Fadmin");
        await page.locator("#user").fill(fixture.admin.codigo);
        await page.locator("#pass").fill(fixture.admin.pin);
        await page.getByRole("button", { name: "Ingresar" }).click();
        await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
      });

      await test.step("navegación PWA según el Plan", async () => {
        const bottomNav = page.locator("nav.fixed.bottom-0");
        await expect(bottomNav.getByRole("link", { name: "Reservas", exact: true })).toBeVisible();
        await expect(bottomNav.getByRole("link", { name: "Finanzas", exact: true })).toBeVisible();
        await expect(bottomNav.getByRole("link", { name: "Turnos", exact: true })).toBeVisible();
      });

      await test.step("configuración y POS tenant-aware", async () => {
        await page.goto("/pos");
        await expect(page.locator("aside")).toBeVisible();
        await expect(page.getByText(fixture.espacios[0].nombre, { exact: true })).toBeVisible();
        for (const modulo of [
          "Vender",
          "Inventario",
          "Compras",
          "Clientes",
          "Finanzas",
          "Reservas Web",
          "Turnos",
          "Mermas",
        ]) {
          await expect(page.getByRole("button", { name: modulo, exact: true })).toBeVisible();
        }
        await expect(page.getByRole("button", { name: "Turnos", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Salón", exact: true })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Configuración", exact: true })).toHaveCount(0);
      });

      await test.step("selector de espacios", async () => {
        const activeSpaceButton = page.locator("aside").getByRole("button").filter({ hasText: fixture.espacios[0].nombre });
        await activeSpaceButton.click();
        await expect(page.getByRole("menuitem", { name: fixture.espacios[1].nombre })).toBeVisible();
        await page.keyboard.press("Escape");
      });

      await test.step("activación de Finanzas en el POS/PWA", async () => {
        await page.getByRole("button", { name: "Finanzas", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Finanzas y Tesorería", exact: true })).toBeVisible();

        const cuentas = await adminP001().db.collection("cuentas_bancarias")
          .where("empresaId", "==", fixture.empresaId)
          .get();
        expect(cuentas.empty, "Finanzas no debe crear cuentas desde el cliente").toBe(true);
      });

      await test.step("activación de Finanzas en Backoffice tenant-aware", async () => {
        await page.goto("/admin/finanzas");
        await expect(page.getByRole("heading", { name: "Finanzas", exact: true })).toBeVisible();
      });
    } finally {
      await page.close();
      appendFileSync(testInfo.outputPath("runtime.json"), `${JSON.stringify({
        empresaId: fixture.empresaId,
        consoleErrors,
        pageErrors,
        notFoundResponses,
        unauthorizedResponses,
        forbiddenResponses,
      }, null, 2)}\n`);
      const ruleErrors = consoleErrors.filter((message) => /PERMISSION_DENIED|permission-denied|Missing or insufficient permissions/i.test(message));
      expect(consoleErrors, `no debe haber errores de consola; 401=${unauthorizedResponses.join(", ")}; 403=${forbiddenResponses.join(", ")}`).toEqual([]);
      expect(ruleErrors, "no debe haber errores de Rules").toEqual([]);
      expect(pageErrors, "no debe haber errores de página").toEqual([]);
      expect(notFoundResponses, "no debe haber respuestas 404").toEqual([]);
      expect(unauthorizedResponses, "no debe haber respuestas 401").toEqual([]);
      expect(forbiddenResponses, "no debe haber respuestas 403").toEqual([]);
      await limpiarFixtureP001(fixture);
    }
  });
});
