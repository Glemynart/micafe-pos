import { test, expect } from "@playwright/test"
import bcrypt from "bcryptjs"
import { initializeApp, deleteApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { initializeApp as initializeClientApp, deleteApp as deleteClientApp } from "firebase/app"
import { connectAuthEmulator, getAuth as getClientAuth, signInWithCustomToken } from "firebase/auth"
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions"
import { crearPlantillaConfiguracionRevision1 } from "../../../lib/configuracion/plantilla"
import { evaluarReadinessConfiguracion } from "../../../lib/configuracion/readiness"
import { crearIdentificadorInterno } from "../../../functions/src/turnos/identificadores"

const projectId = process.env.E2E_BODEGA_PROJECT_ID ?? "demo-bodega-u4-u5-ui"
const runId = (process.env.E2E_BODEGA_RUN_ID ?? "manual").replace(/[^a-z0-9-]/gi, "-").slice(-30)
const pin = "123456"
const pepper = process.env.OPERATIONAL_PIN_PEPPER ?? "bodega-u4-u5-local-pepper"

type Actor = { uid: string; codigo: string; rol: "vendedor" | "admin"; permisos: string[]; empresaId: string }
type TenantFixture = {
  key: "A" | "B" | "C" | "D" | "E" | "F" | "GENERAL"; empresaId: string; nombre: string; vendedor: Actor; admin: Actor
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
const tenantD = tenantFixture("D", "BODEGA_MVP1")
const tenantE = tenantFixture("E", "BODEGA_MVP1")
const tenantF = tenantFixture("F", "BODEGA_MVP1")
const tenantGeneral = tenantFixture("GENERAL", "GENERAL")
let app: ReturnType<typeof initializeApp>

async function seedTenant(db: FirebaseFirestore.Firestore, auth: ReturnType<typeof getAuth>, tenant: TenantFixture, vertical: "BODEGA_MVP1" | "GENERAL", perfilCompleto = true) {
  await db.collection("empresas").doc(tenant.empresaId).set({ estado: "trial", paisFiscal: "CO", esFundacional: tenant.key === "A", nombre: tenant.nombre, revision: 1, schemaVersion: 1 })
  const configuracion = crearPlantillaConfiguracionRevision1({ empresaId: tenant.empresaId, vertical, nombreComercial: tenant.nombre, creadaEn: new Date(), actualizadaEn: new Date(), ultimaMutacion: { actorTipo: "SYSTEM", actorId: "e2e", origen: "BOOTSTRAP", commandId: `seed-${tenant.key}-${runId}`, correlationId: `seed-${tenant.key}-${runId}` } })
  configuracion.modulos.habilitados = ["sell", "inventory", "clientes", "shifts"]
  configuracion.pos.metodosPagoHabilitados = ["efectivo", "transferencia"]
  configuracion.pos.permitirPagoMixto = false
  if (perfilCompleto) {
    configuracion.identidadFiscal.razonSocial = `${tenant.nombre} S.A.S.`
    configuracion.identidadFiscal.tipoPersona = "JURIDICA"
    configuracion.identidadFiscal.tipoDocumento = "NIT"
    configuracion.identidadFiscal.numeroDocumento = "900373913"
    configuracion.identidadFiscal.digitoVerificacion = "4"
    configuracion.identidadFiscal.contacto.email = `contacto-${tenant.key.toLowerCase()}@example.com`
    configuracion.identidadFiscal.contacto.telefono = "+573001234567"
    Object.assign(configuracion.localizacion.direccion, { linea1: "Calle de prueba 123", departamentoCodigo: "11", departamentoNombre: "BOGOTÁ, D.C.", municipioCodigo: "11001", municipioNombre: "BOGOTÁ, D.C." })
  }
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
  await db.collection("clientes").doc(tenant.clienteId).set({ empresaId: tenant.empresaId, nombre: tenant.clienteNombre, cedula: `9000000${tenant.key === "A" ? "01" : tenant.key === "B" ? "02" : tenant.key === "C" ? "03" : "04"}`, telefono: "3000000000", tipoDocumento: "NIT", activo: true })
  await db.collection("productos").doc(tenant.productoId).set({ id: tenant.productoId, empresaId: tenant.empresaId, nombre: tenant.productoNombre, categoriaId: `abarrotes-${tenant.key}-${runId}`, espacioId: `bodega-${tenant.key}-${runId}`, unidad: "unidad", costo: 1000, stock: 20, stockMinimo: 2, secuenciaLedger: 1, activo: true })
  await db.collection("presentaciones_producto").doc(tenant.presentacionId).set({ id: tenant.presentacionId, empresaId: tenant.empresaId, productoId: tenant.productoId, nombre: tenant.presentacionNombre, factorUnidadBase: 2, precioCOP: 5000, activo: true })
  if (vertical === "BODEGA_MVP1") {
    const bankAccountId = tenant.key === "A" ? "bancolombia" : `bancolombia-${tenant.key.toLowerCase()}-${runId}`
    await db.collection("cuentas_bancarias").doc(bankAccountId).set({ id: bankAccountId, empresaId: tenant.empresaId, claveOperativa: "bancolombia", nombre: "Bancolombia", saldo: 0 })
    const cashAccountId = tenant.key === "A" ? "caja-principal" : crearIdentificadorInterno(tenant.empresaId, "cuenta:caja-principal")
    await db.collection("cuentas_bancarias").doc(cashAccountId).set({ id: cashAccountId, empresaId: tenant.empresaId, claveOperativa: "caja-principal", nombre: "Caja", saldo: 0 })
  }
}

test.beforeAll(async () => {
  app = initializeApp({ projectId }, `bodega-${runId}`)
  const auth = getAuth(app); const db = getFirestore(app)
  await db.collection("permisos_roles").doc("vendedor").set({ permisos: ["sell", "shifts"] })
  await seedTenant(db, auth, tenantA, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantB, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantC, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantD, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantE, "BODEGA_MVP1")
  await seedTenant(db, auth, tenantF, "BODEGA_MVP1", false)
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

async function aprobarSolicitudEnBackoffice(browser: import("@playwright/test").Browser, tenant: TenantFixture, clienteNombre: string, solicitudId: string) {
  const context = await browser.newContext()
  const adminPage = await context.newPage()
  try {
    await login(adminPage, tenant.admin, true)
    await expect(adminPage.getByRole("heading", { name: "Tu negocio, de un vistazo" })).toBeVisible()
    await adminPage.goto("/admin/solicitudes")
    await expect(adminPage.getByRole("heading", { name: "Solicitudes de venta" })).toBeVisible()
    const referencia = solicitudId.length > 18 ? `…${solicitudId.slice(-8).toUpperCase()}` : solicitudId
    const solicitud = adminPage.getByRole("article").filter({ hasText: clienteNombre }).filter({ hasText: referencia })
    await expect(solicitud).toBeVisible()
    await solicitud.getByRole("button", { name: "Aprobar" }).click()
    await expect(solicitud.getByText("APROBADA", { exact: true })).toBeVisible()
  } finally {
    await context.close()
  }
}

test("vendedor solicita transferencia, admin aprueba y el pago materializa una única venta", async ({ page, browser }) => {
  test.setTimeout(120_000)
  await login(page, tenantA.vendedor); await expect(page.getByText("Tu espacio de ventas")).toBeVisible()
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
  await aprobarSolicitudEnBackoffice(browser, tenantA, tenantA.clienteNombre, solicitudes.docs[0]!.id)
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
  await page.goto("/admin")
  await expect(page.getByText(/Acceso denegado|Sesión activa en la caja|Tu cuenta no tiene permisos de administrador/)).toBeVisible()
  await expect(page.getByRole("heading", { name: "Tu negocio, de un vistazo" })).toHaveCount(0)
})

test("reintento tras perder la respuesta de la venta conserva una sola solicitud y sus efectos", async ({ page, browser }) => {
  await login(page, tenantC.vendedor); await expect(page.getByText("Tu espacio de ventas")).toBeVisible()
  const db = getFirestore(app)
  await page.getByRole("button", { name: tenantC.productoNombre }).click()
  await page.getByRole("button", { name: "Enviar solicitud" }).click()
  await expect(page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible()
  const solicitud = (await db.collection("empresas").doc(tenantC.empresaId).collection("solicitudes_venta_bodega").get()).docs[0]
  expect(solicitud).toBeTruthy()
  const solicitudId = solicitud!.id
  expect((await db.collection("ventas").where("empresaId", "==", tenantC.empresaId).get()).size).toBe(0)

  await aprobarSolicitudEnBackoffice(browser, tenantC, tenantC.clienteNombre, solicitudId)
  await page.reload(); await page.getByRole("button", { name: "Solicitudes" }).click()
  const tarjeta = page.getByRole("article").filter({ hasText: tenantC.clienteNombre })
  await expect(tarjeta.getByText("APROBADA", { exact: true })).toBeVisible()
  await tarjeta.getByRole("button", { name: "transferencia" }).click()

  let perderRespuesta = true
  let comandoInicial: unknown
  let comandoReintentado: unknown
  await page.route("**/*confirmarVentaVendedorBodegaV1*", async route => {
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

test("vendedor aprobado confirma efectivo sin turno con recibido y cambio persistidos", async ({ page, browser }) => {
  await login(page, tenantE.vendedor); await expect(page.getByText("Tu espacio de ventas")).toBeVisible()
  const db = getFirestore(app)
  const solicitudesAntes = new Set((await db.collection("empresas").doc(tenantE.empresaId).collection("solicitudes_venta_bodega").get()).docs.map(solicitud => solicitud.id))
  await page.getByRole("button", { name: tenantE.productoNombre }).click(); await page.getByLabel(`Cantidad de ${tenantE.presentacionNombre}`).fill("2"); await page.getByRole("button", { name: "Enviar solicitud" }).click(); await expect(page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible()
  const solicitudesDespues = await db.collection("empresas").doc(tenantE.empresaId).collection("solicitudes_venta_bodega").get()
  const solicitudNueva = solicitudesDespues.docs.find(solicitud => !solicitudesAntes.has(solicitud.id))
  expect(solicitudNueva).toBeTruthy()
  await aprobarSolicitudEnBackoffice(browser, tenantE, tenantE.clienteNombre, solicitudNueva!.id)
  await page.reload(); await page.getByRole("button", { name: "Solicitudes" }).click(); await expect(page.getByText("APROBADA", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "efectivo" }).click()
  const turnosAntes = await db.collection("turnos").where("empresaId", "==", tenantE.empresaId).get()
  await page.getByLabel("Efectivo recibido").fill("12000"); await expect(page.getByText(/Cambio estimado:.*2\.000/)).toBeVisible()
  expect((await db.collection("productos").doc(tenantE.productoId).get()).data()?.stock).toBe(20)
  await page.getByRole("button", { name: "Confirmar venta" }).click(); await expect(page.getByText("Venta confirmada")).toBeVisible()
  const ventas = await db.collection("ventas").where("empresaId", "==", tenantE.empresaId).get()
  const ventasProyectadas: Array<Record<string, any>> = ventas.docs.map(item => ({ id: item.id, ...(item.data() as Record<string, unknown>) }))
  const venta = ventasProyectadas.find(item => item.metodoPago === "efectivo")
  expect(venta).toBeTruthy(); expect(venta?.estadoOperativo).toBe("COMPLETO"); expect(venta?.cajeroId).toBe(tenantE.vendedor.uid); expect(venta?.turnoId).toBeNull(); expect(venta?.pago).toMatchObject({ metodo: "efectivo", montoRecibidoCOP: 12000, cambioCOP: 2000 }); expect(venta?.totales).toEqual({ subtotal: 10000, impuestos: 0, total: 10000 })
  expect(venta?.items).toHaveLength(1); expect(venta?.items[0]).toMatchObject({ productoId: tenantE.productoId, presentacionId: tenantE.presentacionId, cantidadPresentaciones: 2, factorUnidadBase: 2, cantidadUnidadBase: 4, precioPresentacionCOP: 5000, subtotalCOP: 10000, productoNombreSnapshot: tenantE.productoNombre, presentacionNombreSnapshot: tenantE.presentacionNombre })
  const recibos = await db.collection("operaciones_comandos").where("empresaId", "==", tenantE.empresaId).get(); expect(recibos.docs.filter(recibo => recibo.data().commandId === venta?.commandId)).toHaveLength(1)
  const ingresos = await db.collection("transacciones_financieras").where("empresaId", "==", tenantE.empresaId).where("ventaId", "==", venta?.id).get(); expect(ingresos.size).toBe(1); expect(ingresos.docs[0]?.data()).toMatchObject({ tipo: "ingreso", categoria: "ventas", monto: 10000, turnoId: null, usuarioId: tenantE.vendedor.uid, cuentaDocumentoId: crearIdentificadorInterno(tenantE.empresaId, "cuenta:caja-principal") })
  const movimientos = await db.collection("movimientos_inventario").where("empresaId", "==", tenantE.empresaId).where("referenciaId", "==", venta?.id).get(); expect(movimientos.size).toBe(1); expect(movimientos.docs[0]?.data()).toMatchObject({ articuloId: tenantE.productoId, cantidad: -4, referenciaColeccion: "ventas", referenciaId: venta?.id })
  expect((await db.collection("turnos").where("empresaId", "==", tenantE.empresaId).get()).docs.map(turno => turno.id)).toEqual(turnosAntes.docs.map(turno => turno.id))
  expect((await db.collection("productos").doc(tenantE.productoId).get()).data()?.stock).toBe(16)
})

test("Bodega conserva aislamiento A/B en UI y callable real", async ({ page }) => {
  await login(page, tenantA.vendedor); await expect(page.getByText("Tu espacio de ventas")).toBeVisible(); await expect(page.locator(`option[value="${tenantA.clienteId}"]`)).toHaveCount(1); await expect(page.getByRole("button", { name: tenantA.productoNombre })).toBeVisible(); await expect(page.locator(`option[value="${tenantB.clienteId}"]`)).toHaveCount(0); await expect(page.getByRole("button", { name: tenantB.productoNombre })).toHaveCount(0)
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
  await login(page, tenantA.admin, true); await expect(page.getByRole("heading", { name: "Tu negocio, de un vistazo" })).toBeVisible(); await page.goto("/pos"); await expect(page).toHaveURL(/\/admin$/); await expect(page.locator(".theme-pos")).toHaveCount(0)
  await page.goto("/admin/catalogo"); await expect(page.getByRole("article").filter({ hasText: tenantA.productoNombre })).toBeVisible(); await expect(page.getByRole("article").filter({ hasText: tenantB.productoNombre })).toHaveCount(0); await page.getByRole("article").filter({ hasText: tenantA.productoNombre }).locator("summary").click(); await page.getByLabel(`Precio ${tenantA.presentacionNombre}`).fill("5500"); await page.getByRole("button", { name: "Guardar" }).click(); await expect.poll(async () => (await getFirestore(app).collection("presentaciones_producto").doc(tenantA.presentacionId).get()).data()?.precioCOP).toBe(5500)
  await page.goto("/admin/clientes"); await expect(page.getByText(tenantA.clienteNombre)).toBeVisible(); await expect(page.getByText(tenantB.clienteNombre)).toHaveCount(0); await page.goto("/admin/inventario"); await expect(page.getByRole("heading", { name: "Existencias en unidad base" })).toBeVisible(); await page.goto("/admin/ventas"); await expect(page.getByRole("heading", { name: "Consulta operativa" })).toBeVisible(); await expect(page.getByText(tenantA.clienteNombre).first()).toBeVisible(); await expect(page.getByText(tenantB.clienteNombre)).toHaveCount(0)
})

test("admin Bodega completa perfil comercial en primer acceso y entra al panel al reingresar", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-12T12:00:00.000Z") })
  await login(page, tenantF.admin, true)
  await expect(page.getByRole("heading", { name: "Datos del negocio" })).toBeVisible()
  await expect(page.getByText("Guardar y continuar en DEMO")).toBeVisible()
  const nombreComercial = page.getByLabel("Nombre comercial")
  await nombreComercial.fill("Borrador local sin guardar")
  const refresh = page.waitForResponse((response) => response.url().includes("obtenerConfiguracionEmpresa") && response.request().method() === "POST")
  await page.clock.fastForward(60_000)
  await refresh
  await expect(nombreComercial).toHaveValue("Borrador local sin guardar")

  await nombreComercial.fill("  Distribuidora Sintética F   ")
  const solicitudesPerfil: Record<string, unknown>[] = []
  let perderPrimeraRespuesta = true
  await page.route("**/registrarPerfilComercialBodegaV1**", async route => {
    solicitudesPerfil.push(JSON.parse(route.request().postData() ?? "{}").data)
    if (perderPrimeraRespuesta) {
      perderPrimeraRespuesta = false
      await route.fetch()
      await route.abort("failed")
      return
    }
    await route.continue()
  })
  await page.getByRole("button", { name: "Guardar avance" }).click()
  await expect(page.getByRole("alert")).toBeVisible()
  const db = getFirestore(app)
  await expect.poll(async () => (await db.collection("configuraciones").doc(tenantF.empresaId).get()).data()?.revision).toBe(2)
  await page.getByRole("button", { name: "Guardar avance" }).click()
  await expect(nombreComercial).toBeDisabled()
  await expect(page.getByRole("status")).toHaveText("Avance guardado. Puedes volver después; los campos pendientes seguirán aquí.")
  await expect(nombreComercial).toBeEnabled()
  await page.unroute("**/registrarPerfilComercialBodegaV1**")
  expect(solicitudesPerfil).toHaveLength(2)
  expect(solicitudesPerfil[1].commandId).toBe(solicitudesPerfil[0].commandId)
  expect(solicitudesPerfil[1].idempotencyKey).toBe(solicitudesPerfil[0].idempotencyKey)
  const [auditoriasPerfil, eventosPerfil] = await Promise.all([
    db.collection("auditoria_logs").where("empresaId", "==", tenantF.empresaId).where("commandId", "==", `perfil-bodega-${solicitudesPerfil[0].commandId}`).get(),
    db.collection("eventos_dominio").where("empresaId", "==", tenantF.empresaId).where("commandId", "==", `perfil-bodega-${solicitudesPerfil[0].commandId}`).get(),
  ])
  expect(auditoriasPerfil.size).toBe(1)
  expect(eventosPerfil.size).toBe(1)
  await expect(page.getByRole("heading", { name: "Datos del negocio" })).toBeVisible()

  await page.reload()
  await expect(page.getByRole("heading", { name: "Datos del negocio" })).toBeVisible()
  await expect(page.getByLabel("Nombre comercial")).toHaveValue("Distribuidora Sintética F")
  await expect(page.getByLabel("Razón social")).toHaveValue("")

  await page.getByLabel("Razón social").fill("Distribuidora Sintética F S.A.S.")
  await page.getByLabel("Tipo de persona").selectOption("JURIDICA")
  await page.getByLabel("NIT", { exact: true }).fill("900373913")
  await page.getByLabel("Dígito de verificación").fill("4")
  await page.getByLabel("Correo de contacto").fill("Diana.Jimenez@Example.com")
  await page.getByLabel("Teléfono de contacto").fill("+573001234567")
  await page.getByLabel("Dirección del negocio").fill("Calle de prueba 123")
  await page.getByLabel("Departamento", { exact: true }).fill("BOGOTÁ, D.C.")
  await page.getByLabel("Ciudad o municipio", { exact: true }).fill("BOGOTÁ, D.C.")
  await page.getByRole("button", { name: "Guardar y continuar en DEMO" }).click()
  await expect(page.getByRole("heading", { name: "Tu negocio, de un vistazo" })).toBeVisible()

  const [company, config] = await Promise.all([
    db.collection("empresas").doc(tenantF.empresaId).get(),
    db.collection("configuraciones").doc(tenantF.empresaId).get(),
  ])
  expect(company.data()).toMatchObject({ nombre: "Distribuidora Sintética F", nombreComercial: "Distribuidora Sintética F", estado: "trial" })
  expect(config.data()?.identidadFiscal).toMatchObject({ razonSocial: "Distribuidora Sintética F S.A.S.", numeroDocumento: "900373913", digitoVerificacion: "4" })
  expect(config.data()?.identidadFiscal.contacto.email).toBe("diana.jimenez@example.com")
  expect(config.data()?.localizacion.direccion).toMatchObject({ departamentoCodigo: "11", departamentoNombre: "BOGOTÁ, D.C.", municipioCodigo: "11001", municipioNombre: "BOGOTÁ, D.C." })
  expect(evaluarReadinessConfiguracion(config.data() as any).fiscal.lista).toBe(false)

  await page.reload()
  await expect(page.getByRole("heading", { name: "Tu negocio, de un vistazo" })).toBeVisible()
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
  await expect(detalle).toContainText(/\$\s*10\.000/)
})

test("administrador Bodega B solo consulta su propio catálogo", async ({ page }) => {
  await login(page, tenantB.admin, true); await expect(page).toHaveURL(/\/admin$/); await expect(page.getByRole("heading", { name: "Tu negocio, de un vistazo" })).toBeVisible()
  await page.goto("/admin/catalogo"); await expect(page.getByRole("article").filter({ hasText: tenantB.productoNombre })).toBeVisible(); await expect(page.getByText(tenantA.productoNombre)).toHaveCount(0)
})

test("solicitudes y disponibilidad convergen sin refresco manual en vendedor y administración", async ({ page, browser }) => {
  const adminContext = await browser.newContext()
  const adminPage = await adminContext.newPage()
  try {
    await login(adminPage, tenantD.admin, true)
    await adminPage.goto("/admin/solicitudes")
    await expect(adminPage.getByRole("heading", { name: "Solicitudes de venta" })).toBeVisible()
    await expect(adminPage.getByText("No hay solicitudes pendientes de revisar.")).toBeVisible()

    await login(page, tenantD.vendedor)
    await page.getByRole("button", { name: tenantD.productoNombre }).click()
    await page.getByRole("button", { name: "Enviar solicitud" }).click()
    await expect(page.getByRole("heading", { name: "Mis solicitudes" })).toBeVisible()
    const sellerCard = page.getByRole("article").filter({ hasText: tenantD.clienteNombre })
    await expect(sellerCard.getByText("PENDIENTE APROBACION", { exact: true })).toBeVisible()

    const adminCard = adminPage.getByRole("article").filter({ hasText: tenantD.clienteNombre })
    await expect(adminCard).toBeVisible({ timeout: 15_000 })
    await expect(adminCard.getByText("PENDIENTE_APROBACION", { exact: true })).toBeVisible()
    await adminCard.getByRole("button", { name: "Aprobar" }).click()
    await expect(adminCard.getByText("APROBADA", { exact: true })).toBeVisible()
    await expect(sellerCard.getByText("APROBADA", { exact: true })).toBeVisible({ timeout: 15_000 })

    await page.getByRole("main").getByRole("button", { name: "Nueva" }).click()
    const producto = page.getByRole("button", { name: tenantD.productoNombre })
    await expect(producto).toContainText("Disponibles: 10")

    await adminPage.goto("/admin/inventario")
    const inventario = adminPage.getByRole("article").filter({ hasText: tenantD.productoNombre })
    await inventario.getByLabel(`Nuevo stock ${tenantD.productoNombre}`).fill("14")
    await inventario.getByRole("button", { name: "Ajustar" }).click()
    await expect(producto).toContainText("Disponibles: 7", { timeout: 15_000 })

    const db = getFirestore(app)
    expect((await db.collection("ventas").where("empresaId", "==", tenantD.empresaId).get()).size).toBe(0)
    expect((await db.collection("productos").doc(tenantD.productoId).get()).data()?.stock).toBe(14)
  } finally {
    await adminContext.close()
  }
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
  await login(page, tenantGeneral.admin); await expect(page.locator(".theme-pos")).toBeVisible(); await expect(page.getByText("Tu espacio de ventas")).toHaveCount(0); await expect(page).not.toHaveURL(/\/admin$/)
})
