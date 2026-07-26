import assert from "node:assert/strict";
import test from "node:test";
import { emitirCredencialInicial } from "./emitir-credencial-inicial";

/**
 * Firestore falso mínimo: colecciones planas, `where` de igualdad
 * encadenable (usable tanto suelto como dentro de `tx.get(query)`, que es
 * justo lo que este servicio necesita para el re-chequeo transaccional de
 * idempotencia por (empresaId, uid) — ver el comentario en
 * `emitir-credencial-inicial.ts` sobre por qué NO basta con `tx.get(docRef)`
 * por el código, que es aleatorio en cada invocación).
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
  data() { return this.v === undefined ? undefined : structuredClone(this.v); }
  get(campo: string) { return this.v?.[campo]; }
}

/**
 * `creadaEn` en producción es `FieldValue.serverTimestamp()`: un sentinel
 * que, tras `structuredClone` (usado por este fake para simular aislamiento
 * transaccional), pierde su prototipo y queda como `{}`. Se trata como
 * "ahora" — más reciente que cualquier timestamp concreto sembrado por un
 * fixture — porque eso es exactamente lo que representa: el commit real
 * ocurre en el momento de la escritura, siempre posterior a cualquier dato
 * de prueba preexistente.
 */
function valorDeOrden(v: unknown): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const t = v as { toMillis?: () => number; _seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  if (typeof t._seconds === "number") return t._seconds * 1000;
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
  private reloj = 0;
  /**
   * `structuredClone(FieldValue.serverTimestamp())` pierde el prototipo y
   * queda como `{}` — indistinguible de un objeto vacío legítimo, que este
   * dominio nunca produce en un campo de documento. Se lo reemplaza por un
   * reloj monótono creciente en el momento de la escritura, igual que
   * Firestore real convierte el sentinel en un timestamp concreto al hacer
   * commit: así dos documentos creados en la misma prueba (mismo `Date.now()`
   * a resolución de milisegundos) preservan su orden real de creación.
   */
  private estampar(v: any): any {
    const out: any = { ...v };
    for (const campo of Object.keys(out)) {
      const valor = out[campo];
      if (valor && typeof valor === "object" && Object.keys(valor).length === 0) {
        out[campo] = ++this.reloj;
      }
    }
    return out;
  }
  collection(nombre: string) {
    const ref = new Ref(nombre);
    const query = new Query(nombre, () => this.docs);
    return Object.assign(ref, {
      where: (campo: string, op: "==", valor: unknown) => query.where(campo, op, valor),
    });
  }
  seed(path: string, data: any) { this.docs.set(path, structuredClone(data)); }
  async runTransaction<T>(cb: (tx: any) => Promise<T>) {
    const w = new Map([...this.docs].map(([k, v]) => [k, structuredClone(v)]));
    const tx = {
      get: async (refOrQuery: any) => {
        if (refOrQuery.__isQuery) return refOrQuery.ejecutarContra(w);
        return new Snap(refOrQuery.path.split("/").pop()!, w.get(refOrQuery.path));
      },
      create: (r: Ref, v: any) => {
        if (w.has(r.path)) throw new Error(`EXISTS:${r.path}`);
        w.set(r.path, this.estampar(structuredClone(v)));
      },
      update: (r: Ref, v: any) => {
        if (!w.has(r.path)) throw new Error(`MISSING:${r.path}`);
        w.set(r.path, { ...w.get(r.path), ...structuredClone(v) });
      },
    };
    const resultado = await cb(tx);
    this.docs = w;
    return resultado;
  }
}

const PRINCIPAL_EXISTENTE = async (_uid: string) => ({ displayName: "Ana Admin" });

const parametrosBase = {
  empresaId: "empresa-1",
  uid: "owner-uid-1",
  rol: "admin" as const,
  permisos: ["configuracion", "pos"],
  origen: "PLATAFORMA" as const,
  emisorUid: "owner-uid-1",
  nombreComercial: "Café Atrato",
  pepper: "pepper-de-prueba",
  resolverPrincipal: PRINCIPAL_EXISTENTE,
};

function crearDb(): FakeDb {
  return new FakeDb();
}

test("emite una credencial nueva: código único, PIN de 6 dígitos, requiereCambio, TTL futuro", async () => {
  const db = crearDb() as any;
  const resultado = await emitirCredencialInicial(db, parametrosBase);

  assert.equal(resultado.estado, "EMITIDA");
  assert.match(resultado.pinTemporal!, /^[0-9]{6}$/);
  assert.match(resultado.codigo, /^cafeat-[0-9a-hj-km-np-tv-z]{4}$/);

  const credencial = db.docs.get(`credenciales_operativas/empresa-1_${resultado.codigo}`);
  assert.equal(credencial.empresaId, "empresa-1");
  assert.equal(credencial.uid, "owner-uid-1");
  assert.equal(credencial.activo, true);
  assert.equal(credencial.requiereCambio, true);
  assert.equal(credencial.origen, "PLATAFORMA");
  assert.notEqual(credencial.pinHash, resultado.pinTemporal, "el PIN nunca se persiste en claro");
  // `structuredClone` (usado por este fake para simular el aislamiento
  // transaccional) no preserva el prototipo de `Timestamp` — se pierde
  // `.toMillis()`, pero los campos internos `_seconds`/`_nanoseconds`
  // sobreviven porque son propiedades planas serializables.
  assert.ok(credencial.expiraEn._seconds * 1000 > Date.now(), "la credencial debe expirar en el futuro (TTL D-3)");

  const incorporacion = db.docs.get(`incorporaciones/${resultado.incorporacionId}`);
  assert.equal(incorporacion.mecanismo, "DIRECTA");
  assert.equal(incorporacion.estado, "TEMP_CREDENTIAL");
  assert.equal(incorporacion.rol, "admin");
  assert.deepEqual(incorporacion.permisosEfectivos, ["configuracion", "pos"]);
  assert.equal(incorporacion.emitidaPorUid, "owner-uid-1");
});

test("crea el perfil global 'usuarios' si no existe, con el nombre del principal de Auth", async () => {
  const db = crearDb() as any;
  await emitirCredencialInicial(db, parametrosBase);
  const usuario = db.docs.get("usuarios/owner-uid-1");
  assert.equal(usuario.nombre, "Ana Admin");
});

test("no sobrescribe 'usuarios' si el perfil global ya existía", async () => {
  const db = crearDb();
  db.seed("usuarios/owner-uid-1", { uid: "owner-uid-1", nombre: "Nombre Preexistente" });
  await emitirCredencialInicial(db as any, parametrosBase);
  const usuario = db.docs.get("usuarios/owner-uid-1");
  assert.equal(usuario.nombre, "Nombre Preexistente");
});

test("idempotencia: una segunda llamada para el mismo (empresaId, uid) no crea una segunda credencial ni reexpone el PIN", async () => {
  const db = crearDb() as any;
  const primera = await emitirCredencialInicial(db, parametrosBase);
  assert.equal(primera.estado, "EMITIDA");
  assert.ok(primera.pinTemporal);

  const segunda = await emitirCredencialInicial(db, parametrosBase);
  assert.equal(segunda.estado, "YA_EXISTENTE");
  assert.equal(segunda.pinTemporal, null, "un reintento nunca debe reexponer el PIN ya entregado");
  assert.equal(segunda.incorporacionId, primera.incorporacionId);
  assert.equal(segunda.codigo, primera.codigo);

  const todasLasIncorporaciones = [...db.docs.keys()].filter((k: string) => k.startsWith("incorporaciones/"));
  assert.equal(todasLasIncorporaciones.length, 1, "no debe existir una segunda incorporación para el mismo uid");
});

test("lanza si el uid no existe en Firebase Auth (este servicio nunca crea principals)", async () => {
  const db = crearDb() as any;
  const resolverQueFalla = async () => { throw new Error("auth/user-not-found"); };
  await assert.rejects(
    emitirCredencialInicial(db, { ...parametrosBase, resolverPrincipal: resolverQueFalla }),
    /auth\/user-not-found/,
  );
  assert.equal(db.docs.size, 0, "no debe quedar ningún documento si el principal no existe");
});

test("carrera concurrente: dos emisiones para el mismo uid con códigos distintos no crean dos credenciales", async () => {
  // Reproduce el escenario real que motivó indexar el re-chequeo
  // transaccional por (empresaId, uid) y no por el código recién generado
  // (aleatorio en cada invocación, casi nunca coincide entre llamadas
  // concurrentes): ambas transacciones deben ver el mismo conjunto de
  // documentos para (empresaId, uid) al consultar dentro de la transacción.
  const db = crearDb();
  const runTransactionOriginal = db.runTransaction.bind(db);
  let primeraEnCurso = true;

  db.runTransaction = (async (cb: any) => {
    if (primeraEnCurso) {
      primeraEnCurso = false;
      // La "otra" invocación concurrente termina primero, con SU PROPIO
      // código generado — deliberadamente distinto al de esta invocación.
      db.seed("incorporaciones/incorporacion-ganadora-de-la-carrera", {
        empresaId: "empresa-1",
        mecanismo: "DIRECTA",
        uid: "owner-uid-1",
        codigo: "cafeat-gano",
      });
    }
    return runTransactionOriginal(cb);
  }) as any;

  const resultado = await emitirCredencialInicial(db as any, parametrosBase);
  assert.equal(resultado.estado, "YA_EXISTENTE");
  assert.equal(resultado.pinTemporal, null, "el PIN generado en esta invocación jamás se persistió: no puede devolverse");
  assert.equal(resultado.codigo, "cafeat-gano");

  const todasLasIncorporaciones = [...db.docs.keys()].filter((k) => k.startsWith("incorporaciones/"));
  assert.equal(todasLasIncorporaciones.length, 1, "la invocación perdedora de la carrera no debe dejar una segunda incorporación");
  const todasLasCredenciales = [...db.docs.keys()].filter((k) => k.startsWith("credenciales_operativas/"));
  assert.equal(todasLasCredenciales.length, 0, "tampoco debe dejar una credencial huérfana para el código que generó y descartó");
});

test("distintos tenants pueden usar el mismo uid sin colisionar entre sí", async () => {
  const db = crearDb() as any;
  const paraEmpresa1 = await emitirCredencialInicial(db, parametrosBase);
  const paraEmpresa2 = await emitirCredencialInicial(db, { ...parametrosBase, empresaId: "empresa-2" });

  assert.equal(paraEmpresa1.estado, "EMITIDA");
  assert.equal(paraEmpresa2.estado, "EMITIDA");
  assert.notEqual(paraEmpresa1.incorporacionId, paraEmpresa2.incorporacionId);
});

// ── ADR-SAAS-013 §4.4 — reemplazo (Capa 3) ─────────────────────────────────

test("reemplazarIncorporacionId: expira la incorporación anterior y desactiva su credencial en la MISMA transacción", async () => {
  const db = crearDb() as any;
  const primera = await emitirCredencialInicial(db, parametrosBase);
  assert.equal(primera.estado, "EMITIDA");

  const segunda = await emitirCredencialInicial(db, {
    ...parametrosBase,
    reemplazarIncorporacionId: primera.incorporacionId,
  });

  assert.equal(segunda.estado, "REEMITIDA");
  assert.ok(segunda.pinTemporal, "una reemisión SÍ debe entregar un PIN nuevo — es una emisión real, no un replay");
  assert.notEqual(segunda.incorporacionId, primera.incorporacionId);
  assert.notEqual(segunda.codigo, primera.codigo);

  const incorporacionAnterior = db.docs.get(`incorporaciones/${primera.incorporacionId}`);
  assert.equal(incorporacionAnterior.estado, "EXPIRED");
  const credencialAnterior = db.docs.get(`credenciales_operativas/empresa-1_${primera.codigo}`);
  assert.equal(credencialAnterior.activo, false);

  const incorporacionNueva = db.docs.get(`incorporaciones/${segunda.incorporacionId}`);
  assert.equal(incorporacionNueva.estado, "TEMP_CREDENTIAL");
  const credencialNueva = db.docs.get(`credenciales_operativas/empresa-1_${segunda.codigo}`);
  assert.equal(credencialNueva.activo, true);

  const todasLasIncorporaciones = [...db.docs.keys()].filter((k: string) => k.startsWith("incorporaciones/"));
  assert.equal(todasLasIncorporaciones.length, 2, "la anterior se conserva (EXPIRED), no se borra — trazabilidad");
});

test("una SEGUNDA reemisión (historial de 2 EXPIRED) no falla con CREDENCIAL_INICIAL_ESTADO_INCONSISTENTE", async () => {
  // Regresión: antes de centralizar la consulta en
  // `consultarIncorporacionDirectaMasReciente`, el pre-chequeo consultaba
  // TODAS las incorporaciones DIRECTA de (empresaId, uid) y trataba
  // `size > 1` como corrupción. Tras una primera reemisión ya hay 2
  // registros (la EXPIRED original + la vigente) — una segunda reemisión
  // encontraba ese `size === 2` y abortaba con un error interno, dejando al
  // tenant sin forma de volver a emitir su credencial. La consulta
  // compartida siempre resuelve al más reciente, así que esto debe
  // funcionar sin límite.
  const db = crearDb() as any;
  const primera = await emitirCredencialInicial(db, parametrosBase);
  const segunda = await emitirCredencialInicial(db, {
    ...parametrosBase,
    reemplazarIncorporacionId: primera.incorporacionId,
  });
  assert.equal(segunda.estado, "REEMITIDA");

  const tercera = await emitirCredencialInicial(db, {
    ...parametrosBase,
    reemplazarIncorporacionId: segunda.incorporacionId,
  });
  assert.equal(tercera.estado, "REEMITIDA");
  assert.notEqual(tercera.incorporacionId, segunda.incorporacionId);
  assert.notEqual(tercera.incorporacionId, primera.incorporacionId);

  const todasLasIncorporaciones = [...db.docs.keys()].filter((k: string) => k.startsWith("incorporaciones/"));
  assert.equal(todasLasIncorporaciones.length, 3, "las dos anteriores se conservan como historial EXPIRED");
  assert.equal(db.docs.get(`incorporaciones/${primera.incorporacionId}`).estado, "EXPIRED");
  assert.equal(db.docs.get(`incorporaciones/${segunda.incorporacionId}`).estado, "EXPIRED");
  assert.equal(db.docs.get(`incorporaciones/${tercera.incorporacionId}`).estado, "TEMP_CREDENTIAL");
});

test("con dos incorporaciones DIRECTA para el mismo (empresaId, uid), resuelve siempre a la de creadaEn más reciente", async () => {
  // Regresión de la ficha del Backoffice (`obtenerDetalleEmpresaPlataforma`)
  // y de `resolverPlanEmisionCredencialInicial`: sin `orderBy`, un
  // `limit(1)` sobre 2+ documentos que calzan el filtro devuelve el primero
  // que Firestore entregue — en este fake, el primero insertado en el Map,
  // que es exactamente lo contrario de lo que se necesita. Se sembraron
  // ambas directamente (sin pasar por `emitirCredencialInicial`) para poder
  // fijar `creadaEn` explícito y así separar "cuál se insertó primero" de
  // "cuál es más reciente" — la vieja se sembró PRIMERO pero con el
  // `creadaEn` más chico.
  const db = crearDb() as any;
  db.seed("incorporaciones/inc-vieja", {
    empresaId: "empresa-1", mecanismo: "DIRECTA", uid: "owner-uid-1",
    estado: "EXPIRED", codigo: "cafeat-viej", creadaEn: 1000,
  });
  db.seed("incorporaciones/inc-nueva", {
    empresaId: "empresa-1", mecanismo: "DIRECTA", uid: "owner-uid-1",
    estado: "TEMP_CREDENTIAL", codigo: "cafeat-nuev", creadaEn: 2000,
  });

  const resultado = await emitirCredencialInicial(db, parametrosBase);
  assert.equal(resultado.estado, "YA_EXISTENTE");
  assert.equal(resultado.codigo, "cafeat-nuev", "debe resolver a la de creadaEn más reciente, no a la insertada primero");
});

test("reemplazarIncorporacionId que ya NO coincide con la incorporación actual no reemplaza nada: YA_EXISTENTE seguro", async () => {
  // Simula que, entre la validación del comando (Capa 3) y esta llamada,
  // la incorporación cambió (se activó, o ya la reemplazó otra invocación
  // concurrente). El id que el llamador cree reemplazable ya no es el
  // vigente — no se debe reemplazar a ciegas.
  const db = crearDb() as any;
  const primera = await emitirCredencialInicial(db, parametrosBase);

  const resultado = await emitirCredencialInicial(db, {
    ...parametrosBase,
    reemplazarIncorporacionId: "incorporacion-que-ya-no-existe",
  });

  assert.equal(resultado.estado, "YA_EXISTENTE");
  assert.equal(resultado.pinTemporal, null);
  assert.equal(resultado.incorporacionId, primera.incorporacionId);
  const incorporacionOriginal = db.docs.get(`incorporaciones/${primera.incorporacionId}`);
  assert.equal(incorporacionOriginal.estado, "TEMP_CREDENTIAL", "no debe haberse tocado: no era la incorporación que el llamador pidió reemplazar");
});

test("auditObserver se invoca solo cuando la transacción crea o reemplaza, nunca en el camino YA_EXISTENTE", async () => {
  const invocaciones: Array<{ reemplazo: boolean }> = [];
  const observer = (_tx: any, contexto: { reemplazo: boolean }) => {
    invocaciones.push({ reemplazo: contexto.reemplazo });
    return { obligacionId: "obligacion-1" };
  };

  const db = crearDb() as any;
  const primera = await emitirCredencialInicial(db, { ...parametrosBase, auditObserver: observer });
  assert.equal(invocaciones.length, 1);
  assert.equal(invocaciones[0].reemplazo, false);
  assert.equal(primera.obligacionId, "obligacion-1");

  // Reintento idempotente (sin reemplazarIncorporacionId): no es un hecho
  // nuevo, el observador no debe volver a invocarse.
  const retry = await emitirCredencialInicial(db, { ...parametrosBase, auditObserver: observer });
  assert.equal(invocaciones.length, 1, "un YA_EXISTENTE no es un hecho nuevo: no genera una segunda obligación");
  assert.equal(retry.obligacionId, null);

  const reemision = await emitirCredencialInicial(db, {
    ...parametrosBase,
    reemplazarIncorporacionId: primera.incorporacionId,
    auditObserver: observer,
  });
  assert.equal(invocaciones.length, 2);
  assert.equal(invocaciones[1].reemplazo, true);
  assert.equal(reemision.obligacionId, "obligacion-1");
});
