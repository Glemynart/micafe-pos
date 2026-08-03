import { readFileSync } from "node:fs";
import { FieldValue } from "firebase-admin/firestore";
import { crearPlantillaConfiguracionRevision1 } from "../../lib/configuracion/plantilla";
import { MVP_COMERCIAL_CAPACIDADES } from "../plans/mvp-comercial";

process.env.E2E_P0_01_PROJECT_ID ??= "demo-p0-01-e2e";
process.env.E2E_P0_01_RUN_ID ??= "manual-browser-sales";
process.env.E2E_P0_01_OPERATIONAL_PIN_PEPPER ??= (() => {
  try {
    const line = readFileSync("functions/.secret.local", "utf8")
      .split(/\r?\n/)
      .find((value) => value.startsWith("OPERATIONAL_PIN_PEPPER="));
    return line?.slice("OPERATIONAL_PIN_PEPPER=".length) ?? "p0-01-e2e-local-pepper";
  } catch {
    return "p0-01-e2e-local-pepper";
  }
})();

const PROJECT_ID = process.env.E2E_P0_01_PROJECT_ID ?? "demo-p0-01-e2e";
const NUMERACION_ID_SUFFIX = "ventas_local_1";
const PRODUCT_ID = "producto-demo-cafe-americano";
const TURNO_ID = "turno-demo-ventas";

function exigirEmulador(nombre: string, valor: string | undefined): void {
  if (!valor?.startsWith("127.0.0.1:")) {
    throw new Error(`El fixture de ventas solo puede ejecutarse contra ${nombre} en localhost.`);
  }
}

async function borrarPorEmpresa(collection: FirebaseFirestore.CollectionReference, empresaId: string): Promise<void> {
  const snapshot = await collection.where("empresaId", "==", empresaId).get();
  await Promise.all(snapshot.docs.map((documento) => documento.ref.delete()));
}

async function limpiarDatosDeVenta(db: FirebaseFirestore.Firestore, empresaId: string): Promise<void> {
  const colecciones = [
    "numeraciones",
    "asignaciones_numeracion",
    "cuentas_bancarias",
    "productos",
    "recetas",
    "ventas",
    "pedidos_activos",
    "comandas_cocina",
    "turnos",
    "turnos_activos",
    "movimientos_inventario",
    "transacciones_financieras",
    "fiscal_comandos",
    "configuracion_command_ids",
    "auditoria_logs",
    "eventos_dominio",
  ];

  await Promise.all(colecciones.map((nombre) => borrarPorEmpresa(db.collection(nombre), empresaId)));
}

async function main(): Promise<void> {
  const { adminP001 } = await import("../../tests/e2e/p0-01/fixtures/entorno");
  const { prepararFixtureP001 } = await import("../../tests/e2e/p0-01/fixtures/datos");
  exigirEmulador("FIRESTORE_EMULATOR_HOST", process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8085");
  exigirEmulador("FIREBASE_AUTH_EMULATOR_HOST", process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099");

  const fixtureBase = await prepararFixtureP001("ventas-local");
  const { db } = adminP001();
  const empresaId = fixtureBase.empresaId;
  const uid = fixtureBase.admin.uid;

  await limpiarDatosDeVenta(db, empresaId);

  const empresaRef = db.collection("empresas").doc(empresaId);
  await empresaRef.set({ estado: "trial" }, { merge: true });

  const configuracionRef = db.collection("configuraciones").doc(empresaId);
  const configuracion = crearPlantillaConfiguracionRevision1({
    empresaId,
    nombreComercial: "Tenant E2E Ventas Local",
    creadaEn: new Date(),
    actualizadaEn: new Date(),
    ultimaMutacion: {
      actorTipo: "SYSTEM",
      actorId: "fixture-ventas-local",
      origen: "BOOTSTRAP",
      commandId: `fixture-ventas-${empresaId}`,
      correlationId: `fixture-ventas-${empresaId}`,
    },
  });
  configuracion.revision = 2;
  configuracion.identidadFiscal = {
    ...configuracion.identidadFiscal,
    nombreComercial: "Tenant E2E Ventas Local",
    razonSocial: "Tenant E2E Ventas Local S.A.S.",
    tipoPersona: "JURIDICA",
    tipoDocumento: "NIT",
    numeroDocumento: "900373913",
    digitoVerificacion: "4",
    regimenTributario: "no_responsable",
    responsabilidadesFiscales: ["R-99-PN"],
    actividadEconomicaPrincipal: "5610",
    contacto: { email: "ventas-local@e2e.local", telefono: "+573000000000" },
  };
  configuracion.localizacion.direccion = {
    linea1: "Calle 1 # 1-1",
    departamentoCodigo: "11",
    departamentoNombre: "Bogotá D.C.",
    municipioCodigo: "11001",
    municipioNombre: "Bogotá",
  };
  configuracion.modulos = { habilitados: [...MVP_COMERCIAL_CAPACIDADES] };
  await configuracionRef.set(configuracion);

  const numeracionId = `num_${empresaId}_${NUMERACION_ID_SUFFIX}`;
  await db.collection("numeraciones").doc(`${empresaId}_${numeracionId}`).set({
    empresaId,
    numeracionId,
    paisFiscal: "CO",
    tipoDocumento: "pos",
    scope: "EMPRESA",
    prefijo: "DEMO",
    resolucion: "RES-LOCAL-001",
    rangoInicio: 1,
    rangoFin: 5000,
    ultimoAsignado: 0,
    vigenciaDesde: "2026-01-01",
    vigenciaHasta: "2099-12-31",
    estado: "HABILITADA",
    revision: 2,
    schemaVersion: 1,
    creadaEn: FieldValue.serverTimestamp(),
    actualizadaEn: FieldValue.serverTimestamp(),
  });
  await db.collection("asignaciones_numeracion").doc(`${empresaId}_EMPRESA_pos`).set({
    empresaId,
    scope: "EMPRESA",
    tipoDocumento: "pos",
    numeracionId,
    estado: "VIGENTE",
    revision: 1,
    schemaVersion: 1,
    actualizadaEn: FieldValue.serverTimestamp(),
  });

  for (const cuenta of [
    { id: "caja-principal", claveOperativa: "caja-principal", nombre: "Caja Registradora", tipo: "efectivo" },
    { id: "bancolombia", claveOperativa: "bancolombia", nombre: "Bancolombia", tipo: "banco" },
  ]) {
    await db.collection("cuentas_bancarias").doc(cuenta.id).set({
      ...cuenta,
      empresaId,
      saldo: 0,
      estado: "activa",
      icono: cuenta.tipo === "banco" ? "Landmark" : "Banknote",
      color: cuenta.tipo === "banco" ? "#3b82f6" : "#10b981",
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    });
  }

  await db.collection("productos").doc(PRODUCT_ID).set({
    id: PRODUCT_ID,
    empresaId,
    nombre: "Café americano demo",
    precio: 6000,
    costo: 1500,
    stock: 100,
    stockMinimo: 5,
    imagenUrl: null,
    categoriaId: "cafe-general",
    espacioId: "cafe",
    activo: true,
    descripcion: "Producto temporal exclusivo del emulador.",
    unidad: "und",
    icono: "Coffee",
    impuestoTipo: "inc_8",
    secuenciaLedger: 0,
    creadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  });

  // El flujo de cobro lee recetas/{productoId} dentro de una transacción,
  // incluso cuando el producto no requiere receta. Un documento vacío
  // representa explícitamente ese caso y evita evaluar Rules contra un
  // documento inexistente en el emulador.
  await db.collection("recetas").doc(PRODUCT_ID).set({
    empresaId,
    productoId: PRODUCT_ID,
    ingredientes: [],
  });

  await db.collection("turnos").doc(TURNO_ID).set({
    id: TURNO_ID,
    empresaId,
    cajeroId: uid,
    cajeroNombre: fixtureBase.admin.nombre,
    fechaApertura: FieldValue.serverTimestamp(),
    fechaCierre: null,
    estado: "abierto",
    baseApertura: 0,
    ventasEfectivo: 0,
    ventasOtrosMetodos: 0,
    totalEgresos: 0,
    totalEsperadoEfectivo: 0,
    totalReportadoEfectivo: 0,
    diferenciaEfectivo: 0,
    notasApertura: "Turno sintético para prueba local de ventas.",
    notasCierre: "",
  });

  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    empresaId,
    tenant: "Tenant E2E Ventas Local",
    admin: fixtureBase.admin,
    espacios: fixtureBase.espacios,
    producto: { id: PRODUCT_ID, nombre: "Café americano demo", precio: 6000, stock: 100 },
    numeracion: { numeracionId, prefijo: "DEMO", rango: "1-5000", estado: "HABILITADA" },
    pagoRecomendado: "transferencia",
    turno: TURNO_ID,
    modules: [...MVP_COMERCIAL_CAPACIDADES],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
