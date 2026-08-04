import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  ejecutarAplicarEfectosVentaOperativaV1,
  ejecutarCerrarTurnoOperativoV1,
  ejecutarRegistrarEgresoOperativoV1,
  type ContextoFinancieroOperativo,
} from "../finanzas/callables";
import { crearIdentificadorInterno } from "./identificadores";
import { ejecutarAperturaTurnoOperativo } from "./executor";
import type { EnvelopeAbrirTurno } from "./contracts";

const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT_ID = process.env.E2E_P0_06_PROJECT_ID ?? "demo-p0-06-e2e";
const RUN_ID = process.env.E2E_P0_06_RUN_ID ?? `p0-06-${Date.now()}`;
const EVIDENCE_DIR = process.env.E2E_P0_06_EVIDENCE_DIR ?? "artifacts/e2e/p0-06/manual";

interface TenantFixture {
  empresaId: string;
  cajaId: string;
  fuerteId: string;
}

const ACTOR_UID = `p006-cajero-${RUN_ID}`;
const RELEVO_UID = `p006-relevo-${RUN_ID}`;

function exigirEmulador(): void {
  if (!FIRESTORE_EMULATOR_HOST?.startsWith("127.0.0.1:")) {
    throw new Error("P0-06 solo puede ejecutarse contra Firestore Emulator en 127.0.0.1.");
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error("P0-06 rechaza credenciales de aplicación para evitar cualquier escritura productiva.");
  }
}

function envelopeApertura(sufijo: string): EnvelopeAbrirTurno {
  return {
    commandId: `p006-open-${RUN_ID}-${sufijo}`,
    idempotencyKey: `p006-open-idem-${RUN_ID}-${sufijo}`,
    correlationId: `p006-open-corr-${RUN_ID}-${sufijo}`,
    causationId: null,
    motivo: null,
    payload: { baseApertura: 100, notasApertura: `Certificación P0-06 ${sufijo}` },
  };
}

function envelopeFinanciero(sufijo: string, payload: Record<string, unknown>, motivo: string) {
  return {
    commandId: `p006-${sufijo}-${RUN_ID}`,
    idempotencyKey: `p006-idem-${sufijo}-${RUN_ID}`,
    correlationId: `p006-corr-${sufijo}-${RUN_ID}`,
    causationId: `p006-cause-${sufijo}-${RUN_ID}`,
    motivo,
    payload,
  };
}

function contexto(empresaId: string, actorUid = ACTOR_UID, rol = "cajero"): ContextoFinancieroOperativo {
  return { empresaId, actorUid, rol };
}

async function borrarPorEmpresa(db: FirebaseFirestore.Firestore, collection: string, empresaId: string): Promise<void> {
  const snapshot = await db.collection(collection).where("empresaId", "==", empresaId).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

async function limpiarFixture(db: FirebaseFirestore.Firestore, tenants: TenantFixture[]): Promise<void> {
  const colecciones = [
    "empresas",
    "membresias",
    "cuentas_bancarias",
    "turnos",
    "turnos_activos",
    "ventas",
    "egresos",
    "transacciones_financieras",
    "operaciones_comandos",
    "operaciones_command_idempotency",
    "operaciones_auditoria",
  ];
  for (const tenant of tenants) {
    await Promise.all(colecciones.map((collection) => borrarPorEmpresa(db, collection, tenant.empresaId)));
  }
  await Promise.all([
    db.collection("usuarios").doc(ACTOR_UID).delete().catch(() => undefined),
    db.collection("usuarios").doc(RELEVO_UID).delete().catch(() => undefined),
  ]);
}

async function prepararFixture(db: FirebaseFirestore.Firestore, suffix: string): Promise<{ propio: TenantFixture; ajeno: TenantFixture }> {
  const tenants = ["a", "b"].map((letra): TenantFixture => {
    const empresaId = `e2e-p0-06-${suffix}-${letra}`;
    return {
      empresaId,
      cajaId: crearIdentificadorInterno(empresaId, "cuenta:caja-principal"),
      fuerteId: crearIdentificadorInterno(empresaId, "cuenta:caja-fuerte"),
    };
  });

  await limpiarFixture(db, tenants);
  const batch = db.batch();
  for (const [index, tenant] of tenants.entries()) {
    batch.set(db.collection("empresas").doc(tenant.empresaId), {
      empresaId: tenant.empresaId,
      nombre: `Tenant P0-06 ${index === 0 ? "A" : "B"}`,
      estado: "trial",
      esFundacional: false,
    });
    batch.set(db.collection("membresias").doc(`${tenant.empresaId}_${ACTOR_UID}`), {
      empresaId: tenant.empresaId,
      uid: ACTOR_UID,
      rol: "cajero",
      permisos: ["sell", "shifts"],
      estado: "activa",
      activo: true,
    });
    batch.set(db.collection("cuentas_bancarias").doc(tenant.cajaId), {
      id: tenant.cajaId,
      empresaId: tenant.empresaId,
      claveOperativa: "caja-principal",
      nombre: "Caja Registradora",
      saldo: 1000,
    });
    batch.set(db.collection("cuentas_bancarias").doc(tenant.fuerteId), {
      id: tenant.fuerteId,
      empresaId: tenant.empresaId,
      claveOperativa: "caja-fuerte",
      nombre: "Caja Fuerte",
      saldo: 0,
    });
  }
  batch.set(db.collection("usuarios").doc(ACTOR_UID), { nombre: "Cajero P0-06" });
  batch.set(db.collection("usuarios").doc(RELEVO_UID), { nombre: "Relevo P0-06" });
  batch.set(db.collection("membresias").doc(`${tenants[0].empresaId}_${RELEVO_UID}`), {
    empresaId: tenants[0].empresaId,
    uid: RELEVO_UID,
    rol: "cajero",
    permisos: ["sell", "shifts"],
    estado: "activa",
    activo: true,
  });
  await batch.commit();
  return { propio: tenants[0], ajeno: tenants[1] };
}

async function sembrarVentaDemo(db: FirebaseFirestore.Firestore, tenant: TenantFixture, turnoId: string, ventaId: string, total: number): Promise<void> {
  await db.collection("ventas").doc(ventaId).set({
    empresaId: tenant.empresaId,
    modoOperacion: "DEMO",
    referenciaOperacion: `DEMO-${ventaId}`,
    estado: "pagada",
    estadoOperativo: "PENDIENTE_EFECTOS",
    turnoId,
    metodoPago: "efectivo",
    totales: { subtotalBase: total, totalINC: 0, totalExcluido: total, total },
    items: [{ id: "quick-cafe-demo", cantidad: 1, nombre: "Café demo", precioUnitario: total, subtotal: total }],
  });
}

async function contar(db: FirebaseFirestore.Firestore, collection: string, empresaId: string): Promise<number> {
  return (await db.collection(collection).where("empresaId", "==", empresaId).get()).size;
}

test("P0-06: certifica ciclo multi-tenant de apertura, venta, egreso, relevo, arqueo y replay", async () => {
  exigirEmulador();
  const app = initializeApp({ projectId: PROJECT_ID }, `p0-06-${RUN_ID}`);
  const db = getFirestore(app);
  const suffix = RUN_ID.replace(/[^a-zA-Z0-9-]/g, "-");
  const evidence: Record<string, unknown> = {
    runId: RUN_ID,
    projectId: PROJECT_ID,
    target: "firestore-emulator",
    startedAt: new Date().toISOString(),
    status: "FAIL",
  };
  let tenants: { propio: TenantFixture; ajeno: TenantFixture } | undefined;

  try {
    tenants = await prepararFixture(db, suffix);
    const { propio, ajeno } = tenants;

    const aperturaPropia = envelopeApertura("tenant-a");
    const abiertoPropio = await ejecutarAperturaTurnoOperativo(db, { empresaId: propio.empresaId, actorUid: ACTOR_UID }, aperturaPropia);
    const replayApertura = await ejecutarAperturaTurnoOperativo(db, { empresaId: propio.empresaId, actorUid: ACTOR_UID }, aperturaPropia);
    assert.deepEqual(replayApertura, abiertoPropio, "la apertura repetida debe devolver el mismo recibo");

    const abiertoAjeno = await ejecutarAperturaTurnoOperativo(db, { empresaId: ajeno.empresaId, actorUid: ACTOR_UID }, envelopeApertura("tenant-b"));
    assert.notEqual(abiertoPropio.turnoId, abiertoAjeno.turnoId);
    assert.equal((await db.collection("turnos_activos").doc(crearIdentificadorInterno(propio.empresaId, ACTOR_UID)).get()).exists, true);
    assert.equal((await db.collection("turnos_activos").doc(crearIdentificadorInterno(ajeno.empresaId, ACTOR_UID)).get()).exists, true, "el mismo actor puede operar otro tenant sin colisión de lock");

    const ventaPropiaId = `venta-demo-a-${suffix}`;
    await sembrarVentaDemo(db, propio, abiertoPropio.turnoId, ventaPropiaId, 50);
    const efectosVentaPropia = await ejecutarAplicarEfectosVentaOperativaV1(
      db,
      contexto(propio.empresaId),
      envelopeFinanciero(`venta-a-${ventaPropiaId}`, { ventaId: ventaPropiaId }, "Efectos venta DEMO P0-06"),
    );
    assert.equal(efectosVentaPropia.ventaId, ventaPropiaId);
    const ventaPropia = (await db.collection("ventas").doc(ventaPropiaId).get()).data()!;
    assert.equal(ventaPropia.estadoOperativo, "COMPLETO");
    assert.equal(ventaPropia.modoOperacion, "DEMO");
    assert.equal("snapshotFiscal" in ventaPropia, false, "la venta DEMO no crea snapshot fiscal");
    assert.equal("consecutivo" in ventaPropia, false, "la venta DEMO no consume numeración");

    const egresoPropio = await ejecutarRegistrarEgresoOperativoV1(
      db,
      contexto(propio.empresaId),
      envelopeFinanciero("egreso-a", { turnoId: abiertoPropio.turnoId, monto: 10, cuentaClaveOperativa: "caja-principal" }, "Compra de insumos P0-06"),
    );
    assert.equal(typeof egresoPropio.egresoId, "string");

    const cierrePropio = envelopeFinanciero(
      "cierre-a",
      { turnoId: abiertoPropio.turnoId, efectivoContado: 130, relevoCajeroId: RELEVO_UID },
      "Relevo con faltante P0-06",
    );
    const resultadoCierrePropio = await ejecutarCerrarTurnoOperativoV1(db, contexto(propio.empresaId), cierrePropio);
    assert.equal(resultadoCierrePropio.efectivoEsperado, 140);
    assert.equal(resultadoCierrePropio.diferenciaEfectivo, -10);
    assert.equal(resultadoCierrePropio.depositoNeto, 30);
    assert.equal(resultadoCierrePropio.relevoCajeroId, RELEVO_UID);
    assert.equal(typeof resultadoCierrePropio.relevoTurnoId, "string");
    const replayCierrePropio = await ejecutarCerrarTurnoOperativoV1(db, contexto(propio.empresaId), cierrePropio);
    assert.deepEqual(replayCierrePropio, resultadoCierrePropio, "el cierre repetido no debe duplicar arqueo ni movimientos");

    const ventaAjenaId = `venta-demo-b-${suffix}`;
    await sembrarVentaDemo(db, ajeno, abiertoAjeno.turnoId, ventaAjenaId, 30);
    await ejecutarAplicarEfectosVentaOperativaV1(
      db,
      contexto(ajeno.empresaId),
      envelopeFinanciero(`venta-b-${ventaAjenaId}`, { ventaId: ventaAjenaId }, "Efectos venta DEMO tenant B"),
    );
    const resultadoCierreAjeno = await ejecutarCerrarTurnoOperativoV1(
      db,
      contexto(ajeno.empresaId),
      envelopeFinanciero("cierre-b", { turnoId: abiertoAjeno.turnoId, efectivoContado: 150 }, "Cierre con sobrante P0-06"),
    );
    assert.equal(resultadoCierreAjeno.efectivoEsperado, 130);
    assert.equal(resultadoCierreAjeno.diferenciaEfectivo, 20);
    assert.equal(resultadoCierreAjeno.depositoNeto, 50);

    const [cajaPropia, fuertePropia, cajaAjena, fuerteAjena] = await Promise.all([
      db.collection("cuentas_bancarias").doc(propio.cajaId).get(),
      db.collection("cuentas_bancarias").doc(propio.fuerteId).get(),
      db.collection("cuentas_bancarias").doc(ajeno.cajaId).get(),
      db.collection("cuentas_bancarias").doc(ajeno.fuerteId).get(),
    ]);
    assert.equal(cajaPropia.data()?.saldo, 1000);
    assert.equal(fuertePropia.data()?.saldo, 30);
    assert.equal(cajaAjena.data()?.saldo, 1000);
    assert.equal(fuerteAjena.data()?.saldo, 50);

    const turnoPropioCerrado = await db.collection("turnos").doc(abiertoPropio.turnoId).get();
    const turnoRelevo = await db.collection("turnos").doc(resultadoCierrePropio.relevoTurnoId as string).get();
    const lockPropioAnterior = await db.collection("turnos_activos").doc(crearIdentificadorInterno(propio.empresaId, ACTOR_UID)).get();
    const lockRelevo = await db.collection("turnos_activos").doc(crearIdentificadorInterno(propio.empresaId, RELEVO_UID)).get();
    const lockAjeno = await db.collection("turnos_activos").doc(crearIdentificadorInterno(ajeno.empresaId, ACTOR_UID)).get();
    assert.equal(turnoPropioCerrado.data()?.estado, "cerrado");
    assert.equal(turnoPropioCerrado.data()?.diferenciaEfectivo, -10);
    assert.equal(turnoRelevo.data()?.estado, "abierto");
    assert.equal(turnoRelevo.data()?.baseApertura, 100);
    assert.equal(lockPropioAnterior.exists, false);
    assert.equal(lockRelevo.data()?.turnoId, resultadoCierrePropio.relevoTurnoId);
    assert.equal(lockAjeno.exists, false, "el cierre del tenant B libera solo su lock");

    const movimientosPropios = await db.collection("transacciones_financieras").where("empresaId", "==", propio.empresaId).get();
    const movimientosAjenos = await db.collection("transacciones_financieras").where("empresaId", "==", ajeno.empresaId).get();
    assert.equal(movimientosPropios.size, 5, "venta, egreso, depósito y faltante deben formar un ledger completo");
    assert.equal(movimientosAjenos.size, 4, "venta, depósito y sobrante deben quedar en el tenant B");
    assert.equal(movimientosPropios.docs.some((doc) => doc.data().empresaId !== propio.empresaId), false);
    assert.equal(movimientosAjenos.docs.some((doc) => doc.data().empresaId !== ajeno.empresaId), false);
    assert.equal(await contar(db, "operaciones_auditoria", propio.empresaId), 4);
    assert.equal(await contar(db, "operaciones_auditoria", ajeno.empresaId), 3);

    evidence.status = "PASS";
    evidence.completedAt = new Date().toISOString();
    evidence.tenants = { propio: propio.empresaId, ajeno: ajeno.empresaId };
    evidence.assertions = [
      "apertura autoritativa e idempotente",
      "locks aislados por empresaId",
      "venta DEMO sin snapshot fiscal ni numeración",
      "egreso operativo dentro del turno",
      "cierre con faltante y relevo automático",
      "cierre con sobrante en tenant independiente",
      "saldos, ledger, auditoría y replay consistentes",
    ];
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
    evidence.completedAt = new Date().toISOString();
    throw error;
  } finally {
    try {
      if (tenants) await limpiarFixture(db, [tenants.propio, tenants.ajeno]);
    } finally {
      mkdirSync(EVIDENCE_DIR, { recursive: true });
      writeFileSync(`${EVIDENCE_DIR}/certificacion.json`, `${JSON.stringify(evidence, null, 2)}\n`);
      await deleteApp(app);
    }
  }
});
