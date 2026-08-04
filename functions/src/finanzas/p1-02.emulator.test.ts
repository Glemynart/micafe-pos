import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { crearPlantillaConfiguracionRevision1 } from "../../../lib/configuracion/plantilla";
import { MVP_COMERCIAL_CAPACIDADES } from "../../../scripts/plans/mvp-comercial";
import { crearVentaDemostracion, type ContextoFiscal } from "../fiscal/service";
import {
  ejecutarAplicarEfectosVentaOperativaV1,
  type ContextoFinancieroOperativo,
} from "./callables";
import { crearIdentificadorInterno } from "../turnos/identificadores";

const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.E2E_P1_02_PROJECT_ID ?? "demo-p1-02-e2e";
const RUN_ID = process.env.E2E_P1_02_RUN_ID ?? `p1-02-${Date.now()}`;
const EVIDENCE_DIR = process.env.E2E_P1_02_EVIDENCE_DIR ?? "artifacts/e2e/p1-02/manual";
const ACTOR_UID = `p102-admin-${RUN_ID}`;
const PLAN_ID = "mvp_comercial";

interface TenantFixture {
  empresaId: string;
  productoId: string;
  frijolId: string;
  lecheId: string;
  grupoId: string;
  relacionId: string;
  turnoId: string;
  cajaId: string;
}

function exigirEmulador(): void {
  if (!FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:")) {
    throw new Error("P1-02 solo puede ejecutarse contra Firestore Emulator en 127.0.0.1.");
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("P1-02 rechaza credenciales de aplicacion para evitar escrituras productivas.");
  }
}

async function prepararPlan(db: FirebaseFirestore.Firestore): Promise<void> {
  await db.collection("planes").doc(PLAN_ID).set({
    planId: PLAN_ID,
    codigo: "MVP_COMERCIAL",
    revision: 1,
    versionActual: 1,
    creadaEn: FieldValue.serverTimestamp(),
  });
  await db.collection("planes").doc(PLAN_ID).collection("versiones").doc("1").set({
    schemaVersion: 1,
    planId: PLAN_ID,
    codigo: "MVP_COMERCIAL",
    planVersion: 1,
    estado: "PUBLICADA",
    capacidades: [...MVP_COMERCIAL_CAPACIDADES],
    limites: {},
    periodicidad: "MENSUAL",
    grandfathered: false,
    revision: 1,
  });
}

async function prepararTenant(db: FirebaseFirestore.Firestore, letra: "a" | "b"): Promise<TenantFixture> {
  const empresaId = `e2e-p1-02-${RUN_ID}-${letra}`;
  const fixture: TenantFixture = {
    empresaId,
    productoId: `producto-p102-${letra}`,
    frijolId: `insumo-frijol-p102-${letra}`,
    lecheId: `insumo-leche-p102-${letra}`,
    grupoId: `grupo-leche-p102-${letra}`,
    relacionId: `relacion-latte-p102-${letra}`,
    turnoId: `turno-p102-${letra}`,
    cajaId: crearIdentificadorInterno(empresaId, "cuenta:caja-principal"),
  };

  await db.collection("empresas").doc(empresaId).set({
    empresaId,
    nombre: `Tenant P1-02 ${letra.toUpperCase()}`,
    nombreComercial: `Tenant P1-02 ${letra.toUpperCase()}`,
    estado: "trial",
    paisFiscal: "CO",
    esFundacional: false,
  });
  await db.collection("membresias").doc(`${empresaId}_${ACTOR_UID}`).set({
    empresaId,
    uid: ACTOR_UID,
    rol: "admin",
    permisos: ["sell", "inventory"],
    estado: "activa",
    activo: true,
  });

  const configuracion = crearPlantillaConfiguracionRevision1({
    empresaId,
    nombreComercial: `Tenant P1-02 ${letra.toUpperCase()}`,
    creadaEn: new Date(),
    actualizadaEn: new Date(),
    ultimaMutacion: {
      actorTipo: "SYSTEM",
      actorId: "p1-02-fixture",
      origen: "BOOTSTRAP",
      commandId: `p102-seed-${RUN_ID}-${letra}`,
      correlationId: `p102-seed-corr-${RUN_ID}-${letra}`,
    },
  });
  configuracion.modulos = {
    ...configuracion.modulos,
    habilitados: [...MVP_COMERCIAL_CAPACIDADES] as typeof configuracion.modulos.habilitados,
  };
  await db.collection("configuraciones").doc(empresaId).set(configuracion);
  await db.collection("suscripciones").doc(empresaId).set({
    empresaId,
    planId: PLAN_ID,
    planVersion: 1,
    estado: "trialing",
    trialInicio: "2026-08-01",
    trialFin: "2099-12-31",
    revision: 1,
    schemaVersion: 1,
  });
  await db.collection("espacios").doc("cafeteria").set({
    empresaId,
    nombre: "CafeterÃ­a",
    activo: true,
  });

  await db.collection("productos").doc(fixture.productoId).set({
    id: fixture.productoId,
    empresaId,
    espacioId: "cafeteria",
    nombre: `Latte tenant ${letra.toUpperCase()}`,
    precio: 6000,
    costo: 1500,
    stock: 10,
    unidad: "und",
    activo: true,
    secuenciaLedger: 0,
  });
  await db.collection("insumos").doc(fixture.frijolId).set({
    id: fixture.frijolId,
    empresaId,
    espacioId: "cafeteria",
    nombre: "Cafe molido",
    unidad: "g",
    unidadMedida: "g",
    stock: 20,
    costo: 100,
    secuenciaLedger: 0,
  });
  await db.collection("insumos").doc(fixture.lecheId).set({
    id: fixture.lecheId,
    empresaId,
    espacioId: "cafeteria",
    nombre: "Leche",
    unidad: "ml",
    unidadMedida: "ml",
    stock: 30,
    costo: 20,
    secuenciaLedger: 0,
  });
  await db.collection("recetas").doc(fixture.productoId).set({
    empresaId,
    productoId: fixture.productoId,
    ingredientes: [
      { insumoId: fixture.frijolId, cantidad: 1 },
      { insumoId: fixture.lecheId, cantidad: 2 },
    ],
  });
  await db.collection("modificador_grupos").doc(fixture.grupoId).set({
    empresaId,
    espacioId: "cafeteria",
    nombre: "Tipo de leche",
    minSeleccion: 0,
    maxSeleccion: 1,
    activo: true,
    orden: 1,
    opciones: [{ id: "avena", nombre: "Avena", precioDelta: 1000, activo: true, orden: 1, cocinaNombre: "LECHE AVENA" }],
  });
  await db.collection("producto_modificador_grupos").doc(fixture.relacionId).set({
    empresaId,
    espacioId: "cafeteria",
    productoId: fixture.productoId,
    grupoId: fixture.grupoId,
    orden: 1,
    activo: true,
  });
  await db.collection("cuentas_bancarias").doc(fixture.cajaId).set({
    id: fixture.cajaId,
    empresaId,
    claveOperativa: "caja-principal",
    nombre: "Caja Registradora",
    saldo: 1000,
  });
  await db.collection("turnos").doc(fixture.turnoId).set({
    id: fixture.turnoId,
    empresaId,
    cajeroId: ACTOR_UID,
    estado: "abierto",
  });
  return fixture;
}

function ventaDemoInput(tenant: TenantFixture, suffix: string) {
  const modificadores = [{
    grupoId: tenant.grupoId,
    opcionIds: ["avena"],
    nombreGrupo: "Tipo de leche",
    opciones: [{ opcionId: "avena", nombre: "Avena", precioDelta: 1000, cocinaNombre: "LECHE AVENA" }],
  }];
  return {
    commandId: `p102-demo-command-${suffix}-${RUN_ID}`,
    idempotencyKey: `p102-demo-idem-${suffix}-${RUN_ID}`,
    correlationId: `p102-demo-corr-${suffix}-${RUN_ID}`,
    causationId: `p102-demo-cause-${suffix}-${RUN_ID}`,
    expectedRevision: 1,
    ventaId: `venta-p102-${suffix}-${RUN_ID}`,
    espacioId: "cafeteria",
    venta: {
      turnoId: tenant.turnoId,
      cajeroId: ACTOR_UID,
      cajeroNombre: "Administrador P1-02",
      metodoPago: "efectivo",
      dineroRecibido: 20000,
      cambio: 6000,
      items: [{
        id: tenant.productoId,
        nombre: "Nombre manipulado por cliente",
        cantidad: 2,
        precioBaseUnitario: 6000,
        precioUnitario: 7000,
        costoUnitario: 999999,
        subtotal: 14000,
        schemaVersion: 1,
        configurationKey: `mod:v1|p:${tenant.productoId}|g:${tenant.grupoId}:avena`,
        modificadores,
      }],
    },
  };
}

function efectosInput(ventaId: string, suffix: string) {
  return {
    commandId: `p102-effects-command-${suffix}-${RUN_ID}`,
    idempotencyKey: `p102-effects-idem-${suffix}-${RUN_ID}`,
    correlationId: `p102-effects-corr-${suffix}-${RUN_ID}`,
    causationId: `p102-effects-cause-${suffix}-${RUN_ID}`,
    payload: { ventaId },
  };
}

function contarColeccion(snapshot: FirebaseFirestore.QuerySnapshot): number {
  return snapshot.size;
}

test("P1-02: venta DEMO con receta y modificadores conserva snapshots, consume insumos y es idempotente entre tenants", { skip: !FIRESTORE_EMULATOR_HOST }, async () => {
  exigirEmulador();
  const app = initializeApp({ projectId: PROJECT_ID }, `p1-02-${RUN_ID}`);
  const db = getFirestore(app);
  const evidence: Record<string, unknown> = {
    runId: RUN_ID,
    projectId: PROJECT_ID,
    target: "firestore-emulator",
    startedAt: new Date().toISOString(),
    status: "FAIL",
  };
  let tenants: TenantFixture[] = [];

  try {
    await prepararPlan(db);
    tenants = [await prepararTenant(db, "a"), await prepararTenant(db, "b")];
    const [tenantA, tenantB] = tenants;
    const contextoFiscal: ContextoFiscal = {
      empresaId: tenantA.empresaId,
      actorId: ACTOR_UID,
      paisFiscal: "CO",
      origen: "ADMIN",
      rolEfectivo: "admin",
    };
    const entradaDemo = ventaDemoInput(tenantA, "a");

    const creada = await crearVentaDemostracion(db, entradaDemo, contextoFiscal);
    assert.equal(creada.modoOperacion, "DEMO");
    assert.equal(creada.idempotente, false);

    const ventaAntesDeEfectos = (await db.collection("ventas").doc(entradaDemo.ventaId).get()).data()!;
    assert.equal(ventaAntesDeEfectos.empresaId, tenantA.empresaId);
    assert.equal(ventaAntesDeEfectos.estadoOperativo, "PENDIENTE_EFECTOS");
    assert.equal(ventaAntesDeEfectos.items[0].nombre, `Latte tenant A`);
    assert.equal(ventaAntesDeEfectos.items[0].costoUnitario, 1500);
    assert.deepEqual(ventaAntesDeEfectos.items[0].modificadores, entradaDemo.venta.items[0].modificadores);
    assert.equal("snapshotFiscal" in ventaAntesDeEfectos, false);
    assert.equal("consecutivo" in ventaAntesDeEfectos, false);
    const auditoriasDemo = await db.collection("auditoria_logs").where("empresaId", "==", tenantA.empresaId).get();
    const comandosDemo = await db.collection("fiscal_comandos").where("empresaId", "==", tenantA.empresaId).get();
    assert.equal(auditoriasDemo.size, 1);
    assert.equal(auditoriasDemo.docs[0].data().comando, "VentaDemostracionCreada");
    assert.equal(comandosDemo.size, 1);

    const replayCreacion = await crearVentaDemostracion(db, entradaDemo, contextoFiscal);
    assert.deepEqual(replayCreacion, { ...creada, idempotente: true });
    assert.equal(contarColeccion(await db.collection("ventas").where("empresaId", "==", tenantA.empresaId).get()), 1);

    const contextoFinanciero: ContextoFinancieroOperativo = {
      empresaId: tenantA.empresaId,
      actorUid: ACTOR_UID,
      rol: "admin",
    };
    const entradaEfectos = efectosInput(entradaDemo.ventaId, "a");
    const efectos = await ejecutarAplicarEfectosVentaOperativaV1(db, contextoFinanciero, entradaEfectos);
    assert.equal(efectos.ventaId, entradaDemo.ventaId);
    assert.deepEqual(efectos.incidenciasInventario, []);

    const ventaCompleta = (await db.collection("ventas").doc(entradaDemo.ventaId).get()).data()!;
    assert.equal(ventaCompleta.estadoOperativo, "COMPLETO");
    assert.equal(ventaCompleta.modoOperacion, "DEMO");
    assert.equal("snapshotFiscal" in ventaCompleta, false);
    assert.equal("consecutivo" in ventaCompleta, false);
    const auditoriasEfectos = await db.collection("operaciones_auditoria").where("empresaId", "==", tenantA.empresaId).get();
    const recibosEfectos = await db.collection("operaciones_comandos").where("empresaId", "==", tenantA.empresaId).get();
    const indicesEfectos = await db.collection("operaciones_command_idempotency").where("empresaId", "==", tenantA.empresaId).get();
    assert.equal(auditoriasEfectos.size, 1);
    assert.equal(auditoriasEfectos.docs[0].data().tipo, "aplicarEfectosVentaOperativaV1");
    assert.equal(recibosEfectos.size, 1);
    assert.equal(indicesEfectos.size, 1);

    const [producto, frijol, leche, caja] = await Promise.all([
      db.collection("productos").doc(tenantA.productoId).get(),
      db.collection("insumos").doc(tenantA.frijolId).get(),
      db.collection("insumos").doc(tenantA.lecheId).get(),
      db.collection("cuentas_bancarias").doc(tenantA.cajaId).get(),
    ]);
    assert.equal(producto.data()?.stock, 10, "una receta consume insumos, no el stock del producto terminado");
    assert.equal(frijol.data()?.stock, 18);
    assert.equal(leche.data()?.stock, 26);
    assert.equal(caja.data()?.saldo, 15000);

    const movimientos = await db.collection("movimientos_inventario").where("empresaId", "==", tenantA.empresaId).get();
    const consumos = movimientos.docs.filter((documento) => documento.data().tipo === "consumo_receta");
    assert.equal(consumos.length, 2);
    assert.deepEqual(
      consumos.map((documento) => ({ articuloId: documento.data().articuloId, cantidad: documento.data().cantidad, referenciaId: documento.data().referenciaId })).sort((a, b) => a.articuloId.localeCompare(b.articuloId)),
      [
        { articuloId: tenantA.frijolId, cantidad: -2, referenciaId: entradaDemo.ventaId },
        { articuloId: tenantA.lecheId, cantidad: -4, referenciaId: entradaDemo.ventaId },
      ].sort((a, b) => a.articuloId.localeCompare(b.articuloId)),
    );

    const movimientosAntesReplay = contarColeccion(movimientos);
    const replayEfectos = await ejecutarAplicarEfectosVentaOperativaV1(db, contextoFinanciero, entradaEfectos);
    assert.deepEqual(replayEfectos, efectos);
    assert.equal((await db.collection("operaciones_auditoria").where("empresaId", "==", tenantA.empresaId).get()).size, 1);
    assert.equal((await db.collection("operaciones_comandos").where("empresaId", "==", tenantA.empresaId).get()).size, 1);
    assert.equal((await db.collection("fiscal_comandos").where("empresaId", "==", tenantA.empresaId).get()).size, 1);
    assert.equal(contarColeccion(await db.collection("movimientos_inventario").where("empresaId", "==", tenantA.empresaId).get()), movimientosAntesReplay);
    assert.equal((await db.collection("insumos").doc(tenantA.frijolId).get()).data()?.stock, 18);

    const antesTenantB = {
      frijol: (await db.collection("insumos").doc(tenantB.frijolId).get()).data()?.stock,
      leche: (await db.collection("insumos").doc(tenantB.lecheId).get()).data()?.stock,
      caja: (await db.collection("cuentas_bancarias").doc(tenantB.cajaId).get()).data()?.saldo,
    };
    await assert.rejects(
      ejecutarAplicarEfectosVentaOperativaV1(db, { empresaId: tenantB.empresaId, actorUid: ACTOR_UID, rol: "admin" }, entradaEfectos),
      /VENTA_NO_PENDIENTE|No fue posible completar/,
    );
    assert.deepEqual({
      frijol: (await db.collection("insumos").doc(tenantB.frijolId).get()).data()?.stock,
      leche: (await db.collection("insumos").doc(tenantB.lecheId).get()).data()?.stock,
      caja: (await db.collection("cuentas_bancarias").doc(tenantB.cajaId).get()).data()?.saldo,
    }, antesTenantB);
    assert.equal(contarColeccion(await db.collection("movimientos_inventario").where("empresaId", "==", tenantB.empresaId).get()), 0);
    assert.equal((await db.collection("auditoria_logs").where("empresaId", "==", tenantB.empresaId).get()).size, 0);
    assert.equal((await db.collection("operaciones_auditoria").where("empresaId", "==", tenantB.empresaId).get()).size, 0);
    assert.equal((await db.collection("operaciones_comandos").where("empresaId", "==", tenantB.empresaId).get()).size, 0);

    evidence.status = "PASS";
    evidence.tenantA = { empresaId: tenantA.empresaId, ventaId: entradaDemo.ventaId, insumosConsumidos: consumos.map((documento) => documento.data().articuloId) };
    evidence.tenantB = { empresaId: tenantB.empresaId, isolated: true };
    evidence.completedAt = new Date().toISOString();
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(`${EVIDENCE_DIR}/run-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await deleteApp(app);
  }
});
