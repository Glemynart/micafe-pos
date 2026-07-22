import assert from "node:assert/strict";
import test from "node:test";
import { aplicarOperacionesConfiguracion, crearPlantillaConfiguracionRevision1, evaluarReadinessConfiguracion, proyectarBrandingConfiguracion, validarConfiguracionEmpresa, validarBranding } from "@/lib/configuracion";

const base = () => crearPlantillaConfiguracionRevision1({ empresaId: "empresa-1", nombreComercial: "Empresa neutral", creadaEn: "2026-01-01", actualizadaEn: "2026-01-01", ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BOOTSTRAP", commandId: "cmd", correlationId: "corr" } });

test("B1.2 valida la plantilla neutral y rechaza campos o enums no cerrados", () => {
  const c = base();
  assert.equal(validarConfiguracionEmpresa(c, { empresaId: c.empresaId, paisFiscalEmpresa: "CO" }).valida, true);
  assert.equal(validarConfiguracionEmpresa({ ...c, desconocido: true }).valida, false);
  assert.equal(validarConfiguracionEmpresa({ ...c, pos: { ...c.pos, metodosPagoHabilitados: ["efectivo", "efectivo"] } }).valida, false);
});
test("B1.2 controla rutas, allowlists, no-op y mutación efectiva", () => {
  const c = base();
  assert.throws(() => aplicarOperacionesConfiguracion(c, [{ tipo: "SET", ruta: "branding.nombreVisible", valor: "X" }], []));
  assert.equal(aplicarOperacionesConfiguracion(c, [{ tipo: "SET", ruta: "ticket.mensajePie", valor: c.ticket.mensajePie }]).tipo, "NO_OP");
  const r = aplicarOperacionesConfiguracion(c, [{ tipo: "SET", ruta: "ticket.mensajePie", valor: "Gracias." }]);
  assert.equal(r.tipo, "MUTACION_EFECTIVA"); assert.equal(r.configuracion.ticket.mensajePie, "Gracias.");
  assert.throws(() => aplicarOperacionesConfiguracion(c, [{ tipo: "REMOVE", ruta: "ticket.mensajePie" }]));
});
test("B1.2 deriva readiness, incluso país no soportado", () => {
  const c = base(); const incompleta = evaluarReadinessConfiguracion(c);
  assert.equal(incompleta.operativa.lista, false); assert.equal(incompleta.fiscal.lista, false);
  const extranjera = { ...c, localizacion: { ...c.localizacion, paisFiscal: "XX", moneda: "XXX", idioma: "xx", zonaHoraria: "Etc/UTC" } };
  assert.ok(evaluarReadinessConfiguracion(extranjera).fiscal.causas.includes("PAIS_FISCAL_NO_SOPORTADO"));
});
test("B1.2 reconoce una configuración operativa y fiscal completa", () => {
  const c = base();
  const completa = {
    ...c,
    identidadFiscal: { ...c.identidadFiscal, razonSocial: "Empresa neutral SAS", tipoPersona: "JURIDICA" as const, tipoDocumento: "NIT", numeroDocumento: "900373913", digitoVerificacion: "4", regimenTributario: "no_responsable" as const, actividadEconomicaPrincipal: "5610" },
    localizacion: { ...c.localizacion, direccion: { linea1: "Calle 1", departamentoCodigo: "11", municipioCodigo: "11001" } },
    modulos: { habilitados: ["sell"] as Array<"sell"> },
  };
  const readiness = evaluarReadinessConfiguracion(completa);
  assert.equal(readiness.operativa.lista, true); assert.equal(readiness.fiscal.lista, true);
});
test("B1.2 valida branding y proyecta datos de lectura sin el agregado", () => {
  const c = base();
  const valido = { ...c.branding, paletas: { light: { primary: "#000000", onPrimary: "#FFFFFF" }, dark: {} } };
  assert.equal(validarBranding(valido).valida, true);
  assert.equal(validarBranding({ ...valido, paletas: { light: { primary: "#FFFFFF", onPrimary: "#FFFFFE" }, dark: {} } }).valida, false);
  const p = proyectarBrandingConfiguracion({ ...c, branding: valido });
  assert.equal(p.nombreVisible, c.identidadFiscal.nombreComercial); assert.equal("revision" in p, false);
});
test("B1.2 conserva branding parcial, rechaza estructuras inseguras y no invalida readiness por branding", () => {
  const c = base();
  assert.equal(validarBranding({ ...c.branding, assets: [] as never }).valida, false);
  assert.equal(validarBranding({ ...c.branding, paletas: [] as never }).valida, false);
  const parcial = { ...c, branding: { ...c.branding, nombreVisible: undefined, paletas: { light: { primary: "#000000", onPrimary: "#ffffff" }, dark: {} } } };
  assert.equal(proyectarBrandingConfiguracion(parcial).nombreVisible, c.identidadFiscal.nombreComercial);
  const conBrandingInvalido = { ...c, branding: { ...c.branding, assets: [] as never } };
  assert.equal(evaluarReadinessConfiguracion(conBrandingInvalido).operativa.causas.includes("CONFIGURACION_INVALIDA"), false);
});
test("B1.2 exige la equivalencia de pago mixto, límites documentados y URL documental segura", () => {
  const c = base();
  assert.equal(validarConfiguracionEmpresa({ ...c, pos: { ...c.pos, permitirPagoMixto: false } }).valida, false);
  assert.equal(validarConfiguracionEmpresa({ ...c, impresion: { ...c.impresion, copiasVenta: 4 } }).valida, false);
  assert.equal(validarConfiguracionEmpresa({ ...c, ticket: { ...c.ticket, logoDocumentoUrl: "https://user:secret@ejemplo.test/logo.png", mostrarLogoDocumento: true } }).valida, false);
});
