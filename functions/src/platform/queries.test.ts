import assert from "node:assert/strict";
import test from "node:test";
import { consultarAuditoriaPlataforma, listarRecursosPlataforma, obtenerDetalleEmpresaPlataforma, validarFiltroAuditoria } from "./queries";

test("la auditoría exige un filtro selectivo aprobado", () => {
  assert.throws(() => validarFiltroAuditoria(undefined), /FILTRO_AUDITORIA_INVALIDO/);
  assert.throws(() => validarFiltroAuditoria({ por: "libre", valor: "x" }), /FILTRO_AUDITORIA_INVALIDO/);
  assert.throws(() => validarFiltroAuditoria({ por: "empresa", valor: "empresa-a" }), /FILTRO_AUDITORIA_INVALIDO/);
  assert.deepEqual(
    validarFiltroAuditoria({ por: "correlacion", valor: "corr-1" }),
    { por: "correlacion", valor: "corr-1" },
  );
});

test("H6 — consultar globalmente por un tipo de Seguridad/Soporte exige ventana temporal", () => {
  assert.throws(
    () => validarFiltroAuditoria({ por: "tipo", valor: "AUTORIZACION_DENEGADA" }),
    /VENTANA_TEMPORAL_REQUERIDA/,
  );
  assert.throws(
    () => validarFiltroAuditoria({ por: "tipo", valor: "SOPORTE_INICIADO", ventana: { desde: 10, hasta: 5 } }),
    /VENTANA_TEMPORAL_REQUERIDA/,
    "desde debe ser estrictamente anterior a hasta",
  );
  assert.deepEqual(
    validarFiltroAuditoria({ por: "tipo", valor: "AUTORIZACION_DENEGADA", ventana: { desde: 1, hasta: 2 } }),
    { por: "tipo", valor: "AUTORIZACION_DENEGADA", ventana: { desde: 1, hasta: 2 } },
  );
});

test("H6 — un tipo fuera de Seguridad/Soporte conserva el comportamiento previo sin exigir ventana", () => {
  assert.deepEqual(
    validarFiltroAuditoria({ por: "tipo", valor: "PLAN_CREADO" }),
    { por: "tipo", valor: "PLAN_CREADO" },
  );
});

function fakeQueryDb() {
  const llamadas: { metodo: string; args: unknown[] }[] = [];
  const query: any = {
    where: (...args: unknown[]) => { llamadas.push({ metodo: "where", args }); return query; },
    orderBy: (...args: unknown[]) => { llamadas.push({ metodo: "orderBy", args }); return query; },
    limit: (...args: unknown[]) => { llamadas.push({ metodo: "limit", args }); return query; },
    startAfter: (...args: unknown[]) => { llamadas.push({ metodo: "startAfter", args }); return query; },
    get: async () => ({ docs: [] }),
  };
  return { collection: () => query, llamadas };
}

test("H6 — la ventana temporal se aplica como filtro de rango sobre registradoEn", async () => {
  const db = fakeQueryDb();
  await consultarAuditoriaPlataforma(
    db as never,
    { por: "tipo", valor: "SOPORTE_INICIADO", ventana: { desde: 1000, hasta: 2000 } },
  );
  const wheres = db.llamadas.filter((l) => l.metodo === "where");
  assert.ok(wheres.some((c) => c.args[0] === "registradoEn" && c.args[1] === ">="));
  assert.ok(wheres.some((c) => c.args[0] === "registradoEn" && c.args[1] === "<="));
});

test("H8 — la consulta por comando aplica el límite máximo de 20 de ADR-SAAS-012 §7", async () => {
  const db = fakeQueryDb();
  await consultarAuditoriaPlataforma(db as never, { por: "comando", valor: "cmd-1" }, 500);
  const limitCall = db.llamadas.find((l) => l.metodo === "limit");
  assert.equal(limitCall?.args[0], 20);
});

test("H8 — los demás patrones conservan el límite máximo de 100", async () => {
  const db = fakeQueryDb();
  await consultarAuditoriaPlataforma(db as never, { por: "correlacion", valor: "corr-1" }, 500);
  const limitCall = db.llamadas.find((l) => l.metodo === "limit");
  assert.equal(limitCall?.args[0], 100);
});

// El campo de ordenación de cada recurso debe coincidir con el que su agregado
// persiste realmente. Un `orderBy` sobre un campo inexistente no lanza error:
// Firestore excluye los documentos que no lo tienen y el listado se vacía en
// silencio (o exige un índice imposible cuando además hay un `where`).
test("cada recurso ordena por el campo que su modelo de datos persiste", async () => {
  const esperado: Record<string, string> = {
    empresas: "actualizadaEn",
    planes: "creadaEn",
    suscripciones: "creadaEn",
    operadores: "actualizadoEn",
    soporte: "actualizadaEn",
    provisionamientos: "actualizadoEn",
  };
  for (const [recurso, campo] of Object.entries(esperado)) {
    const db = fakeQueryDb();
    await listarRecursosPlataforma(db as never, recurso as never);
    const orderBy = db.llamadas.find((l) => l.metodo === "orderBy");
    assert.equal(orderBy?.args[0], campo, `el recurso ${recurso} debe ordenar por ${campo}`);
  }
});

// Reproduce la forma exacta que falló en producción: el callable inyecta siempre
// operadorUid para `soporte`, de modo que la consulta combina where + orderBy y
// necesita un índice compuesto con el nombre correcto del campo.
test("el listado de soporte filtrado por operadorUid ordena por actualizadaEn", async () => {
  const db = fakeQueryDb();
  await listarRecursosPlataforma(db as never, "soporte", { operadorUid: "operador-1" });
  const where = db.llamadas.find((l) => l.metodo === "where");
  const orderBy = db.llamadas.find((l) => l.metodo === "orderBy");
  assert.equal(where?.args[0], "operadorUid");
  assert.equal(orderBy?.args[0], "actualizadaEn");
});

// ── obtenerDetalleEmpresaPlataforma — proyección de la ficha del Backoffice ──

function valorDeOrden(v: unknown): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  return Number.POSITIVE_INFINITY;
}

class DetalleQuery {
  constructor(
    private readonly coleccion: string,
    private readonly docs: Map<string, any>,
    private readonly filtros: [string, unknown][] = [],
    private readonly orden: string | null = null,
  ) {}
  where(campo: string, _op: "==", valor: unknown) {
    return new DetalleQuery(this.coleccion, this.docs, [...this.filtros, [campo, valor]], this.orden);
  }
  orderBy(campo: string, _dir: "asc" | "desc" = "asc") {
    return new DetalleQuery(this.coleccion, this.docs, this.filtros, campo);
  }
  limit(n: number) {
    const limitada = new DetalleQuery(this.coleccion, this.docs, this.filtros, this.orden);
    (limitada as any).__limite = n;
    return limitada;
  }
  async get() {
    let encontrados = [...this.docs.entries()]
      .filter(([path]) => path.startsWith(`${this.coleccion}/`))
      .filter(([, data]) => this.filtros.every(([campo, valor]) => data?.[campo] === valor))
      .map(([path, data]) => ({ id: path.split("/").pop()!, data: () => data, get: (c: string) => data?.[c] }));
    if (this.orden) {
      const campo = this.orden;
      encontrados = encontrados.sort((a, b) => valorDeOrden(b.get(campo)) - valorDeOrden(a.get(campo)));
    }
    const tope = (this as any).__limite as number | undefined;
    if (typeof tope === "number") encontrados = encontrados.slice(0, tope);
    return { size: encontrados.length, docs: encontrados, empty: encontrados.length === 0 };
  }
}

function fakeDetalleDb() {
  const docs = new Map<string, any>();
  return {
    docs,
    seed(path: string, data: any) { docs.set(path, data); },
    collection(nombre: string) {
      return {
        doc: (id: string) => ({ get: async () => ({ id, exists: docs.has(`${nombre}/${id}`), data: () => docs.get(`${nombre}/${id}`) }) }),
        where: (campo: string, op: "==", valor: unknown) => new DetalleQuery(nombre, docs).where(campo, op, valor),
      };
    },
  };
}

test("obtenerDetalleEmpresaPlataforma: sin historial, proyecta SIN_PROVISIONAR", async () => {
  const db = fakeDetalleDb();
  db.seed("empresas/empresa-1", { estado: "activa", ownerUid: "owner-1" });
  db.seed("membresias/empresa-1_owner-1", { rol: "admin", estado: "activa", activo: true });

  const detalle = await obtenerDetalleEmpresaPlataforma(db as never, "empresa-1");
  assert.equal(detalle.credencialInicial.estado, "SIN_PROVISIONAR");
  assert.equal(detalle.credencialInicial.codigo, null);
  assert.equal(detalle.credencialInicial.incorporacionId, null);
});

test("obtenerDetalleEmpresaPlataforma: con una reemisión (2 incorporaciones DIRECTA), proyecta la MÁS RECIENTE — no el orden de inserción", async () => {
  // Regresión del defecto hallado en la validación E2E de la Capa 4: la
  // consulta original no llevaba `orderBy`, así que un `limit(1)` sobre 2+
  // documentos devolvía el primero que el fake (o Firestore real) entregara
  // — en este caso, deliberadamente, la EXPIRED antigua, sembrada primero.
  const db = fakeDetalleDb();
  db.seed("empresas/empresa-1", { estado: "activa", ownerUid: "owner-1" });
  db.seed("membresias/empresa-1_owner-1", { rol: "admin", estado: "activa", activo: true });
  db.seed("incorporaciones/inc-vieja", {
    empresaId: "empresa-1", mecanismo: "DIRECTA", uid: "owner-1",
    estado: "EXPIRED", codigo: "cafeat-viej", creadaEn: 1000,
  });
  db.seed("incorporaciones/inc-nueva", {
    empresaId: "empresa-1", mecanismo: "DIRECTA", uid: "owner-1",
    estado: "TEMP_CREDENTIAL", origen: "PLATAFORMA", codigo: "cafeat-nuev", creadaEn: 2000,
    expiraEn: { toMillis: () => Date.now() + 60 * 60 * 1000 },
  });

  const detalle = await obtenerDetalleEmpresaPlataforma(db as never, "empresa-1");
  assert.equal(detalle.credencialInicial.estado, "PENDIENTE_ACTIVACION");
  assert.equal(detalle.credencialInicial.codigo, "cafeat-nuev", "debe mostrar la reemitida, no la EXPIRED que la precede");
  assert.equal(detalle.credencialInicial.incorporacionId, "inc-nueva", "la UI debe usar el objetivo compare-and-swap más reciente");
  assert.equal(detalle.credencialInicial.puedeReemitir, true);
});

test("obtenerDetalleEmpresaPlataforma: una DIRECTA heredada no habilita la reemisión administrativa", async () => {
  const db = fakeDetalleDb();
  db.seed("empresas/empresa-1", { estado: "activa", ownerUid: "owner-1" });
  db.seed("membresias/empresa-1_owner-1", { rol: "admin", estado: "activa", activo: true });
  db.seed("incorporaciones/inc-heredada", {
    empresaId: "empresa-1", mecanismo: "DIRECTA", uid: "owner-1",
    estado: "TEMP_CREDENTIAL", codigo: "cafeat-old", creadaEn: 1000,
  });
  const detalle = await obtenerDetalleEmpresaPlataforma(db as never, "empresa-1");
  assert.equal(detalle.credencialInicial.estado, "PENDIENTE_ACTIVACION");
  assert.equal(detalle.credencialInicial.puedeReemitir, false);
});

test("obtenerDetalleEmpresaPlataforma: la más reciente EXPIRED (sin reemitir aún) proyecta EXPIRADA", async () => {
  const db = fakeDetalleDb();
  db.seed("empresas/empresa-1", { estado: "activa", ownerUid: "owner-1" });
  db.seed("membresias/empresa-1_owner-1", { rol: "admin", estado: "activa", activo: true });
  db.seed("incorporaciones/inc-1", {
    empresaId: "empresa-1", mecanismo: "DIRECTA", uid: "owner-1",
    estado: "EXPIRED", codigo: "cafeat-unic", creadaEn: 1000,
  });

  const detalle = await obtenerDetalleEmpresaPlataforma(db as never, "empresa-1");
  assert.equal(detalle.credencialInicial.estado, "EXPIRADA");
  assert.equal(detalle.credencialInicial.codigo, "cafeat-unic");
});

test("obtenerDetalleEmpresaPlataforma: una temporal de plataforma sin TTL no habilita reemisión", async () => {
  const db = fakeDetalleDb();
  db.seed("empresas/empresa-1", { estado: "activa", ownerUid: "owner-1" });
  db.seed("membresias/empresa-1_owner-1", { rol: "admin", estado: "activa", activo: true });
  db.seed("incorporaciones/inc-sin-ttl", {
    empresaId: "empresa-1", mecanismo: "DIRECTA", uid: "owner-1",
    estado: "TEMP_CREDENTIAL", origen: "PLATAFORMA", codigo: "cafeat-sin", creadaEn: 1000,
  });
  const detalle = await obtenerDetalleEmpresaPlataforma(db as never, "empresa-1");
  assert.equal(detalle.credencialInicial.puedeReemitir, false);
});
