import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditEvidenceLabel } from "./audit-evidence-label";

test("la evidencia validada conserva su etiqueta normal", () => {
  const markup = renderToStaticMarkup(createElement(AuditEvidenceLabel, {
    item: { id: "evidence-1", tipo: "COMPRAS_CONTROL_INICIALIZADO", schemaVersion: 2, compatibilidadSchemaVersion: "SOPORTADA" },
  }));
  assert.match(markup, /COMPRAS_CONTROL_INICIALIZADO/);
  assert.doesNotMatch(markup, /no soportada|inválida/i);
});

test("la evidencia no soportada o malformada se diferencia del evento validado", () => {
  const unknown = renderToStaticMarkup(createElement(AuditEvidenceLabel, {
    item: { id: "evidence-2", tipo: "EVENTO_FUTURO", schemaVersion: 99, compatibilidadSchemaVersion: "NO_SOPORTADA", diagnosticoCompatibilidad: "VERSION_NO_SOPORTADA" },
  }));
  const invalid = renderToStaticMarkup(createElement(AuditEvidenceLabel, {
    item: { id: "evidence-3", tipo: "COMPRAS_PAUSADAS", schemaVersion: 2, compatibilidadSchemaVersion: "INVALIDA", diagnosticoCompatibilidad: "DETALLE_V2_INVALIDO" },
  }));
  assert.match(unknown, /Versión de evidencia no soportada/);
  assert.match(unknown, /VERSION_NO_SOPORTADA/);
  assert.match(invalid, /Evidencia inválida/);
  assert.match(invalid, /DETALLE_V2_INVALIDO/);
  assert.doesNotMatch(invalid, /<strong/);
});
