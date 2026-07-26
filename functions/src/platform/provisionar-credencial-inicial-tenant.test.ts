import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { resolverPlanEmisionCredencialInicial } from "./provisionar-credencial-inicial-tenant";

class Snap {
  constructor(private readonly v: any) {}
  get exists() { return this.v !== undefined; }
  data() { return this.v === undefined ? undefined : structuredClone(this.v); }
  get(campo: string) { return this.v?.[campo]; }
}

function valorDeOrden(v: unknown): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const t = v as { toMillis?: () => number; _seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t._seconds === "number") return t._seconds * 1000;
  return 0;
}

class Query {
  constructor(
    private readonly coleccion: string,
    private readonly docs: Map<string, any>,
    private readonly filtros: [string, unknown][] = [],
    private readonly orden: string | null = null,
  ) {}
  where(campo: string, _op: "==", valor: unknown) {
    return new Query(this.coleccion, this.docs, [...this.filtros, [campo, valor]], this.orden);
  }
  orderBy(campo: string, _dir: "asc" | "desc" = "asc") {
    return new Query(this.coleccion, this.docs, this.filtros, campo);
  }
  limit(_n: number) { return this; }
  async get() {
    let encontrados = [...this.docs.entries()]
      .filter(([path]) => path.startsWith(`${this.coleccion}/`))
      .filter(([, data]) => this.filtros.every(([campo, valor]) => data?.[campo] === valor))
      .map(([path, data]) => Object.assign(new Snap(data), { id: path.split("/").pop() }));
    if (this.orden) {
      const campo = this.orden;
      encontrados = encontrados.sort((a, b) => valorDeOrden(b.get(campo)) - valorDeOrden(a.get(campo)));
    }
    return { size: encontrados.length, docs: encontrados, empty: encontrados.length === 0 };
  }
}

class FakeDb {
  docs = new Map<string, any>();
  // Sin structuredClone: esta suite es de solo lectura (el módulo bajo
  // prueba no escribe nada) y algunos fixtures llevan un `expiraEn` con un
  // método `toMillis()` (para imitar `Timestamp`), que structuredClone no
  // puede clonar.
  seed(path: string, data: any) { this.docs.set(path, data); }
  collection(nombre: string) {
    const self = this;
    return {
      doc: (id: string) => ({ get: async () => new Snap(self.docs.get(`${nombre}/${id}`)) }),
      where: (campo: string, op: "==", valor: unknown) => new Query(nombre, self.docs).where(campo, op, valor),
    };
  }
}

const EMPRESA_ID = "empresa-1";
const OWNER_UID = "owner-1";

function sembrarBase(db: FakeDb, overrides: { estadoEmpresa?: string } = {}) {
  db.seed(`empresas/${EMPRESA_ID}`, {
    estado: overrides.estadoEmpresa ?? "activa",
    ownerUid: OWNER_UID,
    nombreComercial: "Café Atrato",
  });
  db.seed(`membresias/${EMPRESA_ID}_${OWNER_UID}`, {
    rol: "admin",
    estado: "activa",
    activo: true,
  });
}

test("empresa inexistente: not-found", async () => {
  const db = new FakeDb();
  await assert.rejects(
    resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID),
    (err: unknown) => err instanceof HttpsError && err.code === "not-found" && err.message === "EMPRESA_NOT_FOUND",
  );
});

test("empresaId con formato inválido: invalid-argument, antes de tocar Firestore", async () => {
  const db = new FakeDb();
  await assert.rejects(
    resolverPlanEmisionCredencialInicial(db as any, "  "),
    (err: unknown) => err instanceof HttpsError && err.code === "invalid-argument",
  );
  assert.equal(db.docs.size, 0);
});

test("empresa suspendida: failed-precondition EMPRESA_NO_PROVISIONABLE (§4.1.1)", async () => {
  const db = new FakeDb();
  sembrarBase(db, { estadoEmpresa: "suspendida" });
  await assert.rejects(
    resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID),
    (err: unknown) => err instanceof HttpsError && err.message === "EMPRESA_NO_PROVISIONABLE",
  );
});

test("empresa trial es provisionable, igual que activa", async () => {
  const db = new FakeDb();
  sembrarBase(db, { estadoEmpresa: "trial" });
  const plan = await resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID);
  assert.equal(plan.ownerUid, OWNER_UID);
  assert.equal(plan.tipoEvento, "CREDENCIAL_INICIAL_EMITIDA");
});

test("empresa sin ownerUid: failed-precondition (§4.1.2)", async () => {
  const db = new FakeDb();
  db.seed(`empresas/${EMPRESA_ID}`, { estado: "activa" });
  await assert.rejects(
    resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID),
    (err: unknown) => err instanceof HttpsError && err.message === "EMPRESA_SIN_OWNER",
  );
});

test("owner sin membresía: failed-precondition (§4.1.3)", async () => {
  const db = new FakeDb();
  db.seed(`empresas/${EMPRESA_ID}`, { estado: "activa", ownerUid: OWNER_UID });
  await assert.rejects(
    resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID),
    (err: unknown) => err instanceof HttpsError && err.message === "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA",
  );
});

test("owner con membresía inactiva: failed-precondition (§4.1.3)", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.seed(`membresias/${EMPRESA_ID}_${OWNER_UID}`, { rol: "admin", estado: "inactiva", activo: false });
  await assert.rejects(
    resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID),
    (err: unknown) => err instanceof HttpsError && err.message === "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA",
  );
});

test("owner con membresía de otro rol (no admin): failed-precondition — no basta con cualquier membresía", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.seed(`membresias/${EMPRESA_ID}_${OWNER_UID}`, { rol: "cajero", estado: "activa", activo: true });
  await assert.rejects(
    resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID),
    (err: unknown) => err instanceof HttpsError && err.message === "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA",
  );
});

test("sin incorporación previa: plan de primera emisión", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  const plan = await resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID);
  assert.equal(plan.ownerUid, OWNER_UID);
  assert.equal(plan.nombreComercial, "Café Atrato");
  assert.equal(plan.tipoEvento, "CREDENCIAL_INICIAL_EMITIDA");
  assert.equal(plan.reemplazarIncorporacionId, undefined);
});

test("incorporación ACTIVE (credencial ya en uso): already-exists PRIMERA_CREDENCIAL_YA_EXISTE (§4.3) — nunca reemplaza", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.seed("incorporaciones/inc-activa", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "ACTIVE", codigo: "cafeat-aaaa" });
  await assert.rejects(
    resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID),
    (err: unknown) => err instanceof HttpsError && err.code === "already-exists" && err.message === "PRIMERA_CREDENCIAL_YA_EXISTE",
  );
});

test("incorporación TEMP_CREDENTIAL vigente (sin activar, dentro del TTL): idempotente, no reemplaza", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  const futuro = { toMillis: () => Date.now() + 60 * 60 * 1000 };
  db.seed("incorporaciones/inc-temp", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "TEMP_CREDENTIAL", codigo: "cafeat-bbbb", expiraEn: futuro });
  const plan = await resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID);
  assert.equal(plan.tipoEvento, "CREDENCIAL_INICIAL_EMITIDA");
  assert.equal(plan.reemplazarIncorporacionId, undefined, "vigente y sin activar: nada que reemplazar, se deja que emitirCredencialInicial responda YA_EXISTENTE");
});

test("incorporación TEMP_CREDENTIAL vencida por TTL: plan de reemisión (§4.4)", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  const pasado = { toMillis: () => Date.now() - 1000 };
  db.seed("incorporaciones/inc-vencida", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "TEMP_CREDENTIAL", codigo: "cafeat-cccc", expiraEn: pasado });
  const plan = await resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID);
  assert.equal(plan.tipoEvento, "CREDENCIAL_INICIAL_REEMITIDA");
  assert.equal(plan.reemplazarIncorporacionId, "inc-vencida");
});

test("incorporación EXPIRED (ya reemplazada o expirada explícitamente): plan de reemisión (§4.4)", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.seed("incorporaciones/inc-expirada", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "EXPIRED", codigo: "cafeat-dddd" });
  const plan = await resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID);
  assert.equal(plan.tipoEvento, "CREDENCIAL_INICIAL_REEMITIDA");
  assert.equal(plan.reemplazarIncorporacionId, "inc-expirada");
});

test("con historial de reemisiones (varias EXPIRED + una vigente), resuelve siempre contra la más reciente por creadaEn", async () => {
  // Regresión: la consulta compartida reemplazó un `.limit(2)` que trataba
  // "más de una incorporación DIRECTA" como corrupción — exactamente el
  // estado que deja cada reemisión (ADR-SAAS-013 §4.4 conserva el historial
  // EXPIRED). Sin `orderBy`, además, el resultado dependía del orden de
  // inserción del fake, no de cuál es realmente la vigente.
  const db = new FakeDb();
  sembrarBase(db);
  db.seed("incorporaciones/inc-1", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "EXPIRED", codigo: "cafeat-1111", creadaEn: 1000 });
  db.seed("incorporaciones/inc-2", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "EXPIRED", codigo: "cafeat-2222", creadaEn: 2000 });
  const pasado = { toMillis: () => Date.now() - 1000 };
  db.seed("incorporaciones/inc-3-vigente", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "TEMP_CREDENTIAL", codigo: "cafeat-3333", expiraEn: pasado, creadaEn: 3000 });

  const plan = await resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID);
  assert.equal(plan.tipoEvento, "CREDENCIAL_INICIAL_REEMITIDA");
  assert.equal(plan.reemplazarIncorporacionId, "inc-3-vigente", "debe operar sobre la más reciente (creadaEn: 3000), no sobre ninguna de las EXPIRED antiguas");
});

test("cae al 'nombre' de la empresa si no hay 'nombreComercial'", async () => {
  const db = new FakeDb();
  db.seed(`empresas/${EMPRESA_ID}`, { estado: "activa", ownerUid: OWNER_UID, nombre: "Mi Café Especial" });
  db.seed(`membresias/${EMPRESA_ID}_${OWNER_UID}`, { rol: "admin", estado: "activa", activo: true });
  const plan = await resolverPlanEmisionCredencialInicial(db as any, EMPRESA_ID);
  assert.equal(plan.nombreComercial, "Mi Café Especial");
});
