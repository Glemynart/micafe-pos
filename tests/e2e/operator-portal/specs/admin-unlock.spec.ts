import { expect, test } from "@playwright/test";
import { getApps, initializeApp } from "firebase-admin/app";
import { Timestamp, getFirestore } from "firebase-admin/firestore";

function db() {
  if (!getApps().length) initializeApp({ projectId: process.env.OPERATOR_PORTAL_PROJECT_ID ?? "demo-operator-portal" });
  return getFirestore();
}

test("diagnostica y desbloquea el administrador inicial", async ({ page }) => {
  const empresaId = `empresa_pr6_unlock_${Date.now()}`;
  await page.goto("/backoffice/login");
  await page.getByLabel("Correo").fill("operador@e2e.local");
  await page.getByLabel("Contraseña").fill("Emulador-2026");
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("consultarContextoPlataforma") && response.status() === 200),
    page.getByRole("button", { name: "Ingresar al Backoffice" }).click(),
  ]);
  await page.goto("/backoffice/empresas/nueva");
  await page.getByLabel("ID opaco de Empresa").fill(empresaId);
  await page.getByLabel("Nombre comercial").fill("Cafe PR6 Desbloqueo");
  await page.getByLabel("Nombre del administrador").fill("Admin PR6");
  await page.getByLabel("Plan publicado").click();
  await page.getByRole("option", { name: /PROFESIONAL/ }).click();
  await expect(page.getByRole("button", { name: /Solicitar Bootstrap/ })).toBeEnabled();
  await page.getByRole("button", { name: "Solicitar Bootstrap canónico" }).click();
  await page.getByRole("dialog", { name: "Credencial inicial emitida" }).getByRole("button", { name: "Ya lo entregué, cerrar" }).click();
  const store = db();
  const credenciales = await store.collection("credenciales_operativas").where("empresaId", "==", empresaId).limit(1).get();
  await credenciales.docs[0].ref.update({ fallosConsecutivos: 0, bloqueadoHasta: Timestamp.fromMillis(Date.now() + 60_000) });
  await page.reload();
  const estadoAcceso = page.locator("div").filter({ hasText: /^Estado de accesoBLOQUEADO$/ });
  await expect(estadoAcceso.getByText("BLOQUEADO", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Desbloquear administrador" }).click();
  await page.getByRole("alertdialog", { name: "Desbloquear administrador inicial" }).getByRole("button", { name: "Desbloquear administrador" }).click();
  await expect(page.getByText("Administrador inicial desbloqueado")).toBeVisible();
  const credencial = (await credenciales.docs[0].ref.get()).data()!;
  expect(credencial.fallosConsecutivos).toBe(0);
  expect(credencial.bloqueadoHasta).toBeNull();
  const audit = await store.collection("saas_auditoria").where("empresaObjetivoId", "==", empresaId).where("tipo", "==", "CREDENCIAL_INICIAL_DESBLOQUEADA").get();
  expect(audit.size).toBe(1);
});
