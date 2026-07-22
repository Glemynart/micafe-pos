import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIGURACION_REVISION_INICIAL,
  CONFIGURACION_SCHEMA_VERSION_INICIAL,
  DEPENDENCIAS_MODULOS_CONFIGURACION,
  METODOS_PAGO_CONFIGURACION,
  MODULOS_CONFIGURACION,
  PERFIL_FISCAL_COLOMBIA,
  RUTAS_HOJA_EDITABLES_CONFIGURACION,
  TOKENS_BRANDING,
  crearPlantillaConfiguracionRevision1,
} from "@/lib/configuracion";

const datos = {
  empresaId: "empresa-prueba",
  nombreComercial: "Negocio Neutral",
  creadaEn: { servidor: "creada" },
  actualizadaEn: { servidor: "actualizada" },
  ultimaMutacion: {
    actorTipo: "SYSTEM" as const,
    actorId: "bootstrap-proceso",
    origen: "BOOTSTRAP" as const,
    commandId: "command-1",
    correlationId: "correlation-1",
  },
};

function crearPlantilla() {
  return crearPlantillaConfiguracionRevision1(datos);
}

function tieneClaveProhibida(valor: unknown): boolean {
  const prohibidas = new Set([
    "prefijo", "prefijo_factura", "consecutivo", "consecutivo_actual",
    "resolucion", "resolucion_dian", "rango", "rangoInicio", "rangoFin",
    "vigencia", "membresia", "membresias", "claim", "claims", "suscripcion",
    "suscripciones", "lifecycle", "plan", "planes", "puerto", "ip", "driver",
    "impresora", "password", "secret", "token",
  ]);
  if (Array.isArray(valor)) return valor.some(tieneClaveProhibida);
  if (!valor || typeof valor !== "object") return false;
  return Object.entries(valor as Record<string, unknown>).some(
    ([clave, hijo]) => prohibidas.has(clave) || tieneClaveProhibida(hijo),
  );
}

test("la plantilla CO v1 materializa metadatos y las doce secciones", () => {
  const configuracion = crearPlantilla();
  assert.equal(configuracion.empresaId, datos.empresaId);
  assert.equal(configuracion.schemaVersion, CONFIGURACION_SCHEMA_VERSION_INICIAL);
  assert.equal(configuracion.revision, CONFIGURACION_REVISION_INICIAL);
  assert.deepEqual(Object.keys(configuracion).sort(), [
    "actualizadaEn", "autenticacionOperativa", "branding", "caja", "creadaEn",
    "empresaId", "identidadFiscal", "impresion", "impuestos", "kds", "localizacion",
    "modulos", "pos", "preferencias", "revision", "schemaVersion", "ticket", "ultimaMutacion",
  ].sort());
  assert.deepEqual(Object.keys(configuracion).filter((clave) => [
    "identidadFiscal", "localizacion", "impuestos", "branding", "ticket", "impresion",
    "pos", "caja", "modulos", "kds", "autenticacionOperativa", "preferencias",
  ].includes(clave)).sort(), [
    "identidadFiscal", "localizacion", "impuestos", "branding", "ticket", "impresion",
    "pos", "caja", "modulos", "kds", "autenticacionOperativa", "preferencias",
  ].sort());
});

test("la plantilla usa únicamente defaults neutrales de CO", () => {
  const configuracion = crearPlantilla();
  assert.deepEqual(configuracion.localizacion, {
    paisFiscal: PERFIL_FISCAL_COLOMBIA.paisFiscal,
    moneda: "COP",
    idioma: "es-CO",
    zonaHoraria: "America/Bogota",
    direccion: {},
  });
  assert.deepEqual(configuracion.impuestos, {
    preciosIncluyenImpuestos: true,
    impuestoTipoPredeterminado: "inc_8",
    politicaRedondeo: "POR_LINEA_ENTERA",
  });
  assert.deepEqual(configuracion.modulos, { habilitados: [] });
  assert.equal(configuracion.identidadFiscal.nombreComercial, "Negocio Neutral");
  assert.deepEqual(configuracion.identidadFiscal.contacto, {});
  assert.equal(configuracion.identidadFiscal.numeroDocumento, undefined);
  assert.equal(configuracion.identidadFiscal.razonSocial, undefined);
  assert.deepEqual(configuracion.localizacion.direccion, {});
});

test("Branding inicia neutral y sin identidad de Café Atrato", () => {
  const configuracion = crearPlantilla();
  assert.deepEqual(configuracion.branding, {
    modelVersion: 1,
    assets: {},
    modoVisual: "SYSTEM",
    paletas: { light: {}, dark: {} },
  });
  assert.equal(configuracion.branding.nombreVisible, undefined);
  assert.equal(JSON.stringify(configuracion).toLowerCase().includes("atrato"), false);
});

test("la plantilla excluye autoridades y configuración prohibidas", () => {
  assert.equal(tieneClaveProhibida(crearPlantilla()), false);
});

test("los catálogos cerrados y las dependencias declaradas son completos", () => {
  assert.deepEqual(METODOS_PAGO_CONFIGURACION, ["efectivo", "transferencia", "cuenta_cobro", "mixto"]);
  assert.equal(TOKENS_BRANDING.length, 18);
  assert.ok(RUTAS_HOJA_EDITABLES_CONFIGURACION.includes("branding.paletas.light"));
  assert.ok(RUTAS_HOJA_EDITABLES_CONFIGURACION.includes("modulos.habilitados"));
  assert.equal(RUTAS_HOJA_EDITABLES_CONFIGURACION.some((ruta) => ruta.includes("consecutivo")), false);
  assert.deepEqual(Object.keys(DEPENDENCIAS_MODULOS_CONFIGURACION).sort(), [...MODULOS_CONFIGURACION].sort());
  for (const modulo of MODULOS_CONFIGURACION) {
    for (const dependencia of DEPENDENCIAS_MODULOS_CONFIGURACION[modulo]) {
      assert.ok(MODULOS_CONFIGURACION.includes(dependencia));
    }
  }
});

test("dos plantillas no comparten colecciones u objetos mutables", () => {
  const primera = crearPlantilla();
  const segunda = crearPlantilla();
  primera.branding.paletas.light.primary = "#000000";
  primera.pos.metodosPagoHabilitados.push("mixto");
  primera.caja.rolesConTurnoObligatorio.push("admin");
  assert.deepEqual(segunda.branding.paletas.light, {});
  assert.deepEqual(segunda.pos.metodosPagoHabilitados, ["efectivo", "transferencia", "cuenta_cobro", "mixto"]);
  assert.deepEqual(segunda.caja.rolesConTurnoObligatorio, ["cajero"]);
});
