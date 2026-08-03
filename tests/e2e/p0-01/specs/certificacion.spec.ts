import { test, expect } from "@playwright/test";
import { appendFileSync } from "node:fs";
import { prepararFixtureP001, limpiarFixtureP001 } from "../fixtures/datos";
import { verificarSaludP001 } from "../fixtures/entorno";

test.describe("P0-01 — certificación operativa en emuladores", () => {
  test("inicia sesión, resuelve el tenant y muestra espacios y módulos explícitos", async ({ page }, testInfo) => {
    await verificarSaludP001();
    const fixture = await prepararFixtureP001(testInfo.testId);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const notFoundResponses: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() === 404) notFoundResponses.push(response.url());
    });

    try {
      await test.step("login operativo", async () => {
        await page.goto("/admin/login?from=%2Fadmin");
        await page.locator("#user").fill(fixture.admin.codigo);
        await page.locator("#pass").fill(fixture.admin.pin);
        await page.getByRole("button", { name: "Ingresar" }).click();
        await expect(page).toHaveURL(/\/admin(?:\?.*)?$/);
      });

      await test.step("configuración y POS tenant-aware", async () => {
        await page.goto("/pos");
        await expect(page.locator("aside")).toBeVisible();
        await expect(page.getByText(fixture.espacios[0].nombre, { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Vender", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Salón", exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Configuración", exact: true })).toBeVisible();
      });

      await test.step("selector de espacios", async () => {
        const activeSpaceButton = page.locator("aside").getByRole("button").filter({ hasText: fixture.espacios[0].nombre });
        await activeSpaceButton.click();
        await expect(page.getByRole("menuitem", { name: fixture.espacios[1].nombre })).toBeVisible();
      });
    } finally {
      await page.close();
      appendFileSync(testInfo.outputPath("runtime.json"), `${JSON.stringify({
        empresaId: fixture.empresaId,
        consoleErrors,
        pageErrors,
        notFoundResponses,
      }, null, 2)}\n`);
      expect(consoleErrors, "no debe haber errores de consola").toEqual([]);
      expect(pageErrors, "no debe haber errores de página").toEqual([]);
      expect(notFoundResponses, "no debe haber respuestas 404").toEqual([]);
      await limpiarFixtureP001(fixture);
    }
  });
});
