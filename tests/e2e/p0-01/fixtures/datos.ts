import bcrypt from "bcryptjs";
import { FieldValue } from "firebase-admin/firestore";
import { crearPlantillaConfiguracionRevision1 } from "../../../../lib/configuracion/plantilla";
import { MVP_COMERCIAL_CAPACIDADES } from "../../../../scripts/plans/mvp-comercial";
import { adminP001, E2E_P0_01_RUN_ID } from "./entorno";

/**
 * El smoke debe certificar el contrato del Plan aprobado, no una combinación
 * histórica de permisos que ya no representa el MVP comercial.
 */
export const P0_01_MODULES = MVP_COMERCIAL_CAPACIDADES;
const PIN = "123456";
const PEPPER = process.env.E2E_P0_01_OPERATIONAL_PIN_PEPPER ?? "p0-01-e2e-local-pepper";

const SPACES = [
  { id: "cafe", nombre: "Cafetería", icono: "Coffee", color: "#7c3aed", orden: 1 },
  { id: "salon", nombre: "Salón principal", icono: "Armchair", color: "#0ea5e9", orden: 2 },
] as const;

export interface FixtureP001 {
  runId: string;
  empresaId: string;
  admin: { uid: string; codigo: string; pin: string; nombre: string };
  espacios: readonly (typeof SPACES[number])[];
}

function idSeguro(valor: string): string {
  return valor.replace(/[^a-zA-Z0-9-]/g, "-").slice(-42);
}

async function borrarPorEmpresa(collection: FirebaseFirestore.CollectionReference, empresaId: string): Promise<void> {
  const snapshot = await collection.where("empresaId", "==", empresaId).get();
  await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
}

async function borrarFixture(fixture: Pick<FixtureP001, "empresaId" | "admin">, planId: string): Promise<void> {
  const { auth, db } = adminP001();
  await Promise.all([
    borrarPorEmpresa(db.collection("espacios"), fixture.empresaId),
    borrarPorEmpresa(db.collection("categorias"), fixture.empresaId),
    borrarPorEmpresa(db.collection("credenciales_operativas"), fixture.empresaId),
    borrarPorEmpresa(db.collection("membresias"), fixture.empresaId),
    borrarPorEmpresa(db.collection("usuarios"), fixture.empresaId),
  ]);
  await Promise.all([
    db.collection("configuraciones").doc(fixture.empresaId).delete().catch(() => undefined),
    db.collection("suscripciones").doc(fixture.empresaId).delete().catch(() => undefined),
    db.collection("empresas").doc(fixture.empresaId).delete().catch(() => undefined),
    db.collection("planes").doc(planId).collection("versiones").doc("1").delete().catch(() => undefined),
    db.collection("planes").doc(planId).delete().catch(() => undefined),
    auth.deleteUser(fixture.admin.uid).catch(() => undefined),
  ]);
}

export async function prepararFixtureP001(nombre: string): Promise<FixtureP001> {
  const { auth, db } = adminP001();
  const runId = `${E2E_P0_01_RUN_ID}-${idSeguro(nombre)}`;
  const empresaId = `e2e-p0-01-${idSeguro(runId)}`;
  const planId = "mvp_comercial";
  const uid = `${empresaId}-admin`;
  const codigo = `p001-${idSeguro(runId).slice(-8)}-admin`.toLowerCase();
  const admin = { uid, codigo, pin: PIN, nombre: "Administrador E2E P0-01" };

  await borrarFixture({ empresaId, admin }, planId);
  await auth.createUser({ uid, displayName: admin.nombre, email: `${uid}@e2e.local` });
  await auth.setCustomUserClaims(uid, { empresaId, rol: "admin" });

  await db.collection("empresas").doc(empresaId).set({
    empresaId,
    ownerUid: uid,
    nombre: "Tenant E2E P0-01",
    nombreComercial: "Tenant E2E P0-01",
    estado: "activa",
    paisFiscal: "CO",
    revision: 1,
    creadaEn: FieldValue.serverTimestamp(),
    actualizadaEn: FieldValue.serverTimestamp(),
  });
  await db.collection("usuarios").doc(uid).set({
    empresaId,
    nombre: admin.nombre,
    username: codigo,
    email: `${uid}@e2e.local`,
    activo: true,
  });
  await db.collection("membresias").doc(`${empresaId}_${uid}`).set({
    empresaId,
    uid,
    rol: "admin",
    permisos: [...P0_01_MODULES],
    estado: "activa",
    activo: true,
  });
  await db.collection("credenciales_operativas").doc(`${empresaId}_${codigo}`).set({
    empresaId,
    uid,
    codigo,
    pinHash: await bcrypt.hash(`${PIN}:${PEPPER}`, 12),
    activo: true,
    fallosConsecutivos: 0,
    bloqueadoHasta: null,
    requiereCambio: false,
  });

  const configuracion = crearPlantillaConfiguracionRevision1({
    empresaId,
    nombreComercial: "Tenant E2E P0-01",
    creadaEn: new Date(),
    actualizadaEn: new Date(),
    ultimaMutacion: {
      actorTipo: "SYSTEM",
      actorId: "e2e",
      origen: "BOOTSTRAP",
      commandId: `seed-${runId}`,
      correlationId: `seed-${runId}`,
    },
  });
  configuracion.modulos = {
    ...configuracion.modulos,
    habilitados: [...P0_01_MODULES] as typeof configuracion.modulos.habilitados,
  };
  await db.collection("configuraciones").doc(empresaId).set(configuracion);

  await db.collection("planes").doc(planId).set({
    planId,
    codigo: "MVP_COMERCIAL",
    revision: 1,
    versionActual: 1,
    creadaEn: FieldValue.serverTimestamp(),
  });
  await db.collection("planes").doc(planId).collection("versiones").doc("1").set({
    schemaVersion: 1,
    planId,
    codigo: "MVP_COMERCIAL",
    planVersion: 1,
    estado: "PUBLICADA",
    capacidades: [...P0_01_MODULES],
    limites: {},
    periodicidad: "MENSUAL",
    grandfathered: false,
    revision: 1,
  });
  await db.collection("suscripciones").doc(empresaId).set({
    empresaId,
    planId,
    planVersion: 1,
    estado: "active",
    periodoInicio: "2026-01-01",
    periodoFin: "2027-01-01",
    revision: 1,
    schemaVersion: 1,
  });

  for (const espacio of SPACES) {
    await db.collection("espacios").doc(espacio.id).set({
      ...espacio,
      empresaId,
      activo: true,
    });
    await db.collection("categorias").doc(`${espacio.id}-general`).set({
      empresaId,
      espacioId: espacio.id,
      nombre: `Categoría ${espacio.nombre}`,
      icono: "Tag",
      activo: true,
      orden: 1,
    });
  }

  return { runId, empresaId, admin, espacios: SPACES };
}

export async function limpiarFixtureP001(fixture: FixtureP001): Promise<void> {
  await borrarFixture(fixture, "mvp_comercial");
}
