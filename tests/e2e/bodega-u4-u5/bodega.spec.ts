import { test, expect } from "@playwright/test"
import bcrypt from "bcryptjs"
import { initializeApp, deleteApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from "firebase/app"
import { connectAuthEmulator, getAuth as getClientAuth, signInWithCustomToken } from "firebase/auth"
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions"
import { crearPlantillaConfiguracionRevision1 } from "../../../lib/configuracion/plantilla"

const projectId = process.env.E2E_BODEGA_PROJECT_ID ?? "demo-bodega-u4-u5-ui"
const runId = (process.env.E2E_BODEGA_RUN_ID ?? "manual").replace(/[^a-z0-9-]/gi, "-").slice(-30)
const pin = "123456"
const pepper = process.env.OPERATIONAL_PIN_PEPPER ?? "bodega-u4-u5-local-pepper"

type Actor = { uid: string; codigo: string; rol: "vendedor" | "admin"; permisos: string[]; empresaId: string }
type TenantFixture = {
  key: "A" | "B" | "GENERAL"; empresaId: string; nombre: string; vendedor: Actor; admin: Actor
  clienteId: string; clienteNombre: string; productoId: string; productoNombre: string; presentacionId: string; presentacionNombre: string
}

function tenantFixture(key: TenantFixture["key"], vertical: "BODEGA_MVP1" | "GENERAL"): TenantFixture {
  const suffix = key.toLowerCase()
  const empresaId = `${vertical === "GENERAL" ? "general" : "bodega"}-e2e-${suffix}-${runId}`
  return {
    key, empresaId, nombre: vertical === "GENERAL" ? "General E2E" : `Bodega ${key} E2E`,
    vendedor: { uid: `vendedor-${suffix}-${runId}`, codigo: `bod-${suffix}-${runId.slice(-14)}-v`, rol: "vendedor", permisos: ["sell", "shifts"], empresaId },
    admin: { uid: `admin-${suffix}-${runId}`, codigo: `bod-${suffix}-${runId.slice(-14)}-a`, rol: "admin", permisos: ["sell", "shifts", "inventory", "clientes"], empresaId },
    clienteId: `cliente-${suffix}-${runId}`, clienteNombre: `Cliente ${key} E2E`, productoId: `producto-${suffix}-${runId}`, productoNombre: `Producto ${key} E2E`, presentacionId: `presentacion-${suffix}-${runId}`, presentacionNombre: `Caja ${key} x 2`,
  }
}

const tenantA = tenantFixture("A", "BODEGA_MVP1")
const tenantB = tenantFixture("B", "BODEGA_MVP1")
const tenantGeneral = tenantFixture("GENERAL", "GENERAL")
let app: ReturnType<typeof initializeApp>

async function seedTenant(db: FirebaseFirestore.Firestore, auth: ReturnType<typeof getAuth>, tenant: TenantFixture, vertical: "BODEGA_MVP1" | "GENERAL") {
  await db.collection("empresas").doc(tenant.empresaId).set({ estado: "trial", paisFiscal: "CO", esFundacional: tenant.key === "A", nombre: tenant.nombre })
  const configuracion = crearPlantillaConfiguracionRevision1({ empresaId: tenant.empresaId, vertical, nombreComercial: tenant.nombre, creadaEn: new Date(), actualizadaEn: new Date(), ultimaMutacion: { actorTipo: "SYSTEM", actorId: "e2e", origen: "BOOTSTRAP", commandId: `seed-${tenant.key}-${runId}`, correlationId: `seed-${tenant.key}-${runId}` } })
  configuracion.modulos.habilitados = ["sell", "inventory", "clientes", "shifts"]
  configuracion.pos.metodosPagoHabilitados = ["efectivo", "transferencia"]
  configuracion.pos.permitirPagoMixto = false
  await db.collection("configuraciones").doc(tenant.empresaId).set(configuracion)
  await db.collection("planes").doc("mvp_comercial").collection("versiones").doc("1").set({ planId: "mvp_comercial", planVersion: 1, estado: "PUBLICADA", capacidades: configuracion.modulos.habilitados, limites: {}, periodicidad: "MENSUAL", grandfathered: false, revision: 1, schemaVersion: 1 })
  await db.collection("suscripciones").doc(tenant.empresaId).set({ empresaId: tenant.empresaId, planId: "mvp_comercial", planVersion: 1, estado: "trialing", trialInicio: "2026-09-01", trialFin: "2099-09-30", revision: 1, schemaVersion: 1 })
  for (const actor of [tenant.vendedor, tenant.admin]) {
    await auth.getUser(actor.uid).catch(() => auth.createUser({ uid: actor.uid, displayName: actor.rol }))
    await auth.setCustomUserClaims(actor.uid, { empresaId: tenant.empresaId, rol: actor.rol })
    await db.collection("usuarios").doc(actor.uid).set({ nombre: actor.rol === "admin" ? `Admin ${tenant.key}` : `Vendedor ${tenant.key}`, username: actor.codigo, activo: true })
    await db.collection("membresias").doc(`${tenant.empresaId}_${actor.uid}`).set({ empresaId: tenant.empresaId, uid: actor.uid, rol: actor.rol, permisos: actor.permisos, estado: "activa", activo: true })
    await db.collection("credenciales_operativas").doc(`${tenant.empresaId}_${actor.codigo}`).set({ empresaId: tenant.empresaId, uid: actor.uid, codigo: actor.codigo, pinHash: await bcrypt.hash(`${pin}:${pepper}`, 8), activo: true, fallosConsecutivos: 0, bloqueadoHasta: null, requiereCambio: false })
  }
  await db.collection("espacios").doc(`bodega-${tenant.key}-${runId}`).set({ empresaId: tenant.empresaId, nombre: `Espacio ${tenant.key}`, activo: true })
  await db.collection("categorias").doc(`abarrotes-${tenant.key}-${runId}`).set({ empresaId: tenant.empresaId, nombre: `Abarrotes ${tenant.key}`, activo: true })
  await db.collection("clientes").doc(tenant.clienteId).set({ empresaId: tenant.empresaId, nombre: tenant.clienteNombre, cedula: `9000000${tenant.key === "A" ? "01" : tenant.key === "B" ? "02" : "03"}`, telefono: "3000000000", tipoDocumento: "NIT", activo: true })
  await db.collection("productos").doc(tenant.productoId).set({ id: tenant.productoId, empresaId: tenant.empresaId, nombre: tenant.productoNombre, categoriaId: `abarrotes-${tenant.key}-${runId}`, espacioId: `bodega-${tenant.key}-${runId}`, unidad: "unidad", costo: 1000, stock: 20, stockMinimo: 2, secuenciaLedger: 1, activo: true })
  await db.collection("presentaciones_producto").doc(tenant.presentacionId).set({ id: tenant.presentacionId, empresaId: tenant.empresaId, productoId: tenant.productoId, nombre: tenant.presentacionNombre, factorUnidadBase: 2, precioCOP: 5000, activo: true })
  if (tenant.key === "A") {
    await db.collection("cuentas_bancarias").doc("bancolombia").set({ id: "bancolombia", empresaId: tenant.empresaId, claveOperativa: "bancolombia", nombre: "Bancolombia", saldo: 0 })
    await db.collection("cuentas_bancarias").doc("caja-principal").set({ id: "caja-principal", empresaId: tenant.empresaId, claveOperativa: "caja-principal", nombre: "Caja", saldo: 0 })
  }
}

test.beforeAll(async () => {
  app = initializeApp({ projectId }, `bodega-${runId}`)
  const auth = getAuth(app); const db = getFirestore(app)
  await seedTenant(db, auth, tenantA, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantB, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantGeneral, "GENERAL")
})
test.afterAll(async () => { await deleteApp(app) })

async function login(page: import("@playwright/test").Page, actor: Actor, adminRoute = false) {
  await page.goto(adminRoute ? "/admin/login" : "/pos")
  await page.locator(adminRoute ? "#user" : "#username").fill(actor.codigo)
  await page.locator(adminRoute ? "#pass" : "#password").fill(pin)
  await page.getByRole("button", { name: adminRoute ? "Ingresar" : "Iniciar Sesión" }).click()
}

async function clienteAutenticado(actor: Actor) {
  const clientApp = initializeClientApp({ apiKey: "AIzaSyDUMMY0000000000000000000000000000", authDomain: `${projectId}.firebaseapp.com`, projectId, appId: `1:000000000000:web:${projectId}` }, `aislamiento-${actor.uid}-${Date.now()}`)
  const clientAuth = getClientAuth(clientApp); connectAuthEmulator(clientAuth, "http://127.0.0.1:9099", { disableWarnings: true })
  const functions = getFunctions(clientApp, "us-central1"); connectFunctionsEmulator(functions, "127.0.0.1", 5001)
  const token = await getAuth(app).createCustomToken(actor.uid, { empresaId: actor.empresaId, rol: actor.rol })
  await signInWithCustomToken(clientAuth, token)
  return { functions, close: () => deleteClientApp(clientApp) }
}
async function debeFallar(action: () => Promise<unknown>) { let fallo: unknown; try { await action() } catch (error) { fallo = error }; expect(fallo).toBeTruthy() }

test("vendedor completa transferencia sin turno y permanece fuera del backoffice", async ({ page }) => {
  await login(page, tenantA.vendedor); await expect(page.getByText("Bodega móvil")).toBeVisible()
  await page.getByRole("button", { name: "Crear cliente" }).click(); await page.getByLabel("Nombre comercial *").fill("Tienda Nueva E2E"); await page.getByLabel("Documento *").fill("900000002"); await page.getByLabel("Teléfono *").fill("3000000001")
  await page.locator("form").filter({ has: page.getByRole("heading", { name: "Nuevo cliente" }) }).getByRole("button", { name: "Crear cliente" }).click()
  await expect(page.getByRole("combobox").filter({ has: page.locator("option:checked", { hasText: "Tienda Nueva E2E" }) })).toBeVisible()
  await page.getByRole("button", { name: tenantA.productoNombre }).click(); await expect(page.getByRole("button", { name: "Confirmar venta" })).toBeDisabled(); await expect(page.getByText("Sin turno")).toBeVisible()
  await page.getByRole("button", { name: "transferencia" }).click(); await page.getByRole("button", { name: "Confirmar venta" }).click()
  const resultado = page.getByText("Venta confirmada").locator(".."); await expect(resultado).toBeVisible(); await expect(resultado).toContainText("5.000")
  const db = getFirestore(app); const ventas = await db.collection("ventas").where("empresaId", "==", tenantA.empresaId).get(); expect(ventas.size).toBe(1); expect(ventas.docs[0]?.data().cajeroId).toBe(tenantA.vendedor.uid); expect(ventas.docs[0]?.data().turnoId).toBeNull()
  const venta = ventas.docs[0]
  const ingresos = await db.collection("transacciones_financieras").where("empresaId", "==", tenantA.empresaId).where("ventaId", "==", venta?.id).get(); expect(ingresos.size).toBe(1); expect(ingresos.docs[0]?.data()).toMatchObject({ tipo: "ingreso", categoria: "ventas", monto: 5000, turnoId: null, cuentaDocumentoId: "bancolombia" })
  const movimientosCaja = await db.collection("transacciones_financieras").where("empresaId", "==", tenantA.empresaId).where("cuentaDocumentoId", "==", "caja-principal").get(); expect(movimientosCaja.size).toBe(0)
  await page.goto("/admin"); await expect(page).toHaveURL(/\/admin\/login\?error=not_admin/)
})

test("vendedor confirma efectivo con turno propio desde la PWA hasta los efectos persistidos", async ({ page }) => {
  await login(page, tenantA.vendedor); await expect(page.getByText("Bodega móvil")).toBeVisible()
  await page.getByLabel("Base de apertura").fill("10000"); await page.getByRole("button", { name: "Abrir turno para efectivo" }).click(); await expect(page.getByText("Turno abierto")).toBeVisible()
  const db = getFirestore(app)
  await expect.poll(async () => (await db.collection("turnos").where("empresaId", "==", tenantA.empresaId).where("cajeroId", "==", tenantA.vendedor.uid).where("estado", "==", "abierto").get()).docs[0]?.id ?? null).not.toBeNull()
  const turnoDoc = (await db.collection("turnos").where("empresaId", "==", tenantA.empresaId).where("cajeroId", "==", tenantA.vendedor.uid).where("estado", "==", "abierto").get()).docs[0]; expect(turnoDoc?.id).toBeTruthy()
  await page.getByRole("button", { name: tenantA.productoNombre }).click(); await page.getByLabel(`Cantidad de ${tenantA.presentacionNombre}`).fill("2"); await page.getByRole("button", { name: "efectivo" }).click(); await page.getByRole("button", { name: "Confirmar venta" }).click(); await expect(page.getByText("Venta confirmada")).toBeVisible()
  const ventas = await db.collection("ventas").where("empresaId", "==", tenantA.empresaId).get()
  const ventasProyectadas: Array<Record<string, any>> = ventas.docs.map(item => ({ id: item.id, ...(item.data() as Record<string, unknown>) }))
  const venta = ventasProyectadas.find(item => item.metodoPago === "efectivo")
  expect(venta).toBeTruthy(); expect(venta?.estadoOperativo).toBe("COMPLETO"); expect(venta?.cajeroId).toBe(tenantA.vendedor.uid); expect(venta?.turnoId).toBe(turnoDoc?.id); expect(venta?.totales).toEqual({ subtotal: 10000, impuestos: 0, total: 10000 })
  expect(venta?.items).toHaveLength(1); expect(venta?.items[0]).toMatchObject({ productoId: tenantA.productoId, presentacionId: tenantA.presentacionId, cantidadPresentaciones: 2, factorUnidadBase: 2, cantidadUnidadBase: 4, precioPresentacionCOP: 5000, subtotalCOP: 10000, productoNombreSnapshot: tenantA.productoNombre, presentacionNombreSnapshot: tenantA.presentacionNombre })
  const recibos = await db.collection("operaciones_comandos").where("empresaId", "==", tenantA.empresaId).get(); expect(recibos.docs.filter(recibo => recibo.data().commandId === venta?.commandId)).toHaveLength(1)
  const ingresos = await db.collection("transacciones_financieras").where("empresaId", "==", tenantA.empresaId).where("ventaId", "==", venta?.id).get(); expect(ingresos.size).toBe(1); expect(ingresos.docs[0]?.data()).toMatchObject({ tipo: "ingreso", categoria: "ventas", monto: 10000, turnoId: turnoDoc?.id, usuarioId: tenantA.vendedor.uid, cuentaDocumentoId: "caja-principal" })
  const movimientos = await db.collection("movimientos_inventario").where("empresaId", "==", tenantA.empresaId).where("referenciaId", "==", venta?.id).get(); expect(movimientos.size).toBe(1); expect(movimientos.docs[0]?.data()).toMatchObject({ articuloId: tenantA.productoId, cantidad: -4, referenciaColeccion: "ventas", referenciaId: venta?.id })
  expect((await db.collection("productos").doc(tenantA.productoId).get()).data()?.stock).toBe(14)
})

test("Bodega conserva aislamiento A/B en UI y callable real", async ({ page }) => {
  await login(page, tenantA.vendedor); await expect(page.getByText("Bodega móvil")).toBeVisible(); await expect(page.locator(`option[value="${tenantA.clienteId}"]`)).toHaveCount(1); await expect(page.getByRole("button", { name: tenantA.productoNombre })).toBeVisible(); await expect(page.locator(`option[value="${tenantB.clienteId}"]`)).toHaveCount(0); await expect(page.getByRole("button", { name: tenantB.productoNombre })).toHaveCount(0)
  const clienteA = await clienteAutenticado(tenantA.vendedor)
  try {
    const confirmar = httpsCallable(clienteA.functions, "confirmarVentaBodegaV1")
    const intento = { commandId: `cross-producto-${runId}`, idempotencyKey: `cross-producto-${runId}`, correlationId: `cross-producto-${runId}`, causationId: null, payload: { clienteId: tenantA.clienteId, lineas: [{ productoId: tenantB.productoId, presentacionId: tenantB.presentacionId, cantidad: 1 }], metodoPago: "transferencia" } }
    const intentoCliente = { commandId: `cross-cliente-${runId}`, idempotencyKey: `cross-cliente-${runId}`, correlationId: `cross-cliente-${runId}`, causationId: null, payload: { clienteId: tenantB.clienteId, lineas: [{ productoId: tenantA.productoId, presentacionId: tenantA.presentacionId, cantidad: 1 }], metodoPago: "transferencia" } }
    await debeFallar(() => confirmar(intento)); await debeFallar(() => confirmar(intentoCliente))
  } finally { await clienteA.close() }
  const db = getFirestore(app); expect((await db.collection("ventas").where("empresaId", "==", tenantB.empresaId).get()).size).toBe(0); expect((await db.collection("movimientos_inventario").where("empresaId", "==", tenantB.empresaId).get()).size).toBe(0); expect((await db.collection("transacciones_financieras").where("empresaId", "==", tenantB.empresaId).get()).size).toBe(0)
})

test("administrador Bodega ve únicamente el backoffice y conserva operaciones de A", async ({ page }) => {
  await login(page, tenantA.admin, true); await expect(page.getByRole("heading", { name: "Centro de operación" })).toBeVisible(); await page.goto("/pos"); await expect(page).toHaveURL(/\/admin$/); await expect(page.locator(".theme-pos")).toHaveCount(0)
  await page.goto("/admin/catalogo"); await expect(page.getByRole("article").filter({ hasText: tenantA.productoNombre })).toBeVisible(); await expect(page.getByRole("article").filter({ hasText: tenantB.productoNombre })).toHaveCount(0); await page.getByLabel(`Precio ${tenantA.presentacionNombre}`).fill("5500"); await page.getByRole("button", { name: "Guardar" }).click(); await expect.poll(async () => (await getFirestore(app).collection("presentaciones_producto").doc(tenantA.presentacionId).get()).data()?.precioCOP).toBe(5500)
  await page.goto("/admin/clientes"); await expect(page.getByText(tenantA.clienteNombre)).toBeVisible(); await expect(page.getByText(tenantB.clienteNombre)).toHaveCount(0); await page.goto("/admin/inventario"); await expect(page.getByRole("heading", { name: "Existencias en unidad base" })).toBeVisible(); await page.goto("/admin/ventas"); await expect(page.getByRole("heading", { name: "Consulta operativa" })).toBeVisible(); await expect(page.getByText("Tienda Nueva E2E").first()).toBeVisible()
})

test("administrador Bodega B solo consulta su propio catálogo", async ({ page }) => {
  await login(page, tenantB.admin, true); await expect(page).toHaveURL(/\/admin$/); await expect(page.getByRole("heading", { name: "Centro de operación" })).toBeVisible()
  await page.goto("/admin/catalogo"); await expect(page.getByRole("article").filter({ hasText: tenantB.productoNombre })).toBeVisible(); await expect(page.getByText(tenantA.productoNombre)).toHaveCount(0)
})

test("GENERAL autorizado conserva el POS legacy en /pos", async ({ page }) => {
  await login(page, tenantGeneral.admin); await expect(page.locator(".theme-pos")).toBeVisible(); await expect(page.getByText("Bodega móvil")).toHaveCount(0); await expect(page).not.toHaveURL(/\/admin$/)
})
