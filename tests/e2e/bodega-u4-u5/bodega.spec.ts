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
  key: "A" | "B" | "C" | "GENERAL"; empresaId: string; nombre: string; vendedor: Actor; admin: Actor
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
const tenantC = tenantFixture("C", "BODEGA_MVP1")
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
  if (vertical === "BODEGA_MVP1") {
    const bankAccountId = tenant.key === "A" ? "bancolombia" : `bancolombia-${tenant.key.toLowerCase()}-${runId}`
    await db.collection("cuentas_bancarias").doc(bankAccountId).set({ id: bankAccountId, empresaId: tenant.empresaId, claveOperativa: "bancolombia", nombre: "Bancolombia", saldo: 0 })
  }
  if (tenant.key === "A") {
    await db.collection("cuentas_bancarias").doc("caja-principal").set({ id: "caja-principal", empresaId: tenant.empresaId, claveOperativa: "caja-principal", nombre: "Caja", saldo: 0 })
  }
}

test.beforeAll(async () => {
  app = initializeApp({ projectId }, `bodega-${runId}`)
  const auth = getAuth(app); const db = getFirestore(app)
  await db.collection("permisos_roles").doc("vendedor").set({ permisos: ["sell", "shifts"] })
  await seedTenant(db, auth, tenantA, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantB, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantC, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantGeneral, "GENERAL")
})
test.afterAll(async () => { await deleteApp(app) })

async function login(page: import("@playwright/test").Page, actor: Actor, adminRoute = false) {
  await page.goto(adminRoute ? "/admin/login" : "/pos")
  await page.locator(adminRoute ? "#user" : "#username").fill(actor.codigo)
  await page.locator(adminRoute ? "#pass" : "#password").fill(pin)
  await page.getByRole("button", { name: adminRoute ? "Ingresar" : "Iniciar Sesión" }).click()
  await expect(page).toHaveURL(adminRoute ? /\/admin$/ : /\/pos$/)
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

async function aprobarSolicitudEnBackoffice(browser: import("@playwright/test").Browser, tenant: TenantFixture, clienteNombre: string) {
  const context = await browser.newContext()
  const adminPage = await context.newPage()
  try {
    await login(adminPage, tenant.admin, true)
    await adminPage.goto("/admin/solicitudes")
    await expect(adminPage.getByRole("heading", { name: "Solicitudes de venta" })).toBeVisible()
    const solicitud = adminPage.getByRole("article").filter({ hasText: clienteNombre })
    await expect(solicitud).toBeVisible()
    await solicitud.getByRole("button", { name: "Aprobar" }).click()
    await expect(solicitud.getByText("APROBADA", { exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
}

test("vendedor solicita transferencia, admin aprueba y el pago materializa una única venta", async ({ page, browser }) => {
  await login(page, tenantA.vendedor); await expect(page.getByText("Bodega móvil")).toBeVisible()
  await page.getByRole("button", { name: tenantA.productoNombre }).click(); await expect(page.getByRole("button", { name: "Enviar solicitud" })).toBeEnabled(); await expect(page.getByText("Sin turno")).toBeVisible()
  await page.getByRole("button", { name: "Enviar solicitud" }).click()
  await expect(page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible()
  const db = getFirestore(app)
  const solicitudes = await db.collection("empresas").doc(tenantA.empresaId).collection("solicitudes_venta_bodega").get()
  expect(solicitudes.size).toBe(1); expect(solicitudes.docs[0]?.data()).toMatchObject({ estado: "PENDIENTE_APROBACION", solicitanteUid: tenantA.vendedor.uid, totalCOP: 5000 })
  const eventos = await db.collection("eventos_operativos").where("empresaId", "==", tenantA.empresaId).get()
  const eventosSolicitud = eventos.docs.filter(doc => doc.data().tipo === "SOLICITUD_VENTA_BODEGA_PENDIENTE" && doc.data().agregado?.id === solicitudes.docs[0]!.id)
  expect(eventosSolicitud).toHaveLength(1)
  const eventRef = eventosSolicitud[0]!.ref
  const event = eventosSolicitud[0]!
  expect(event.data()).toMatchObject({ tipo: "SOLICITUD_VENTA_BODEGA_PENDIENTE", empresaId: tenantA.empresaId, estadoDespacho: "PENDIENTE", agregado: { tipo: "SOLICITUD_VENTA_BODEGA", id: solicitudes.docs[0]!.id }, payloadOperativo: { solicitudId: solicitudes.docs[0]!.id } })
  expect(JSON.stringify(event.data()).includes(tenantA.clienteNombre)).toBe(false)
  await expect.poll(async () => (await eventRef.get()).data()?.estadoDespacho).toBe("SIN_DESTINATARIO")
  expect((await db.collection("ventas").where("empresaId", "==", tenantA.empresaId).get()).size).toBe(0)
  expect((await db.collection("movimientos_inventario").where("empresaId", "==", tenantA.empresaId).get()).size).toBe(0)
  expect((await db.collection("transacciones_financieras").where("empresaId", "==", tenantA.empresaId).get()).size).toBe(0)
  await aprobarSolicitudEnBackoffice(browser, tenantA, tenantA.clienteNombre)
  await page.reload(); await page.getByRole("button", { name: "Solicitudes" }).click()
  await expect(page.getByText("APROBADA", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "transferencia" }).click(); await page.getByRole("button", { name: "Confirmar venta" }).click()
  const resultado = page.getByText("Venta confirmada").locator(".."); await expect(resultado).toBeVisible(); await expect(resultado).toContainText("5.000")
  const ventas = await db.collection("ventas").where("empresaId", "==", tenantA.empresaId).get(); expect(ventas.size).toBe(1); expect(ventas.docs[0]?.data().cajeroId).toBe(tenantA.vendedor.uid); expect(ventas.docs[0]?.data().turnoId).toBeNull()
  const solicitudFinal = await db.collection("empresas").doc(tenantA.empresaId).collection("solicitudes_venta_bodega").doc(solicitudes.docs[0]!.id).get()
  expect(solicitudFinal.data()).toMatchObject({ estado: "EJECUTADA", ejecucion: { ventaId: ventas.docs[0]?.id } })
  const venta = ventas.docs[0]
  const ingresos = await db.collection("transacciones_financieras").where("empresaId", "==", tenantA.empresaId).where("ventaId", "==", venta?.id).get(); expect(ingresos.size).toBe(1); expect(ingresos.docs[0]?.data()).toMatchObject({ tipo: "ingreso", categoria: "ventas", monto: 5000, turnoId: null, cuentaDocumentoId: "bancolombia" })
  const movimientosInventario = await db.collection("movimientos_inventario").where("empresaId", "==", tenantA.empresaId).where("referenciaId", "==", venta?.id).get()
  expect(movimientosInventario.size).toBe(1)
  expect(movimientosInventario.docs[0]?.data()).toMatchObject({ articuloId: tenantA.productoId, cantidad: -2, referenciaColeccion: "ventas", referenciaId: venta?.id })
  expect((await db.collection("productos").doc(tenantA.productoId).get()).data()?.stock).toBe(18)
  const movimientosCaja = await db.collection("transacciones_financieras").where("empresaId", "==", tenantA.empresaId).where("cuentaDocumentoId", "==", "caja-principal").get(); expect(movimientosCaja.size).toBe(0)
  await page.goto("/admin"); await expect(page).toHaveURL(/\/admin\/login\?error=not_admin/)
})

test("reintento tras perder la respuesta de la venta conserva una sola solicitud y sus efectos", async ({ page, browser }) => {
  await login(page, tenantC.vendedor); await expect(page.getByText("Bodega móvil")).toBeVisible()
  const db = getFirestore(app)
  await page.getByRole("button", { name: tenantC.productoNombre }).click()
  await page.getByRole("button", { name: "Enviar solicitud" }).click()
  await expect(page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible()
  const solicitud = (await db.collection("empresas").doc(tenantC.empresaId).collection("solicitudes_venta_bodega").get()).docs[0]
  expect(solicitud).toBeTruthy()
  const solicitudId = solicitud!.id
  expect((await db.collection("ventas").where("empresaId", "==", tenantC.empresaId).get()).size).toBe(0)

  await aprobarSolicitudEnBackoffice(browser, tenantC, tenantC.clienteNombre)
  await page.reload(); await page.getByRole("button", { name: "Solicitudes" }).click()
  const tarjeta = page.getByRole("article").filter({ hasText: tenantC.clienteNombre })
  await expect(tarjeta.getByText("APROBADA", { exact: true })).toBeVisible()
  await tarjeta.getByRole("button", { name: "transferencia" }).click()

  let perderRespuesta = true
  let comandoInicial: unknown
  let comandoReintentado: unknown
  await page.route("**/*confirmarVentaBodegaV1*", async route => {
    if (route.request().method() !== "POST") { await route.continue(); return }
    const data = route.request().postDataJSON()?.data
    if (perderRespuesta) {
      perderRespuesta = false
      comandoInicial = data
      const response = await route.fetch()
      expect(response.status()).toBe(200)
      await route.abort("failed")
      return
    }
    comandoReintentado = data
    await route.continue()
  })

  await tarjeta.getByRole("button", { name: "Confirmar venta" }).click()
  await expect(page.getByRole("alert")).toBeVisible()
  await expect.poll(async () => (await db.collection("ventas").where("empresaId", "==", tenantC.empresaId).get()).size).toBe(1)
  const ventaConfirmadaPorServidor = (await db.collection("ventas").where("empresaId", "==", tenantC.empresaId).get()).docs[0]
  expect(ventaConfirmadaPorServidor).toBeTruthy()
  const ventaId = ventaConfirmadaPorServidor!.id
  await expect.poll(async () => (await db.collection("empresas").doc(tenantC.empresaId).collection("solicitudes_venta_bodega").doc(solicitudId).get()).data()?.estado).toBe("EJECUTADA")

  await page.getByRole("button", { name: "Actualizar" }).click()
  await expect(tarjeta.getByText("EJECUTADA", { exact: true })).toBeVisible()
  await tarjeta.getByRole("button", { name: "Recuperar confirmación" }).click()
  await expect(page.getByText("Venta confirmada")).toBeVisible()
  expect(comandoReintentado).toEqual(comandoInicial)

  const ventas = await db.collection("ventas").where("empresaId", "==", tenantC.empresaId).get()
  expect(ventas.size).toBe(1)
  expect(ventas.docs[0]?.id).toBe(ventaId)
  const solicitudesFinales = await db.collection("empresas").doc(tenantC.empresaId).collection("solicitudes_venta_bodega").get()
  expect(solicitudesFinales.size).toBe(1)
  const solicitudFinal = solicitudesFinales.docs[0]
  expect(solicitudFinal?.id).toBe(solicitudId)
  expect(solicitudFinal.data()).toMatchObject({ estado: "EJECUTADA", ejecucion: { ventaId } })
  const movimientos = await db.collection("movimientos_inventario").where("empresaId", "==", tenantC.empresaId).where("referenciaId", "==", ventaId).get()
  expect(movimientos.size).toBe(1)
  expect(movimientos.docs[0]?.data()).toMatchObject({ cantidad: -2, referenciaColeccion: "ventas", referenciaId: ventaId })
  const ingresos = await db.collection("transacciones_financieras").where("empresaId", "==", tenantC.empresaId).where("ventaId", "==", ventaId).get()
  expect(ingresos.size).toBe(1)
  expect(ingresos.docs[0]?.data()).toMatchObject({ tipo: "ingreso", categoria: "ventas", monto: 5000, cuentaDocumentoId: `bancolombia-c-${runId}` })
})

test("vendedor aprobado confirma efectivo con turno propio desde la PWA hasta los efectos persistidos", async ({ page, browser }) => {
  await login(page, tenantA.vendedor); await expect(page.getByText("Bodega móvil")).toBeVisible()
  const db = getFirestore(app)
  await page.getByRole("button", { name: tenantA.productoNombre }).click(); await page.getByLabel(`Cantidad de ${tenantA.presentacionNombre}`).fill("2"); await page.getByRole("button", { name: "Enviar solicitud" }).click(); await expect(page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible()
  await aprobarSolicitudEnBackoffice(browser, tenantA, tenantA.clienteNombre)
  await page.reload(); await page.getByRole("button", { name: "Solicitudes" }).click(); await expect(page.getByText("APROBADA", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "efectivo" }).click()
  await page.getByLabel("Base de apertura").fill("10000"); await page.getByRole("button", { name: "Abrir turno para efectivo" }).click(); await expect(page.getByText("Turno abierto")).toBeVisible()
  await expect.poll(async () => (await db.collection("turnos").where("empresaId", "==", tenantA.empresaId).where("cajeroId", "==", tenantA.vendedor.uid).where("estado", "==", "abierto").get()).docs[0]?.id ?? null).not.toBeNull()
  const turnoDoc = (await db.collection("turnos").where("empresaId", "==", tenantA.empresaId).where("cajeroId", "==", tenantA.vendedor.uid).where("estado", "==", "abierto").get()).docs[0]; expect(turnoDoc?.id).toBeTruthy()
  expect((await db.collection("productos").doc(tenantA.productoId).get()).data()?.stock).toBe(18)
  await page.getByRole("button", { name: "Confirmar venta" }).click(); await expect(page.getByText("Venta confirmada")).toBeVisible()
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
    const crearSolicitud = httpsCallable(clienteA.functions, "crearSolicitudVentaBodegaV1")
    const intento = { commandId: `cross-producto-${runId}`, idempotencyKey: `cross-producto-${runId}`, correlationId: `cross-producto-${runId}`, causationId: null, payload: { clienteId: tenantA.clienteId, lineas: [{ productoId: tenantB.productoId, presentacionId: tenantB.presentacionId, cantidad: 1 }] } }
    const intentoCliente = { commandId: `cross-cliente-${runId}`, idempotencyKey: `cross-cliente-${runId}`, correlationId: `cross-cliente-${runId}`, causationId: null, payload: { clienteId: tenantB.clienteId, lineas: [{ productoId: tenantA.productoId, presentacionId: tenantA.presentacionId, cantidad: 1 }] } }
    await debeFallar(() => crearSolicitud(intento)); await debeFallar(() => crearSolicitud(intentoCliente))
  } finally { await clienteA.close() }
  const db = getFirestore(app); expect((await db.collection("ventas").where("empresaId", "==", tenantB.empresaId).get()).size).toBe(0); expect((await db.collection("movimientos_inventario").where("empresaId", "==", tenantB.empresaId).get()).size).toBe(0); expect((await db.collection("transacciones_financieras").where("empresaId", "==", tenantB.empresaId).get()).size).toBe(0)
})

test("administrador Bodega ve únicamente el backoffice y conserva operaciones de A", async ({ page }) => {
  await login(page, tenantA.admin, true); await expect(page.getByRole("heading", { name: "Centro de operación" })).toBeVisible(); await page.goto("/pos"); await expect(page).toHaveURL(/\/admin$/); await expect(page.locator(".theme-pos")).toHaveCount(0)
  await page.goto("/admin/catalogo"); await expect(page.getByRole("article").filter({ hasText: tenantA.productoNombre })).toBeVisible(); await expect(page.getByRole("article").filter({ hasText: tenantB.productoNombre })).toHaveCount(0); await page.getByLabel(`Precio ${tenantA.presentacionNombre}`).fill("5500"); await page.getByRole("button", { name: "Guardar" }).click(); await expect.poll(async () => (await getFirestore(app).collection("presentaciones_producto").doc(tenantA.presentacionId).get()).data()?.precioCOP).toBe(5500)
  await page.goto("/admin/clientes"); await expect(page.getByText(tenantA.clienteNombre)).toBeVisible(); await expect(page.getByText(tenantB.clienteNombre)).toHaveCount(0); await page.goto("/admin/inventario"); await expect(page.getByRole("heading", { name: "Existencias en unidad base" })).toBeVisible(); await page.goto("/admin/ventas"); await expect(page.getByRole("heading", { name: "Consulta operativa" })).toBeVisible(); await expect(page.getByText(tenantA.clienteNombre).first()).toBeVisible(); await expect(page.getByText(tenantB.clienteNombre)).toHaveCount(0)
})

test("el detalle del turno seleccionado refleja el snapshot de cierre en vivo", async ({ page }) => {
  const db = getFirestore(app)
  const turnoId = `turno-admin-snapshot-${runId}`
  const cajeroNombre = `Cajero UI ${runId}`
  const turnoRef = db.collection("turnos").doc(turnoId)

  await turnoRef.set({
    empresaId: tenantA.empresaId,
    cajeroId: `cajero-ui-${runId}`,
    cajeroNombre,
    fechaApertura: new Date("2026-10-10T08:00:00.000Z"),
    fechaCierre: null,
    estado: "abierto",
    baseApertura: 0,
    ventasEfectivo: 0,
    ventasOtrosMetodos: 0,
    totalEgresos: 0,
    totalEsperadoEfectivo: 0,
    totalReportadoEfectivo: 0,
    diferenciaEfectivo: 0,
    notasApertura: "",
    notasCierre: "",
  })

  await login(page, tenantA.admin, true)
  await page.goto("/admin/turnos")

  const filaTurno = page.getByRole("button").filter({ hasText: cajeroNombre })
  await expect(filaTurno).toContainText("ABIERTO")
  await filaTurno.click()

  const detalle = page.locator(".fixed.inset-0").filter({ hasText: "Detalle del turno" })
  await expect(detalle).toContainText("Turno en curso")

  await turnoRef.update({
    estado: "cerrado",
    fechaCierre: new Date("2026-10-10T08:15:00.000Z"),
    ventasEfectivo: 10000,
    totalEsperadoEfectivo: 10000,
    totalReportadoEfectivo: 10000,
    diferenciaEfectivo: 0,
    notasCierre: "Cierre sintético de regresión",
  })

  await expect(detalle).toContainText("Turno cerrado")
  await expect(detalle).toContainText("Diferencia · Cuadrado")
  await expect(detalle).toContainText("$10.000")
})

test("administrador Bodega B solo consulta su propio catálogo", async ({ page }) => {
  await login(page, tenantB.admin, true); await expect(page).toHaveURL(/\/admin$/); await expect(page.getByRole("heading", { name: "Centro de operación" })).toBeVisible()
  await page.goto("/admin/catalogo"); await expect(page.getByRole("article").filter({ hasText: tenantB.productoNombre })).toBeVisible(); await expect(page.getByText(tenantA.productoNombre)).toHaveCount(0)
})

test("administrador Bodega puede registrar venta directa canónica sin solicitud propia", async ({ page }) => {
  await login(page, tenantB.admin, true)
  await page.goto("/admin/vender")
  await expect(page.getByRole("heading", { name: "Registrar venta" })).toBeVisible()
  await page.getByLabel("Cliente de venta").selectOption(tenantB.clienteId)
  await page.getByLabel("Presentación de venta").selectOption(tenantB.presentacionId)
  await page.getByRole("button", { name: "Agregar" }).click()
  await page.getByRole("button", { name: "Confirmar venta directa" }).click()
  await expect(page.getByRole("status")).toContainText("Venta registrada")
  const ventas = await getFirestore(app).collection("ventas").where("empresaId", "==", tenantB.empresaId).get()
  expect(ventas.size).toBe(1)
  expect(ventas.docs[0]?.data()).toMatchObject({ cajeroId: tenantB.admin.uid, metodoPago: "transferencia", estadoOperativo: "COMPLETO" })
  expect((await getFirestore(app).collection("empresas").doc(tenantB.empresaId).collection("solicitudes_venta_bodega").get()).size).toBe(0)
})

test("administrador Bodega crea vendedor mediante la incorporación canónica", async ({ page }) => {
  const nombreVendedor = `Vendedor onboarding ${runId}`
  await login(page, tenantA.admin, true)
  await page.goto("/admin/usuarios")
  await page.getByRole("button", { name: "Nuevo operador" }).click()
  const dialogo = page.getByRole("dialog", { name: "Nuevo Operador" })
  await dialogo.getByPlaceholder("Ej: Carlos López").fill(nombreVendedor)
  await dialogo.getByRole("combobox").click()
  await page.getByRole("option", { name: "Vendedor" }).click()
  await dialogo.getByRole("button", { name: "Crear operador" }).click()
  await expect(page.getByRole("dialog", { name: "Credencial del operador" })).toBeVisible()
  await expect.poll(async () => (await getFirestore(app).collection("membresias").where("empresaId", "==", tenantA.empresaId).where("rol", "==", "vendedor").get()).docs.some((doc) => doc.data().permisos?.join(",") === "sell,shifts")).toBe(true)
  const vendedores = await getFirestore(app).collection("membresias").where("empresaId", "==", tenantA.empresaId).where("rol", "==", "vendedor").get()
  expect(vendedores.docs.some((doc) => doc.data().permisos?.join(",") === "sell,shifts")).toBe(true)
})

test("GENERAL autorizado conserva el POS legacy en /pos", async ({ page }) => {
  await login(page, tenantGeneral.admin); await expect(page.locator(".theme-pos")).toBeVisible(); await expect(page.getByText("Bodega móvil")).toHaveCount(0); await expect(page).not.toHaveURL(/\/admin$/)
})
