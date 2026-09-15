import { expect, test } from "@playwright/test";

const operador = { email: "operador@e2e.local", password: "Emulador-2026" };

async function iniciarSesion(page: import("@playwright/test").Page) {
  await page.goto("/backoffice/login");
  await page.getByLabel("Correo").fill(operador.email);
  await page.getByLabel("Contraseña").fill(operador.password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("consultarContextoPlataforma") && response.status() === 200),
    page.getByRole("button", { name: "Ingresar al Backoffice" }).click(),
  ]);
}

test("el operador crea y publica una versión anual por los callables comerciales canónicos", async ({ page }) => {
  const planId = `plan_e2e_${Date.now()}`;
  await iniciarSesion(page);
  await page.goto("/backoffice/planes");

  await page.getByRole("button", { name: "Nuevo plan" }).click();
  let dialogo = page.getByRole("dialog", { name: "Crear plan" });
  await dialogo.getByLabel("ID del plan").fill(planId);
  await dialogo.getByLabel("Código").fill("E2E_PLAN");
  await dialogo.getByLabel("Capacidades (separadas por coma)").fill("sell, inventory");
  await dialogo.getByLabel("Límites (JSON)").fill("{}");
  await dialogo.getByRole("button", { name: "Crear borrador" }).click();
  await expect(page.getByText("Plan creado en BORRADOR")).toBeVisible();

  const filaV1 = page.getByRole("row").filter({ hasText: planId });
  await expect(filaV1).toContainText("BORRADOR");
  await filaV1.getByRole("button", { name: "Nueva versión" }).click();
  dialogo = page.getByRole("dialog", { name: "Nueva versión de plan" });
  await dialogo.getByLabel("Periodicidad").selectOption("ANUAL");
  await dialogo.getByLabel("Precio").fill("1800000");
  await dialogo.getByLabel("Moneda").fill("COP");
  await dialogo.getByRole("button", { name: "Crear nueva versión" }).click();
  await expect(page.getByText("Nueva versión creada en BORRADOR")).toBeVisible();

  const filaV2 = page.getByRole("row").filter({ hasText: planId });
  await expect(filaV2).toContainText("2");
  await filaV2.getByRole("button", { name: "Publicar" }).click();
  await expect(page.getByText("Versión publicada")).toBeVisible();
  await expect(filaV2).toContainText("PUBLICADA");
});

test("la superficie de versionado no se expone sin COMERCIAL_GOBERNAR", async ({ page }) => {
  await iniciarSesion(page);
  await page.route("**/consultarContextoPlataforma", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ data: { uid: "operador-solo-consulta", estado: "ACTIVO", facultades: ["PLATAFORMA_CONSULTAR"], versionAutorizacion: 1 } }) });
  });
  await page.goto("/backoffice/planes");
  await expect(page.getByRole("button", { name: "Nuevo plan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nueva versión" })).toHaveCount(0);
});
