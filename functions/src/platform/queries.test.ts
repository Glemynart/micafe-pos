import assert from "node:assert/strict";
import test from "node:test";
import { consultarAuditoriaPlataforma, listarRecursosPlataforma, validarFiltroAuditoria } from "./queries";

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
