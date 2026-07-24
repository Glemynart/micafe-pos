import assert from "node:assert/strict";
import test from "node:test";
import { validarFiltroAuditoria } from "./queries";

test("la auditoría exige un filtro selectivo aprobado", () => {
  assert.throws(() => validarFiltroAuditoria(undefined), /FILTRO_AUDITORIA_INVALIDO/);
  assert.throws(() => validarFiltroAuditoria({ por: "libre", valor: "x" }), /FILTRO_AUDITORIA_INVALIDO/);
  assert.throws(() => validarFiltroAuditoria({ por: "empresa", valor: "empresa-a" }), /FILTRO_AUDITORIA_INVALIDO/);
  assert.deepEqual(
    validarFiltroAuditoria({ por: "correlacion", valor: "corr-1" }),
    { por: "correlacion", valor: "corr-1" },
  );
});
