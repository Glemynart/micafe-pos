import { test, expect } from "@playwright/test";

const operador = { email: "operador@e2e.local", password: "Emulador-2026" };

// Mismo patrón que bootstrap.spec.ts: la señal de sesión establecida es la
// respuesta del contexto de plataforma, no el redirect del login.
async function iniciarSesion(page: import("@playwright/test").Page) {
  await page.goto("/backoffice/login");
  await page.getByLabel("Correo").fill(operador.email);
  await page.getByLabel("Contraseña").fill(operador.password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("consultarContextoPlataforma") && response.status() === 200),
    page.getByRole("button", { name: "Ingresar al Backoffice" }).click(),
  ]);
}

/** Crea una empresa real vía el Bootstrap canónico (mismo flujo que PR3) para tener una ficha sobre la que ejercer PR4. */
async function crearEmpresa(page: import("@playwright/test").Page, empresaId: string, nombreComercial: string) {
  await page.goto("/backoffice/empresas/nueva");
  await page.getByLabel("ID opaco de Empresa").fill(empresaId);
  await page.getByLabel("Nombre comercial").fill(nombreComercial);
  await page.getByLabel("Nombre del administrador").fill("Admin PR4");
  await page.getByLabel("Plan publicado").click();
  await page.getByRole("option", { name: /PROFESIONAL/ }).click();
  await page.getByRole("button", { name: "Solicitar Bootstrap canónico" }).click();
  const dialogo = page.getByRole("dialog", { name: "Credencial inicial emitida" });
  await expect(dialogo).toContainText("PIN temporal");
  await dialogo.getByRole("button", { name: "Ya lo entregué, cerrar" }).click();
  await expect(page).toHaveURL(new RegExp(`/backoffice/empresas/${empresaId}$`));
}

test("el listado de Empresas encuentra la empresa recién creada por nombre y por estado", async ({ page }) => {
  const empresaId = `empresa_pr4_list_${Date.now()}`;
  await iniciarSesion(page);
  await crearEmpresa(page, empresaId, "Café PR4 Listado");

  await page.goto("/backoffice/empresas");
  await page.getByPlaceholder("Buscar por nombre, ID u owner UID").fill("Café PR4 Listado");
  await expect(page.getByRole("link").filter({ hasText: empresaId })).toBeVisible();

  await page.getByPlaceholder("Buscar por nombre, ID u owner UID").fill("");
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "trial" }).click();
  await expect(page.getByRole("link").filter({ hasText: empresaId })).toBeVisible();
});

test("la ficha de empresa permite editar el nombre comercial y lo refleja de inmediato", async ({ page }) => {
  const empresaId = `empresa_pr4_edit_${Date.now()}`;
  await iniciarSesion(page);
  await crearEmpresa(page, empresaId, "Café PR4 Original");

  await page.getByRole("button", { name: "Editar" }).click();
  const dialogo = page.getByRole("dialog", { name: "Editar datos administrativos" });
  const input = dialogo.getByLabel("Nombre comercial");
  await input.fill("Café PR4 Renombrado");
  await dialogo.getByRole("button", { name: "Guardar cambios" }).click();

  await expect(page.getByText("Nombre comercial actualizado")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Café PR4 Renombrado" })).toBeVisible();
});

test("el lifecycle permite suspender, reactivar y cancelar reutilizando TransicionarEmpresa; el historial registra cada hecho", async ({ page }) => {
  const empresaId = `empresa_pr4_lifecycle_${Date.now()}`;
  await iniciarSesion(page);
  await crearEmpresa(page, empresaId, "Café PR4 Lifecycle");

  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reactivar" })).toBeDisabled();

  await page.getByRole("button", { name: "Suspender" }).click();
  await expect(page.getByText("Empresa transicionada a suspendida")).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspender" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reactivar" })).toBeEnabled();

  await page.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByText("Empresa transicionada a activa")).toBeVisible();

  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("alertdialog", { name: "¿Cancelar esta empresa?" }).getByRole("button", { name: "Cancelar empresa" }).click();
  await expect(page.getByText("Empresa transicionada a cancelada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();

  const historial = page.locator("text=Historial").locator("..").locator("..");
  await expect(historial.getByText("EMPRESA_SUSPENDIDA", { exact: true })).toBeVisible();
  await expect(historial.getByText("EMPRESA_ACTIVADA", { exact: true })).toBeVisible();
  await expect(historial.getByText("EMPRESA_CANCELADA", { exact: true })).toBeVisible();
});

test("readiness y módulos de la ficha reflejan el diagnóstico B1, y sin gobernanza de lifecycle no aparecen acciones de edición ni transición", async ({ page }) => {
  const empresaId = `empresa_pr4_readonly_${Date.now()}`;
  await iniciarSesion(page);
  await crearEmpresa(page, empresaId, "Café PR4 Readonly");
  await expect(page.getByText("Readiness operativa")).toBeVisible();
  await expect(page.getByText("Módulos habilitados")).toBeVisible();

  // Simula un operador sin LIFECYCLE_GOBERNAR: la ficha debe degradar a solo lectura.
  await page.route("**/consultarContextoPlataforma", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: { uid: "operador-solo-consulta", estado: "ACTIVO", facultades: ["PLATAFORMA_CONSULTAR"], versionAutorizacion: 1 } }),
    });
  });
  await page.reload();

  await expect(page.getByRole("button", { name: "Editar" })).toHaveCount(0);
  await expect(page.getByText("Tu contexto no posee gobernanza de lifecycle.").first()).toBeVisible();
});
