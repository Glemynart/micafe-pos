import { test, expect, type APIRequestContext } from "@playwright/test";

const operador = { email: "operador@e2e.local", password: "Emulador-2026" };

async function iniciarSesion(page: import("@playwright/test").Page) {
  await page.goto("/backoffice/login");
  await page.getByLabel("Correo").fill(operador.email);
  await page.getByLabel("Contraseña").fill(operador.password);
  const solicitudContexto = page.waitForRequest((request) => request.url().includes("consultarContextoPlataforma"));
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("consultarContextoPlataforma") && response.status() === 200),
    page.getByRole("button", { name: "Ingresar al Backoffice" }).click(),
  ]);
  const autorizacion = (await solicitudContexto).headers()["authorization"];
  if (!autorizacion) throw new Error("No se obtuvo el token del operador E2E.");
  return autorizacion;
}

/** Crea una empresa real vía el Bootstrap canónico: nace con Suscripción `trialing` (plan_profesional v1). */
async function crearEmpresa(page: import("@playwright/test").Page, empresaId: string, nombreComercial: string) {
  await page.goto("/backoffice/empresas/nueva");
  await page.getByLabel("ID opaco de Empresa").fill(empresaId);
  await page.getByLabel("Nombre comercial").fill(nombreComercial);
  await page.getByLabel("Nombre del administrador").fill("Admin PR5");
  await page.getByLabel("Plan publicado").click();
  await page.getByRole("option", { name: /PROFESIONAL/ }).click();
  await page.getByRole("button", { name: "Solicitar Bootstrap canónico" }).click();
  const dialogo = page.getByRole("dialog", { name: "Credencial inicial emitida" });
  await expect(dialogo).toContainText("PIN temporal");
  await dialogo.getByRole("button", { name: "Ya lo entregué, cerrar" }).click();
  await expect(page).toHaveURL(new RegExp(`/backoffice/empresas/${empresaId}$`));
}

/** Lleva el agregado a `canceled` mediante el callable comercial real, nunca por Firestore directo. */
async function cancelarSuscripcionCanonica(request: APIRequestContext, autorizacion: string, empresaId: string) {
  const respuesta = await request.post("http://127.0.0.1:5001/micafe-pos/us-central1/ejecutarComandoComercialSaas", {
    headers: { Authorization: autorizacion },
    data: {
      data: {
        tipo: "TransicionarSuscripcion",
        entrada: {
          commandId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          correlationId: crypto.randomUUID(),
          causationId: null,
          motivoCodigo: "E2E_CANCELACION_PARA_REACTIVACION",
          empresaId,
          destino: "canceled",
          expectedRevision: 1,
        },
      },
    },
  });
  expect(respuesta.ok()).toBeTruthy();
}

test("el listado de Suscripciones muestra estado, plan contratado y trial de una empresa recién creada", async ({ page }) => {
  const empresaId = `empresa_pr5_list_${Date.now()}`;
  await iniciarSesion(page);
  await crearEmpresa(page, empresaId, "Café PR5 Listado");

  await page.goto("/backoffice/suscripciones");
  const fila = page.getByRole("row").filter({ hasText: empresaId });
  await expect(fila).toBeVisible();
  await expect(fila.getByText("trialing", { exact: true })).toBeVisible();
  await expect(fila.getByText("plan_profesional")).toBeVisible();
  await expect(fila.getByText("v1")).toBeVisible();

  await fila.getByRole("link", { name: "Ver" }).click();
  await expect(page).toHaveURL(new RegExp(`/backoffice/suscripciones/${empresaId}$`));
});

test("la ficha de Suscripción respeta el grafo canónico al suspender/reactivar y lo registra en el historial", async ({ page }) => {
  const empresaId = `empresa_pr5_lifecycle_${Date.now()}`;
  await iniciarSesion(page);
  await crearEmpresa(page, empresaId, "Café PR5 Lifecycle");

  await page.goto(`/backoffice/suscripciones/${empresaId}`);
  await expect(page.getByText("trialing", { exact: true }).first()).toBeVisible();

  // trialing → suspended (admisible en transicionesSuscripcion)
  await page.getByRole("button", { name: "Suspender" }).click();
  await expect(page.getByText("Suscripción actualizada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reactivar" })).toBeVisible();

  // suspended → active
  await page.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByText("Suscripción actualizada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspender" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Renovar período" })).toBeVisible();

  const historial = page.locator("text=Historial").locator("..").locator("..");
  await expect(historial.getByText("SUSCRIPCION_SUSPENDIDA", { exact: true })).toBeVisible();
  await expect(historial.getByText("SUSCRIPCION_ACTIVADA", { exact: true })).toBeVisible();
});

test("la ficha permite reactivar una Suscripción canceled mediante la transición canónica", async ({ page, request }) => {
  const empresaId = `empresa_pr5_reactivar_cancelada_${Date.now()}`;
  const autorizacion = await iniciarSesion(page);
  await crearEmpresa(page, empresaId, "Café PR5 Reactivación cancelada");
  await cancelarSuscripcionCanonica(request, autorizacion, empresaId);

  await page.goto(`/backoffice/suscripciones/${empresaId}`);
  await expect(page.getByText("canceled", { exact: true }).first()).toBeVisible();
  const reactivar = page.getByRole("button", { name: "Reactivar" });
  await expect(reactivar).toBeEnabled();
  await reactivar.click();
  await expect(page.getByText("Suscripción actualizada")).toBeVisible();
  await expect(page.getByText("active", { exact: true }).first()).toBeVisible();

  const historial = page.locator("text=Historial").locator("..").locator("..");
  await expect(historial.getByText("SUSCRIPCION_ACTIVADA", { exact: true })).toBeVisible();
});

test("cambio de plan, renovación y programación/revocación de cancelación reutilizan los comandos comerciales canónicos", async ({ page }) => {
  const empresaId = `empresa_pr5_comercial_${Date.now()}`;
  await iniciarSesion(page);
  await crearEmpresa(page, empresaId, "Café PR5 Comercial");
  await page.goto(`/backoffice/suscripciones/${empresaId}`);

  // Activar desde trial para habilitar cambio de plan / renovación / cancelación.
  await page.getByRole("button", { name: "Suspender" }).click();
  await expect(page.getByText("Suscripción actualizada")).toBeVisible();
  await page.getByRole("button", { name: "Reactivar" }).click();
  await expect(page.getByRole("button", { name: "Renovar período" })).toBeVisible();

  await page.getByRole("button", { name: "Cambiar plan" }).click();
  let dialogo = page.getByRole("dialog", { name: "Cambiar referencia de plan" });
  await dialogo.getByLabel("Plan publicado").fill("plan_profesional");
  await dialogo.getByLabel("Versión").fill("1");
  await dialogo.getByRole("button", { name: "Confirmar comando" }).click();
  await expect(page.getByText("Referencia contractual actualizada")).toBeVisible();

  await page.getByRole("button", { name: "Renovar período" }).click();
  dialogo = page.getByRole("dialog", { name: "Renovar período" });
  const hoy = new Date().toISOString().slice(0, 10);
  const finPeriodo = new Date(Date.now() + 200 * 86_400_000).toISOString().slice(0, 10);
  await dialogo.getByLabel("Inicio del período").fill(hoy);
  await dialogo.getByLabel("Fin del período").fill(finPeriodo);
  await dialogo.getByRole("button", { name: "Confirmar comando" }).click();
  await expect(page.getByText("Referencia contractual actualizada")).toBeVisible();

  const fechaCancelacion = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  await page.getByRole("button", { name: "Programar cancelación" }).click();
  dialogo = page.getByRole("dialog", { name: "Programar cancelación" });
  await dialogo.getByLabel("Fecha de cancelación").fill(fechaCancelacion);
  await dialogo.getByRole("button", { name: "Confirmar comando" }).click();
  await expect(page.getByText(`Cancelación programada`)).toBeVisible();

  await page.getByRole("button", { name: "Revocar cancelación" }).click();
  await expect(page.getByText("Cancelación programada revocada")).toBeVisible();
  await expect(page.getByRole("button", { name: "Programar cancelación" })).toBeVisible();

  const historial = page.locator("text=Historial").locator("..").locator("..");
  await expect(historial.getByText("SUSCRIPCION_PLAN_CAMBIADO", { exact: true })).toBeVisible();
  await expect(historial.getByText("SUSCRIPCION_RENOVADA", { exact: true })).toBeVisible();
  await expect(historial.getByText("SUSCRIPCION_CANCELACION_PROGRAMADA", { exact: true })).toBeVisible();
  await expect(historial.getByText("SUSCRIPCION_CANCELACION_REVOCADA", { exact: true })).toBeVisible();
});

test("sin gobernanza comercial la ficha de Suscripción degrada a solo lectura", async ({ page }) => {
  const empresaId = `empresa_pr5_readonly_${Date.now()}`;
  await iniciarSesion(page);
  await crearEmpresa(page, empresaId, "Café PR5 Readonly");
  await page.goto(`/backoffice/suscripciones/${empresaId}`);
  await expect(page.getByRole("button", { name: "Suspender" })).toBeVisible();

  await page.route("**/consultarContextoPlataforma", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: { uid: "operador-solo-consulta", estado: "ACTIVO", facultades: ["PLATAFORMA_CONSULTAR"], versionAutorizacion: 1 } }),
    });
  });
  await page.reload();

  await expect(page.getByRole("button", { name: "Suspender" })).toHaveCount(0);
  await expect(page.getByText("Tu contexto no posee gobernanza comercial.")).toBeVisible();
});
