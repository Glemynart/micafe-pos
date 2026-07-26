import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { provisionarCredencialInicialTenant } from "./operations";

/**
 * `FieldValue.serverTimestamp()` es un singleton (misma referencia en cada
 * llamada) — se reconoce por identidad para estampar, en `create`, un reloj
 * monótono creciente en su lugar. Sin esto, dos incorporaciones creadas por
 * reemisiones sucesivas en la misma prueba comparten literalmente el mismo
 * valor de `creadaEn` y `orderBy` no puede distinguir cuál es la más
 * reciente — exactamente lo que Firestore real evita asignando el commit
 * timestamp real en cada escritura.
 */
const SERVER_TIMESTAMP = FieldValue.serverTimestamp();

/**
 * Mismo fake que `emitir-credencial-inicial.test.ts` (colecciones planas,
 * `where` encadenable usable suelto o dentro de `tx.get(query)`, y
 * transacciones con create/update) — esta prueba ejercita la orquestación
 * completa: `resolverPlanEmisionCredencialInicial` (Capa 3) →
 * `emitirCredencialInicial` (Capa 2, sin cambios) → auditoría de
 * plataforma (ADR-SAAS-012, ya usada por el resto del módulo).
 */
class Ref {
  constructor(public path: string) {}
  get id() { return this.path.split("/").pop()!; }
  collection(id: string) { return new Ref(`${this.path}/${id}`); }
  doc(id: string) { return new Ref(`${this.path}/${id}`); }
}

class Snap {
  constructor(public id: string, private readonly v: any) {}
  get exists() { return this.v !== undefined; }
  data() { return this.v === undefined ? undefined : this.v; }
  get(campo: string) { return this.v?.[campo]; }
}

function valorDeOrden(v: unknown): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const t = v as { toMillis?: () => number; _seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t._seconds === "number") return t._seconds * 1000;
  // El sentinel de `FieldValue.serverTimestamp()` se estampa a un reloj
  // monótono en `FakeDb.create` (ver más abajo) antes de llegar aquí; si de
  // todos modos aparece sin estampar, tratarlo como "ahora".
  return Number.POSITIVE_INFINITY;
}

class Query {
  readonly __isQuery = true;
  constructor(
    private readonly coleccion: string,
    private readonly docsProvider: () => Map<string, any>,
    private readonly filtros: [string, unknown][] = [],
    private readonly orden: string | null = null,
  ) {}
  where(campo: string, _op: "==", valor: unknown) {
    return new Query(this.coleccion, this.docsProvider, [...this.filtros, [campo, valor]], this.orden);
  }
  orderBy(campo: string, _dir: "asc" | "desc" = "asc") {
    return new Query(this.coleccion, this.docsProvider, this.filtros, campo);
  }
  limit(n: number) {
    const limitada = new Query(this.coleccion, this.docsProvider, this.filtros, this.orden);
    (limitada as any).__limite = n;
    return limitada;
  }
  ejecutarContra(docs: Map<string, any>) {
    let encontrados = [...docs.entries()]
      .filter(([path]) => path.startsWith(`${this.coleccion}/`))
      .filter(([, data]) => this.filtros.every(([campo, valor]) => data?.[campo] === valor))
      .map(([path, data]) => new Snap(path.split("/").pop()!, data));
    if (this.orden) {
      const campo = this.orden;
      encontrados = encontrados.sort((a, b) => valorDeOrden(b.get(campo)) - valorDeOrden(a.get(campo)));
    }
    const tope = (this as any).__limite as number | undefined;
    if (typeof tope === "number") encontrados = encontrados.slice(0, tope);
    return { size: encontrados.length, docs: encontrados, empty: encontrados.length === 0 };
  }
  async get() { return this.ejecutarContra(this.docsProvider()); }
}

class FakeDb {
  docs = new Map<string, any>();
  collection(nombre: string) {
    const docsDeEstaInstancia = () => this.docs;
    const query = new Query(nombre, docsDeEstaInstancia);
    const envolverRef = (ref: Ref) => Object.assign(ref, {
      async get() { return new Snap(ref.id, docsDeEstaInstancia().get(ref.path)); },
      collection: (id: string) => envolverRef(new Ref(`${ref.path}/${id}`)),
      doc: (id: string) => envolverRef(new Ref(`${ref.path}/${id}`)),
    });
    return Object.assign(envolverRef(new Ref(nombre)), {
      where: (campo: string, op: "==", valor: unknown) => query.where(campo, op, valor),
    });
  }
  seed(path: string, data: any) { this.docs.set(path, data); }
  private reloj = 0;
  private estampar(v: any): any {
    const out: any = { ...v };
    for (const campo of Object.keys(out)) {
      if (out[campo] === SERVER_TIMESTAMP) out[campo] = ++this.reloj;
    }
    return out;
  }
  async runTransaction<T>(cb: (tx: any) => Promise<T>) {
    const w = new Map([...this.docs]);
    const tx = {
      get: async (refOrQuery: any) => {
        if (refOrQuery.__isQuery) return refOrQuery.ejecutarContra(w);
        return new Snap(refOrQuery.path.split("/").pop()!, w.get(refOrQuery.path));
      },
      create: (r: Ref, v: any) => {
        if (w.has(r.path)) throw new Error(`EXISTS:${r.path}`);
        w.set(r.path, this.estampar(v));
      },
      update: (r: Ref, v: any) => {
        if (!w.has(r.path)) throw new Error(`MISSING:${r.path}`);
        w.set(r.path, { ...w.get(r.path), ...v });
      },
    };
    const resultado = await cb(tx);
    this.docs = w;
    return resultado;
  }
}

const EMPRESA_ID = "empresa-1";
const OWNER_UID = "owner-1";

function sembrarBase(db: FakeDb) {
  db.seed(`empresas/${EMPRESA_ID}`, { estado: "activa", ownerUid: OWNER_UID, nombreComercial: "Café Atrato" });
  db.seed(`membresias/${EMPRESA_ID}_${OWNER_UID}`, { rol: "admin", estado: "activa", activo: true });
  db.seed("permisos_roles/admin", { permisos: ["configuracion", "pos"] });
}

function envelope(idempotencyKey: string) {
  return {
    commandId: `cmd_${idempotencyKey}`,
    idempotencyKey,
    correlationId: `corr_${idempotencyKey}`,
    causationId: null,
    motivoCodigo: "BACKOFFICE_PROVISIONAR_CREDENCIAL",
    empresaId: EMPRESA_ID,
  };
}

const resolverPrincipal = async (_uid: string) => ({ displayName: "Ana Admin" });

function mutarAntesDeLaTransaccion(db: FakeDb, mutar: () => void): void {
  const runTransactionOriginal = db.runTransaction.bind(db);
  let pendiente = true;
  (db as any).runTransaction = async (cb: (tx: any) => Promise<unknown>) => {
    if (pendiente) {
      pendiente = false;
      mutar();
    }
    return runTransactionOriginal(cb);
  };
}

function assertNoSeEmitio(db: FakeDb, docsAntes: number): void {
  assert.equal(db.docs.size, docsAntes, "el rechazo no debe crear credencial, incorporación ni auditoría");
  assert.equal([...db.docs.keys()].some((path) => path.startsWith("credenciales_operativas/")), false);
  assert.equal([...db.docs.keys()].some((path) => path.startsWith("incorporaciones/")), false);
  assert.equal([...db.docs.keys()].some((path) => path.startsWith("saas_auditoria")), false);
}

test("emisión inicial: crea la credencial, confirma y emite la obligación de auditoría", async () => {
  const db = new FakeDb();
  sembrarBase(db);

  const resultado = await provisionarCredencialInicialTenant(
    db as any, "operador-1", envelope("idem-1"), resolverPrincipal, "pepper-de-prueba",
  );

  assert.equal((resultado as any).estado, "EMITIDA");
  assert.ok((resultado as any).pinTemporal);
  assert.equal((resultado as any).idempotente, false);

  const incorporacion = [...db.docs.entries()].find(([k]) => k.startsWith("incorporaciones/"));
  assert.ok(incorporacion, "debe existir la incorporación");
  assert.equal(incorporacion![1].uid, OWNER_UID);
  assert.equal(incorporacion![1].origen, "PLATAFORMA");
  assert.equal(incorporacion![1].emitidaPorUid, "operador-1");

  const obligacion = [...db.docs.entries()].find(([k]) => k.startsWith("saas_auditoria_obligaciones/"));
  assert.ok(obligacion, "debe registrarse una obligación de auditoría de plataforma");
  assert.equal(obligacion![1].evidencia.tipo, "CREDENCIAL_INICIAL_EMITIDA");
  assert.equal(obligacion![1].estado, "EMITIDA", "finalizarResultadoAuditable debe emitirla tras el commit");

  const evidencia = [...db.docs.entries()].find(([k]) => k.startsWith("saas_auditoria/"));
  assert.ok(evidencia, "debe existir la evidencia CONFIRMADO");
  assert.equal(evidencia![1].actor.tipo, "OPERADOR");
  assert.equal(evidencia![1].actor.uid, "operador-1");
  assert.equal(evidencia![1].facultad, "LIFECYCLE_GOBERNAR");
});

test("empresa suspendida: rechaza antes de crear cualquier obligación de auditoría", async () => {
  const db = new FakeDb();
  db.seed(`empresas/${EMPRESA_ID}`, { estado: "suspendida", ownerUid: OWNER_UID });
  db.seed(`membresias/${EMPRESA_ID}_${OWNER_UID}`, { rol: "admin", estado: "activa", activo: true });

  await assert.rejects(
    provisionarCredencialInicialTenant(db as any, "operador-1", envelope("idem-2"), resolverPrincipal, "pepper"),
    (err: unknown) => err instanceof HttpsError && err.message === "EMPRESA_NO_PROVISIONABLE",
  );
  assert.equal(db.docs.size, 2, "no debe haberse escrito ningún documento nuevo (ni obligación PENDIENTE huérfana)");
});

test("credencial ya activa: rechaza con PRIMERA_CREDENCIAL_YA_EXISTE, no reemplaza ni audita", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.seed("incorporaciones/inc-activa", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "ACTIVE", codigo: "cafeat-aaaa" });
  const docsAntes = db.docs.size;

  await assert.rejects(
    provisionarCredencialInicialTenant(db as any, "operador-1", envelope("idem-3"), resolverPrincipal, "pepper"),
    (err: unknown) => err instanceof HttpsError && err.code === "already-exists" && err.message === "PRIMERA_CREDENCIAL_YA_EXISTE",
  );
  assert.equal(db.docs.size, docsAntes, "el rechazo no debe escribir nada");
});

test("TOCTOU: empresa suspendida tras planificar bloquea la emisión", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  const docsAntes = db.docs.size;
  mutarAntesDeLaTransaccion(db, () => {
    db.docs.set(`empresas/${EMPRESA_ID}`, { ...db.docs.get(`empresas/${EMPRESA_ID}`), estado: "suspendida" });
  });

  await assert.rejects(
    provisionarCredencialInicialTenant(db as any, "operador-1", envelope("toctou-empresa"), resolverPrincipal, "pepper"),
    (err: unknown) => err instanceof HttpsError && err.message === "EMPRESA_NO_PROVISIONABLE",
  );
  assertNoSeEmitio(db, docsAntes);
});

test("TOCTOU: cambio de owner tras planificar bloquea la emisión para el owner anterior", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  const docsAntes = db.docs.size;
  mutarAntesDeLaTransaccion(db, () => {
    db.docs.set(`empresas/${EMPRESA_ID}`, { ...db.docs.get(`empresas/${EMPRESA_ID}`), ownerUid: "owner-nuevo" });
  });

  await assert.rejects(
    provisionarCredencialInicialTenant(db as any, "operador-1", envelope("toctou-owner"), resolverPrincipal, "pepper"),
    (err: unknown) => err instanceof HttpsError && err.message === "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA",
  );
  assertNoSeEmitio(db, docsAntes);
});

test("TOCTOU: revocar la membresía del owner tras planificar bloquea la emisión", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  const docsAntes = db.docs.size;
  mutarAntesDeLaTransaccion(db, () => {
    db.docs.set(`membresias/${EMPRESA_ID}_${OWNER_UID}`, { rol: "admin", estado: "inactiva", activo: false });
  });

  await assert.rejects(
    provisionarCredencialInicialTenant(db as any, "operador-1", envelope("toctou-membresia"), resolverPrincipal, "pepper"),
    (err: unknown) => err instanceof HttpsError && err.message === "OWNER_SIN_MEMBRESIA_ADMIN_ACTIVA",
  );
  assertNoSeEmitio(db, docsAntes);
});

test("reprovisionamiento (§4.4): expira la anterior, emite una nueva, audita como REEMITIDA", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  db.seed("incorporaciones/inc-vieja", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "EXPIRED", codigo: "cafeat-vieja" });
  db.seed("credenciales_operativas/empresa-1_cafeat-vieja", { empresaId: EMPRESA_ID, uid: OWNER_UID, codigo: "cafeat-vieja", activo: false });

  const resultado = await provisionarCredencialInicialTenant(
    db as any, "operador-1", envelope("idem-4"), resolverPrincipal, "pepper",
  ) as any;

  assert.equal(resultado.estado, "REEMITIDA");
  assert.ok(resultado.pinTemporal);
  assert.equal(db.docs.get("incorporaciones/inc-vieja").estado, "EXPIRED");
  assert.equal(db.docs.get("credenciales_operativas/empresa-1_cafeat-vieja").activo, false);
  const credencialNueva = [...db.docs.entries()].find(([k, v]) => k.startsWith("credenciales_operativas/") && v.activo === true);
  assert.ok(credencialNueva, "la credencial nueva debe quedar activa");

  const obligacion = [...db.docs.entries()].find(([k]) => k.startsWith("saas_auditoria_obligaciones/"));
  assert.equal(obligacion![1].evidencia.tipo, "CREDENCIAL_INICIAL_REEMITIDA");
});

test("dos reemisiones sucesivas (§4.4 dos veces) no fallan — regresión del defecto hallado en validación E2E", async () => {
  // Reproduce el escenario real: una credencial se emite, expira (TTL o
  // reemplazo explícito) y se reemite; la reemitida a su vez expira y se
  // vuelve a reemitir. Antes de centralizar la consulta en
  // `consultarIncorporacionDirectaMasReciente`, la segunda reemisión
  // encontraba 2 incorporaciones DIRECTA (la EXPIRED original + la vigente)
  // y ambos consumidores (`resolverPlanEmisionCredencialInicial` y
  // `emitirCredencialInicial`) trataban ese `size > 1` como corrupción,
  // dejando al tenant sin forma de volver a emitir su credencial.
  const db = new FakeDb();
  sembrarBase(db);

  const primera = await provisionarCredencialInicialTenant(
    db as any, "operador-1", envelope("idem-primera"), resolverPrincipal, "pepper",
  ) as any;
  assert.equal(primera.estado, "EMITIDA");

  // Forzar el vencimiento de la primera para habilitar la reemisión (§4.4).
  const primeraIncorporacion = [...db.docs.entries()].find(([k]) => k.startsWith("incorporaciones/"))!;
  db.docs.set(primeraIncorporacion[0], { ...primeraIncorporacion[1], expiraEn: { toMillis: () => Date.now() - 1000 } });

  const segunda = await provisionarCredencialInicialTenant(
    db as any, "operador-1", envelope("idem-segunda"), resolverPrincipal, "pepper",
  ) as any;
  assert.equal(segunda.estado, "REEMITIDA");

  const incorporacionesTrasSegunda = [...db.docs.entries()].filter(([k]) => k.startsWith("incorporaciones/"));
  assert.equal(incorporacionesTrasSegunda.length, 2, "la primera se conserva EXPIRED, la segunda queda vigente");
  const vigenteTrasSegunda = incorporacionesTrasSegunda.find(([, v]) => v.estado === "TEMP_CREDENTIAL")!;
  db.docs.set(vigenteTrasSegunda[0], { ...vigenteTrasSegunda[1], expiraEn: { toMillis: () => Date.now() - 1000 } });

  // La TERCERA emisión es la que reproducía CREDENCIAL_INICIAL_ESTADO_INCONSISTENTE.
  const tercera = await provisionarCredencialInicialTenant(
    db as any, "operador-1", envelope("idem-tercera"), resolverPrincipal, "pepper",
  ) as any;
  assert.equal(tercera.estado, "REEMITIDA");

  const incorporacionesFinal = [...db.docs.entries()].filter(([k]) => k.startsWith("incorporaciones/"));
  assert.equal(incorporacionesFinal.length, 3, "las dos anteriores quedan como historial EXPIRED");
  assert.equal(incorporacionesFinal.filter(([, v]) => v.estado === "EXPIRED").length, 2);
  assert.equal(incorporacionesFinal.filter(([, v]) => v.estado === "TEMP_CREDENTIAL").length, 1);
});

test("credencial temporal vigente sin activar: idempotente, no genera una segunda obligación", async () => {
  const db = new FakeDb();
  sembrarBase(db);
  const futuro = { toMillis: () => Date.now() + 60 * 60 * 1000 };
  db.seed("incorporaciones/inc-pendiente", { empresaId: EMPRESA_ID, mecanismo: "DIRECTA", uid: OWNER_UID, estado: "TEMP_CREDENTIAL", codigo: "cafeat-pend", expiraEn: futuro });

  const resultado = await provisionarCredencialInicialTenant(
    db as any, "operador-1", envelope("idem-5"), resolverPrincipal, "pepper",
  ) as any;

  assert.equal(resultado.estado, "YA_EXISTENTE");
  assert.equal(resultado.pinTemporal, null);
  assert.equal(resultado.idempotente, true);
  const obligaciones = [...db.docs.keys()].filter((k) => k.startsWith("saas_auditoria_obligaciones/"));
  assert.equal(obligaciones.length, 0, "un reintento sobre una credencial pendiente no es un hecho nuevo: no debe auditarse como si lo fuera");
});
