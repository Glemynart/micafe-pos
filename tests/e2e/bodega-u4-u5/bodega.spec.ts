import { test, expect } from "@playwright/test"
import bcrypt from "bcryptjs"
import { initializeApp, deleteApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { crearPlantillaConfiguracionRevision1 } from "../../../lib/configuracion/plantilla"

const projectId = process.env.E2E_BODEGA_PROJECT_ID ?? "demo-bodega-u4-u5-ui"
const runId = (process.env.E2E_BODEGA_RUN_ID ?? "manual").replace(/[^a-z0-9-]/gi, "-").slice(-30)
const empresaId = `bodega-e2e-${runId}`
const pin = "123456"
const pepper = process.env.OPERATIONAL_PIN_PEPPER ?? "bodega-u4-u5-local-pepper"
const vendedor = { uid: `vendedor-${runId}`, codigo: `bod-${runId.slice(-18)}-v`, rol: "vendedor", permisos: ["sell", "shifts"] }
const admin = { uid: `admin-${runId}`, codigo: `bod-${runId.slice(-18)}-a`, rol: "admin", permisos: ["sell", "shifts", "inventory", "clientes"] }
let app: ReturnType<typeof initializeApp>

test.beforeAll(async () => {
  app = initializeApp({ projectId }, `bodega-${runId}`)
  const auth = getAuth(app); const db = getFirestore(app)
  await db.collection("empresas").doc(empresaId).set({ estado: "trial", paisFiscal: "CO", esFundacional: true, nombre: "Bodega E2E" })
  const configuracion = crearPlantillaConfiguracionRevision1({ empresaId, vertical: "BODEGA_MVP1", nombreComercial: "Bodega E2E", creadaEn: new Date(), actualizadaEn: new Date(), ultimaMutacion: { actorTipo: "SYSTEM", actorId: "e2e", origen: "BOOTSTRAP", commandId: `seed-${runId}`, correlationId: `seed-${runId}` } })
  configuracion.modulos.habilitados = ["sell", "inventory", "clientes", "shifts"]
  configuracion.pos.metodosPagoHabilitados = ["efectivo", "transferencia"]
  configuracion.pos.permitirPagoMixto = false
  await db.collection("configuraciones").doc(empresaId).set(configuracion)
  await db.collection("planes").doc("mvp_comercial").collection("versiones").doc("1").set({ planId: "mvp_comercial", planVersion: 1, estado: "PUBLICADA", capacidades: configuracion.modulos.habilitados, limites: {}, periodicidad: "MENSUAL", grandfathered: false, revision: 1, schemaVersion: 1 })
  await db.collection("suscripciones").doc(empresaId).set({ empresaId, planId: "mvp_comercial", planVersion: 1, estado: "trialing", trialInicio: "2026-09-01", trialFin: "2099-09-30", revision: 1, schemaVersion: 1 })
  for (const actor of [vendedor, admin]) {
    await auth.getUser(actor.uid).catch(() => auth.createUser({ uid: actor.uid, displayName: actor.rol }))
    await auth.setCustomUserClaims(actor.uid, { empresaId, rol: actor.rol })
    await db.collection("usuarios").doc(actor.uid).set({ nombre: actor.rol === "admin" ? "Admin Bodega" : "Vendedor Bodega", username: actor.codigo, activo: true })
    await db.collection("membresias").doc(`${empresaId}_${actor.uid}`).set({ empresaId, uid: actor.uid, rol: actor.rol, permisos: actor.permisos, estado: "activa", activo: true })
    await db.collection("credenciales_operativas").doc(`${empresaId}_${actor.codigo}`).set({ empresaId, uid: actor.uid, codigo: actor.codigo, pinHash: await bcrypt.hash(`${pin}:${pepper}`, 8), activo: true, fallosConsecutivos: 0, bloqueadoHasta: null, requiereCambio: false })
  }
  await db.collection("espacios").doc("bodega-principal").set({ empresaId, nombre: "Bodega principal", activo: true })
  await db.collection("categorias").doc("abarrotes").set({ empresaId, nombre: "Abarrotes", activo: true })
  await db.collection("clientes").doc("cliente-e2e").set({ empresaId, nombre: "Tienda E2E", cedula: "900000001", telefono: "3000000000", tipoDocumento: "NIT", activo: true })
  await db.collection("productos").doc("producto-e2e").set({ id: "producto-e2e", empresaId, nombre: "Aceite E2E", categoriaId: "abarrotes", espacioId: "bodega-principal", unidad: "unidad", costo: 1000, stock: 20, stockMinimo: 2, secuenciaLedger: 1, activo: true })
  await db.collection("presentaciones_producto").doc("presentacion-e2e").set({ id: "presentacion-e2e", empresaId, productoId: "producto-e2e", nombre: "Caja x 2", factorUnidadBase: 2, precioCOP: 5000, activo: true })
  await db.collection("cuentas_bancarias").doc("bancolombia").set({ id: "bancolombia", empresaId, claveOperativa: "bancolombia", nombre: "Bancolombia", saldo: 0 })
  await db.collection("cuentas_bancarias").doc("caja-principal").set({ id: "caja-principal", empresaId, claveOperativa: "caja-principal", nombre: "Caja", saldo: 0 })
})

test.afterAll(async () => { await deleteApp(app) })

async function login(page: import("@playwright/test").Page, actor: typeof vendedor, adminRoute = false) {
  await page.goto(adminRoute ? "/admin/login" : "/pos")
  await page.locator(adminRoute ? "#user" : "#username").fill(actor.codigo)
  await page.locator(adminRoute ? "#pass" : "#password").fill(pin)
  await page.getByRole("button", { name: adminRoute ? "Ingresar" : "Iniciar Sesión" }).click()
}

test("vendedor completa transferencia y permanece fuera del backoffice", async ({ page }) => {
  await login(page, vendedor)
  await expect(page.getByText("Bodega móvil")).toBeVisible()
  await page.getByRole("button", { name: "Crear cliente" }).click()
  await page.getByLabel("Nombre comercial *").fill("Tienda Nueva E2E")
  await page.getByLabel("Documento *").fill("900000002")
  await page.getByLabel("Teléfono *").fill("3000000001")
  await page.locator("form").filter({ has: page.getByRole("heading", { name: "Nuevo cliente" }) }).getByRole("button", { name: "Crear cliente" }).click()
  await expect(page.getByRole("combobox").filter({ has: page.locator("option:checked", { hasText: "Tienda Nueva E2E" }) })).toBeVisible()
  await page.getByRole("button", { name: /Aceite E2E/ }).click()
  await expect(page.getByRole("button", { name: "Confirmar venta" })).toBeDisabled()
  await expect(page.getByText("Sin turno")).toBeVisible()
  await page.getByRole("button", { name: "transferencia" }).click()
  await page.getByRole("button", { name: "Confirmar venta" }).click()
  const resultado = page.getByText("Venta confirmada").locator("..")
  await expect(resultado).toBeVisible()
  await expect(resultado).toContainText("5.000")
  const db = getFirestore(app)
  const ventas = await db.collection("ventas").where("empresaId", "==", empresaId).get()
  expect(ventas.size).toBe(1)
  expect(ventas.docs[0]?.data().cajeroId).toBe(vendedor.uid)
  expect(ventas.docs[0]?.data().turnoId).toBeNull()
  expect(ventas.docs[0]?.data().clienteNombreSnapshot).toBe("Tienda Nueva E2E")
  await page.goto("/admin")
  await expect(page).toHaveURL(/\/admin\/login\?error=not_admin/)
})

test("administrador ve únicamente el backoffice Bodega necesario", async ({ page }) => {
  await login(page, admin, true)
  await expect(page.getByRole("heading", { name: "Centro de operación" })).toBeVisible()
  await page.goto("/pos")
  await expect(page).toHaveURL(/\/admin$/)
  await expect(page.getByRole("heading", { name: "Centro de operación" })).toBeVisible()
  await expect(page.locator(".theme-pos")).toHaveCount(0)
  await expect(page.getByText("Productos y precios")).toBeVisible()
  await page.goto("/admin/catalogo")
  await expect(page.getByRole("heading", { name: "Productos, presentaciones y precios" })).toBeVisible()
  await expect(page.getByRole("article").filter({ hasText: "Aceite E2E" })).toBeVisible()
  await page.getByLabel("Precio Caja x 2").fill("5500")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect.poll(async () => (await getFirestore(app).collection("presentaciones_producto").doc("presentacion-e2e").get()).data()?.precioCOP).toBe(5500)
  await page.goto("/admin/clientes")
  await expect(page.getByText("Tienda E2E")).toBeVisible()
  await page.goto("/admin/inventario")
  await expect(page.getByRole("heading", { name: "Existencias en unidad base" })).toBeVisible()
  await page.goto("/admin/ventas")
  await expect(page.getByRole("heading", { name: "Consulta operativa" })).toBeVisible()
  await expect(page.getByText("Tienda Nueva E2E")).toBeVisible()
})
