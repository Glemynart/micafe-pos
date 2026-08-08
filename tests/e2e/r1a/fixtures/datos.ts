import bcrypt from "bcryptjs";
import { crearPlantillaConfiguracionRevision1 } from "../../../../lib/configuracion/plantilla";
import { adminE2E, E2E_R1A_RUN_ID } from "./entorno";

export interface OperadorE2E {
  uid: string;
  codigo: string;
  pin: string;
  nombre: string;
}

export interface FixtureR1A {
  runId: string;
  empresaId: string;
  cajero: OperadorE2E;
  supervisor: OperadorE2E;
  admin: OperadorE2E;
  sinPermiso: OperadorE2E;
}

const PIN = "123456";
const PEPPER = process.env.E2E_R1A_OPERATIONAL_PIN_PEPPER ?? "r1a-e2e-local-pepper";

function idSeguro(valor: string): string {
  return valor.replace(/[^a-zA-Z0-9-]/g, "-").slice(-48);
}

function codigoSeguro(valor: string, sufijo: string): string {
  // El contrato productivo limita el código operativo a 32 caracteres.
  return `r1a-${valor.replace(/[^a-zA-Z0-9-]/g, "-").slice(-16)}-${sufijo.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 10)}`.toLowerCase();
}

async function sembrarOperador(input: { empresaId: string; runId: string; sufijo: string; rol: "admin" | "cajero" | "supervisor"; permisos: string[] }): Promise<OperadorE2E> {
  const { auth, db } = adminE2E();
  const uid = `e2e-r1a-${idSeguro(input.runId)}-${input.sufijo}`;
  const codigo = codigoSeguro(input.runId, input.sufijo);
  const nombre = `E2E ${input.sufijo}`;
  await auth.deleteUser(uid).catch(() => undefined);
  await auth.createUser({ uid, displayName: nombre });
  await auth.setCustomUserClaims(uid, { empresaId: input.empresaId, rol: input.rol });
  await db.collection("usuarios").doc(uid).set({ nombre, username: codigo, email: `${uid}@e2e.local`, activo: true });
  await db.collection("membresias").doc(`${input.empresaId}_${uid}`).set({
    empresaId: input.empresaId, uid, rol: input.rol, permisos: input.permisos, estado: "activa", activo: true,
  });
  await db.collection("credenciales_operativas").doc(`${input.empresaId}_${codigo}`).set({
    empresaId: input.empresaId, uid, codigo, pinHash: await bcrypt.hash(`${PIN}:${PEPPER}`, 12),
    activo: true, fallosConsecutivos: 0, bloqueadoHasta: null, requiereCambio: false,
  });
  return { uid, codigo, pin: PIN, nombre };
}

/** Siembra por runId. Repetir la misma llamada deja el mismo estado de prueba. */
export async function prepararFixtureR1A(nombre: string): Promise<FixtureR1A> {
  const { db } = adminE2E();
  const runId = `${E2E_R1A_RUN_ID}-${idSeguro(nombre)}`;
  const empresaId = `e2e-r1a-${idSeguro(runId)}`;
  await limpiarFixtureR1A({ runId, empresaId } as FixtureR1A);
  await db.collection("empresas").doc(empresaId).set({ estado: "trial", nombre: `Empresa ${runId}`, paisFiscal: "CO" });
  const configuracion = crearPlantillaConfiguracionRevision1({
    empresaId,
    nombreComercial: `Empresa ${runId}`,
    creadaEn: new Date(),
    actualizadaEn: new Date(),
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "e2e", origen: "BOOTSTRAP", commandId: `seed-${runId}`, correlationId: `seed-${runId}` },
  });
  configuracion.caja = { ...configuracion.caja, baseAperturaSugerida: 0 };
  configuracion.modulos = {
    ...configuracion.modulos,
    habilitados: [...new Set([...configuracion.modulos.habilitados, "sell", "shifts"])] as typeof configuracion.modulos.habilitados,
  };
  await db.collection("configuraciones").doc(empresaId).set(configuracion);
  await db.collection("planes").doc("mvp_comercial").collection("versiones").doc("1").set({
    planId: "mvp_comercial",
    planVersion: 1,
    estado: "PUBLICADA",
    capacidades: ["sell", "shifts"],
    limites: {},
    periodicidad: "MENSUAL",
    grandfathered: false,
    revision: 1,
    schemaVersion: 1,
  });
  const hoy = new Date();
  const trialFin = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000);
  await db.collection("suscripciones").doc(empresaId).set({
    empresaId,
    planId: "mvp_comercial",
    planVersion: 1,
    estado: "trialing",
    trialInicio: hoy.toISOString().slice(0, 10),
    trialFin: trialFin.toISOString().slice(0, 10),
    revision: 1,
    schemaVersion: 1,
  });
  const [cajero, supervisor, admin, sinPermiso] = await Promise.all([
    sembrarOperador({ empresaId, runId, sufijo: "cajero", rol: "cajero", permisos: ["shifts", "sell"] }),
    sembrarOperador({ empresaId, runId, sufijo: "supervisor", rol: "supervisor", permisos: ["shifts", "sell"] }),
    sembrarOperador({ empresaId, runId, sufijo: "admin", rol: "admin", permisos: ["shifts", "sell"] }),
    sembrarOperador({ empresaId, runId, sufijo: "sin-permiso", rol: "cajero", permisos: ["sell"] }),
  ]);
  return { runId, empresaId, cajero, supervisor, admin, sinPermiso };
}

export async function limpiarFixtureR1A(fixture: Pick<FixtureR1A, "empresaId"> & Partial<Pick<FixtureR1A, "runId">>): Promise<void> {
  const { auth, db } = adminE2E();
  const prefix = fixture.runId ? `e2e-r1a-${idSeguro(fixture.runId)}` : fixture.empresaId;
  const colecciones = ["turnos", "turnos_activos", "operaciones_comandos", "operaciones_command_idempotency", "operaciones_auditoria", "credenciales_operativas", "membresias", "usuarios", "suscripciones"];
  for (const collection of colecciones) {
    const snapshots = await db.collection(collection).get();
    await Promise.all(snapshots.docs.filter((doc) => {
      const data = doc.data();
      return data.empresaId === fixture.empresaId || doc.id.includes(prefix);
    }).map((doc) => doc.ref.delete()));
  }
  await db.collection("configuraciones").doc(fixture.empresaId).delete().catch(() => undefined);
  await db.collection("empresas").doc(fixture.empresaId).delete().catch(() => undefined);
  const users = await auth.listUsers(1000);
  await Promise.all(users.users.filter((user) => user.uid.includes(prefix)).map((user) => auth.deleteUser(user.uid)));
}
