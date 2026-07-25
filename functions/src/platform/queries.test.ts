import assert from "node:assert/strict";
import test from "node:test";
import { consultarAuditoriaPlataforma, validarFiltroAuditoria } from "./queries";

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
