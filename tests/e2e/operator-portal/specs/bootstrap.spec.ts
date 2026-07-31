import { test, expect } from "@playwright/test";

const operador = { email: "operador@e2e.local", password: "Emulador-2026" };

// El login se hace sin `?from=`: con ese parámetro la URL de la propia pantalla
// de login termina en «/backoffice/empresas/nueva», así que la aserción de
// destino se cumplía sin haber navegado y el caso seguía corriendo contra la
// pantalla equivocada. La señal de sesión establecida es la respuesta del
// contexto de plataforma, no el redirect del login: ese redirect pasa por el
// Dashboard, que es la pantalla más pesada del Portal y nada tiene que ver con
// el Bootstrap. Al formulario se entra con una navegación explícita.
async function iniciarSesion(page: import("@playwright/test").Page) {
  await page.goto("/backoffice/login");
  await page.getByLabel("Correo").fill(operador.email);
  await page.getByLabel("Contraseña").fill(operador.password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("consultarContextoPlataforma") && response.status() === 200),
    page.getByRole("button", { name: "Ingresar al Backoffice" }).click(),
  ]);
  await page.goto("/backoffice/empresas/nueva");
  await expect(page.getByLabel("ID opaco de Empresa")).toBeVisible();
}

async function completarSolicitud(page: import("@playwright/test").Page, empresaId: string) {
  await page.getByLabel("ID opaco de Empresa").fill(empresaId);
  await page.getByLabel("Nombre comercial").fill("Café E2E Bootstrap");
  await page.getByLabel("Nombre del administrador").fill("Admin E2E");
  await page.getByLabel("Plan publicado").click();
  await page.getByRole("option", { name: /PROFESIONAL/ }).click();
}

test("Bootstrap real revela una vez la credencial inicial y redirige a la ficha", async ({ page }) => {
  const empresaId = `empresa_pr3_${Date.now()}`;
  await iniciarSesion(page);
  await completarSolicitud(page, empresaId);

  await page.getByRole("button", { name: "Solicitar Bootstrap canónico" }).click();
  const dialogo = page.getByRole("dialog", { name: "Credencial inicial emitida" });
  await expect(dialogo).toContainText("PIN temporal");
  await dialogo.getByRole("button", { name: "Ya lo entregué, cerrar" }).click();

  await expect(page).toHaveURL(new RegExp(`/backoffice/empresas/${empresaId}$`));
  await expect(page.getByRole("dialog", { name: "Credencial inicial emitida" })).toHaveCount(0);
});

test("un fallo recuperable reutiliza la misma solicitud y no vuelve a mostrar el PIN", async ({ page }) => {
  const empresaId = `empresa_pr3_retry_${Date.now()}`;
  const solicitudes: Record<string, unknown>[] = [];
  let intentos = 0;
  await page.route("**/solicitarBootstrapEmpresarialSaas", async (route) => {
    intentos += 1;
    solicitudes.push(JSON.parse(route.request().postData() ?? "{}").data);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: intentos === 1
          ? {
              provisionamientoId: "prov_e2e_recovery",
              empresaId,
              estado: "RETRYABLE_FAILURE",
              claimsEmitidos: false,
              idempotente: false,
              credencialInicial: { codigo: "cafe-e2e", pinTemporal: "654321" },
            }
          : {
              provisionamientoId: "prov_e2e_recovery",
              empresaId,
              estado: "COMPLETED",
              claimsEmitidos: true,
              idempotente: true,
              credencialInicial: { codigo: "cafe-e2e", pinTemporal: null },
            },
      }),
    });
  });

  await iniciarSesion(page);
  await completarSolicitud(page, empresaId);
  await page.getByRole("button", { name: "Solicitar Bootstrap canónico" }).click();

  const dialogo = page.getByRole("dialog", { name: "Credencial inicial emitida" });
  await expect(dialogo).toContainText("654321");
  await dialogo.getByRole("button", { name: "Ya lo entregué, cerrar" }).click();
  await expect(page.getByText("654321")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reintentar Bootstrap canónico" })).toBeEnabled();

  await page.getByRole("button", { name: "Reintentar Bootstrap canónico" }).click();
  await expect(page).toHaveURL(new RegExp(`/backoffice/empresas/${empresaId}$`));
  expect(solicitudes).toHaveLength(2);
  expect(solicitudes[1]).toEqual(solicitudes[0]);
  expect((solicitudes[1] as { idempotencyKey: string }).idempotencyKey).toBeTruthy();
});

test("con administrador existente, la solicitud envía ownerUid y omite nombreAdministrador", async ({ page }) => {
  const empresaId = `empresa_pr3_owner_${Date.now()}`;
  const ownerUid = "operador-e2e-capa4";
  const solicitudes: Record<string, unknown>[] = [];
  await page.route("**/solicitarBootstrapEmpresarialSaas", async (route) => {
    solicitudes.push(JSON.parse(route.request().postData() ?? "{}").data);
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          provisionamientoId: "prov_e2e_owner",
          empresaId,
          estado: "COMPLETED",
          claimsEmitidos: false,
          idempotente: false,
          credencialInicial: { codigo: "cafe-e2e-owner", pinTemporal: "112233" },
        },
      }),
    });
  });

  await iniciarSesion(page);
  await page.getByLabel("ID opaco de Empresa").fill(empresaId);
  await page.getByLabel("Nombre comercial").fill("Café E2E Owner");
  await page.getByLabel("El administrador ya tiene una cuenta de Firebase Auth").check();
  await page.getByLabel("UID del administrador inicial").fill(ownerUid);
  await page.getByLabel("Plan publicado").click();
  await page.getByRole("option", { name: /PROFESIONAL/ }).click();
  await page.getByRole("button", { name: "Solicitar Bootstrap canónico" }).click();

  const dialogo = page.getByRole("dialog", { name: "Credencial inicial emitida" });
  await expect(dialogo).toContainText("112233");
  await dialogo.getByRole("button", { name: "Ya lo entregué, cerrar" }).click();
  await expect(page).toHaveURL(new RegExp(`/backoffice/empresas/${empresaId}$`));

  expect(solicitudes).toHaveLength(1);
  expect(solicitudes[0].ownerUid).toBe(ownerUid);
  expect("nombreAdministrador" in solicitudes[0]).toBe(false);
});
