import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuditEvidenceLabel } from "./audit-evidence-label";

test("la evidencia validada conserva su etiqueta normal", () => {
  const markup = renderToStaticMarkup(createElement(AuditEvidenceLabel, {
    tipo: "COMPRAS_CONTROL_INICIALIZADO",
    schemaVersion: 2,
    compatibilidad: "SOPORTADA",
  }));
  assert.match(markup, /COMPRAS_CONTROL_INICIALIZADO/);
  assert.doesNotMatch(markup, /no soportada|inválida/i);
});

test("la evidencia no soportada o malformada se diferencia del evento validado", () => {
  const unknown = renderToStaticMarkup(createElement(AuditEvidenceLabel, {
    tipo: "EVENTO_FUTURO",
    schemaVersion: 99,
    compatibilidad: "NO_SOPORTADA",
    diagnostico: "VERSION_NO_SOPORTADA",
  }));
  const invalid = renderToStaticMarkup(createElement(AuditEvidenceLabel, {
    tipo: "COMPRAS_PAUSADAS",
    schemaVersion: 2,
    compatibilidad: "INVALIDA",
    diagnostico: "DETALLE_V2_INVALIDO",
  }));
  assert.match(unknown, /Versión de evidencia no soportada/);
  assert.match(unknown, /VERSION_NO_SOPORTADA/);
  assert.match(invalid, /Evidencia inválida/);
  assert.match(invalid, /DETALLE_V2_INVALIDO/);
  assert.doesNotMatch(invalid, /<strong/);
});
