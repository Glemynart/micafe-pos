import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const projectId = process.env.OPERATOR_PORTAL_PROJECT_ID ?? "demo-operator-portal";
const functionsBaseUrl = process.env.OPERATOR_PORTAL_FUNCTIONS_BASE_URL
  ?? `http://127.0.0.1:5001/${projectId}/us-central1`;
const operatorEmail = "operador@e2e.local";
const operatorPassword = "Emulador-2026";
const privacyPermission = "PRIVACIDAD_RECLAMOS_TRAMITAR";

const adminApp = getApps().find((app) => app.name === "privacy-claims-e2e")
  ?? initializeApp({ projectId }, "privacy-claims-e2e");
const auth = getAuth(adminApp);
const db = getFirestore(adminApp);

function fechaBogota(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function idCaso(empresaId: string, consecutivo: string): string {
  return createHash("sha256").update(JSON.stringify([empresaId, consecutivo])).digest("hex");
}

async function existeUsuarioAuth(uid: string): Promise<boolean> {
  try {
    await auth.getUser(uid);
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") return false;
    throw error;
  }
}

async function iniciarSesion(page: Page, email = operatorEmail, password = operatorPassword) {
  await page.goto("/backoffice/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("consultarContextoPlataforma") && response.status() === 200),
    page.getByRole("button", { name: "Ingresar al Backoffice" }).click(),
  ]);
}

async function crearFixture() {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const empresaA = `tenant_priv_a_${suffix}`;
  const empresaB = `tenant_priv_b_${suffix}`;
  const clienteA = `cliente_priv_a_${suffix}`;
  const clienteB = `cliente_priv_b_${suffix}`;
  await Promise.all([
    db.collection("empresas").doc(empresaA).set({ empresaId: empresaA, nombreComercial: "Fixture privacy A", estado: "ACTIVA" }),
    db.collection("empresas").doc(empresaB).set({ empresaId: empresaB, nombreComercial: "Fixture privacy B", estado: "ACTIVA" }),
    db.collection("clientes").doc(clienteA).set({ empresaId: empresaA, nombre: "Titular sintético A", creadoEn: Timestamp.now(), reclamosPrivacidadAbiertos: 0 }),
    db.collection("clientes").doc(clienteB).set({ empresaId: empresaB, nombre: "Titular sintético B", creadoEn: Timestamp.now(), reclamosPrivacidadAbiertos: 0 }),
  ]);
  return {
    empresaA, empresaB, clienteA, clienteB,
    cleanup: async () => {
      await Promise.all([
        db.recursiveDelete(db.collection("clientes").doc(clienteA)),
        db.recursiveDelete(db.collection("clientes").doc(clienteB)),
        db.collection("empresas").doc(empresaA).delete(),
        db.collection("empresas").doc(empresaB).delete(),
      ]);
    },
  };
}

test("Backoffice tramita un reclamo sintético de principio a fin y preserva el aislamiento entre tenants", async ({ page }, testInfo) => {
  const fixture = await crearFixture();
  const suffix = `${Date.now()}`;
  const operatorUid = `operator_priv_writer_${suffix}`;
  const operatorEmail = `operator-privacy-writer-${suffix}@e2e.local`;
  const operatorPassword = `E2e-${suffix}-Writer`;
  const consecutivo = `e2e-privacy-${suffix}`;
  const casoEmpresaA = idCaso(fixture.empresaA, consecutivo);
  const casoEmpresaB = idCaso(fixture.empresaB, consecutivo);
  const fecha = fechaBogota();
  let createdUser = false;

  try {
    await auth.createUser({ uid: operatorUid, email: operatorEmail, password: operatorPassword, displayName: "Operador E2E de privacidad" });
    createdUser = true;
    await auth.setCustomUserClaims(operatorUid, { saas: { operador: true, versionAutorizacion: 1, facultades: [privacyPermission] } });
    await db.collection("saas_operadores").doc(operatorUid).set({ uid: operatorUid, estado: "ACTIVO", facultades: [privacyPermission], versionAutorizacion: 1 });

    await iniciarSesion(page, operatorEmail, operatorPassword);
    await page.goto("/backoffice/privacidad");
    await expect(page.getByRole("heading", { name: "Reclamos de privacidad" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Registrar reclamo verificado" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("privacy-claims-empty-state.png"), fullPage: true });

    const registro = page.locator("form").nth(1);
    await registro.locator('[name="consecutivo"]').fill(consecutivo);
    await registro.locator('[name="empresaId"]').fill(fixture.empresaB);
    await registro.locator('[name="clienteId"]').fill(fixture.clienteA);
    await registro.locator('[name="identidadRef"]').fill(`identity-${suffix}`);
    await registro.locator('[name="instruccionRef"]').fill(`instruction-${suffix}`);
    await registro.locator('[name="trasladoRef"]').fill(`transfer-${suffix}`);
    await registro.locator('[name="recibido"]').fill(fecha);
    await registro.locator('[name="completo"]').fill(fecha);
    await registro.locator('[name="motivo"]').fill("Solicitud sintética de prueba; no contiene datos personales.");
    await registro.locator('[name="verificacion"]').check();
    await registro.getByRole("button", { name: "Registrar y anotar en la ficha" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("No se pudo completar la operación");
    expect((await db.collection("privacidad_reclamos").doc(casoEmpresaB).get()).exists).toBe(false);
    expect((await db.collection("clientes").doc(fixture.clienteA).get()).get("reclamosPrivacidadAbiertos")).toBe(0);

    await registro.locator('[name="empresaId"]').fill(fixture.empresaA);
    await registro.getByRole("button", { name: "Registrar y anotar en la ficha" }).click();
    await expect(page.locator('p[role="status"]')).toContainText("Reclamo registrado");
    await expect(page.getByText("Caso consultado: reclamo en trámite")).toBeVisible();
    await expect(page.getByText("Solicitud sintética de prueba; no contiene datos personales.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("privacy-claims-open-synthetic.png"), fullPage: true });

    const codigo = page.getByLabel("Código del reclamo");
    await expect(codigo).toHaveValue(casoEmpresaA);
    await page.getByLabel("Gestión realizada").selectOption("DOCUMENTAR_RESPUESTA");
    await page.getByLabel("Referencia de la comunicación").fill(`answer-${suffix}`);
    await page.getByLabel("Resultado de la respuesta o motivo de prórroga").fill("Se documentó respuesta sintética para validar el flujo.");
    await page.getByRole("button", { name: "Guardar constancia" }).click();
    const cerrar = page.getByRole("button", { name: "Cerrar reclamo" });
    await expect(cerrar).toBeEnabled();
    await cerrar.click();
    await expect(page.locator('p[role="status"]')).toContainText("Reclamo cerrado");
    await expect(page.getByText("Caso consultado: Resuelto")).toBeVisible();

    await codigo.fill("");
    await codigo.fill(casoEmpresaA);
    await page.getByRole("button", { name: "Consultar", exact: true }).click();
    await expect(page.getByText("Caso consultado: Resuelto")).toBeVisible();

    const [caso, clienteA, clienteB, anotacionesB] = await Promise.all([
      db.collection("privacidad_reclamos").doc(casoEmpresaA).get(),
      db.collection("clientes").doc(fixture.clienteA).get(),
      db.collection("clientes").doc(fixture.clienteB).get(),
      db.collection("clientes").doc(fixture.clienteB).collection("anotaciones_privacidad").get(),
    ]);
    expect(caso.get("estado")).toBe("RESUELTO");
    expect(caso.get("empresaId")).toBe(fixture.empresaA);
    expect(clienteA.get("reclamosPrivacidadAbiertos")).toBe(0);
    expect(clienteB.get("reclamosPrivacidadAbiertos")).toBe(0);
    expect(anotacionesB.size).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("privacy-claims-resolved-synthetic.png"), fullPage: true });
  } finally {
    await Promise.all([
      db.collection("privacidad_reclamos").doc(casoEmpresaA).delete(),
      db.collection("privacidad_reclamos").doc(casoEmpresaB).delete(),
      fixture.cleanup(),
      db.collection("saas_operadores").doc(operatorUid).delete(),
      ...(createdUser ? [auth.deleteUser(operatorUid)] : []),
    ]);
    const remaining = await Promise.all([
      db.collection("privacidad_reclamos").doc(casoEmpresaA).get(),
      db.collection("privacidad_reclamos").doc(casoEmpresaB).get(),
      db.collection("empresas").doc(fixture.empresaA).get(),
      db.collection("empresas").doc(fixture.empresaB).get(),
      db.collection("clientes").doc(fixture.clienteA).get(),
      db.collection("clientes").doc(fixture.clienteB).get(),
      db.collection("saas_operadores").doc(operatorUid).get(),
    ]);
    expect(remaining.every((snapshot) => !snapshot.exists)).toBe(true);
    if (createdUser) expect(await existeUsuarioAuth(operatorUid)).toBe(false);
  }
});

test("operador sin facultad no ve el trámite ni puede invocar la callable", async ({ page, request }: { page: Page; request: APIRequestContext }) => {
  const fixture = await crearFixture();
  const suffix = `${Date.now()}`;
  const uid = `operator_priv_readonly_${suffix}`;
  const email = `operator-privacy-${suffix}@e2e.local`;
  const password = `Emu-${suffix}-Only`;
  const consecutivo = `denied-privacy-${suffix}`;
  const casoId = idCaso(fixture.empresaA, consecutivo);
  const facultades = ["PLATAFORMA_CONSULTAR"];
  let createdUser = false;

  try {
    const user = await auth.createUser({ uid, email, password, displayName: "Operador E2E solo consulta" });
    createdUser = true;
    await auth.setCustomUserClaims(uid, { saas: { operador: true, versionAutorizacion: 1, facultades } });
    await db.collection("saas_operadores").doc(uid).set({ uid, estado: "ACTIVO", facultades, versionAutorizacion: 1 });

    let authorization = "";
    const contextRequest = page.waitForRequest((candidate) => candidate.url().includes("consultarContextoPlataforma"));
    await iniciarSesion(page, email, password);
    authorization = (await contextRequest).headers()["authorization"] ?? "";
    expect(authorization).toMatch(/^Bearer\s+\S+/);
    await page.goto("/backoffice/privacidad");
    await expect(page.getByText("Tu usuario no tiene permiso para tramitar reclamos de privacidad.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Registrar y anotar en la ficha" })).toHaveCount(0);

    const response = await request.post(`${functionsBaseUrl}/tramitarReclamoPrivacidadSaas`, {
      headers: { authorization, "content-type": "application/json" },
      data: { data: {
        accion: "REGISTRAR", consecutivo, empresaId: fixture.empresaA, clienteId: fixture.clienteA,
        identidadRef: `identity-${suffix}`, instruccionRef: `instruction-${suffix}`, trasladoRef: `transfer-${suffix}`,
        recibido: fechaBogota(), completo: fechaBogota(), motivo: "Prueba sintética de denegación.", verificacionConfirmada: true,
      } },
    });
    expect(response.status()).toBe(403);
    const denied = await response.json() as { error?: { status?: string } };
    expect(denied.error?.status).toBe("PERMISSION_DENIED");
    expect((await db.collection("privacidad_reclamos").doc(casoId).get()).exists).toBe(false);
  } finally {
    await Promise.all([
      db.collection("privacidad_reclamos").doc(casoId).delete(),
      db.collection("saas_operadores").doc(uid).delete(),
      fixture.cleanup(),
      ...(createdUser ? [auth.deleteUser(uid)] : []),
    ]);
    const remaining = await Promise.all([
      db.collection("privacidad_reclamos").doc(casoId).get(),
      db.collection("saas_operadores").doc(uid).get(),
      db.collection("empresas").doc(fixture.empresaA).get(),
      db.collection("empresas").doc(fixture.empresaB).get(),
      db.collection("clientes").doc(fixture.clienteA).get(),
      db.collection("clientes").doc(fixture.clienteB).get(),
    ]);
    expect(remaining.every((snapshot) => !snapshot.exists)).toBe(true);
    if (createdUser) expect(await existeUsuarioAuth(uid)).toBe(false);
  }
});
