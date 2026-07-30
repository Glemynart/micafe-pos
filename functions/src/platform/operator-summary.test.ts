import assert from "node:assert/strict";
import test from "node:test";
import { obtenerResumenOperadorSaas } from "./queries";

function dbConEmpresas(empresas: Array<{ id: string; data: Record<string, unknown> }>) {
  const llamadas: string[] = [];
  return {
    llamadas,
    collection(nombre: string) {
      assert.equal(nombre, "empresas", "el resumen solo enumera Empresas; los demás lectores son canónicos inyectados");
      return {
        get: async () => {
          llamadas.push(nombre);
          return {
            size: empresas.length,
            docs: empresas.map(({ id, data }) => ({ id, data: () => data })),
          };
        },
      };
    },
  };
}

function detalle(override: Record<string, unknown> = {}) {
  return {
    empresa: { id: "empresa-1", ownerUid: "owner-1" },
    suscripcion: { empresaId: "empresa-1", planId: "base", planVersion: 1, estado: "active", trialFin: null },
    versionPlan: { planId: "base", planVersion: 1, codigo: "BASE", estado: "PUBLICADA" },
    diagnosticoConfiguracion: { disponible: true, readiness: { operativa: { lista: true, causas: [] }, fiscal: { lista: true, causas: [] } }, modulosHabilitados: ["pos"] },
    provisionamiento: { estado: "COMPLETED" },
    adminInicial: { uid: "owner-1", rol: "admin", estado: "activa", activo: true },
    credencialInicial: { estado: "ACTIVA" },
    ...override,
  } as any;
}

const onboardingListo = { readinessTotal: { listo: true } } as any;
const onboardingDetenido = { readinessTotal: { listo: false } } as any;

test("resumen vacío no produce alertas ni fuentes degradadas", async () => {
  const db = dbConEmpresas([]);
  const resumen = await obtenerResumenOperadorSaas(db as never);
  assert.deepEqual(resumen, { empresasTotal: 0, alertas: [], fuentesDegradadas: [] });
  assert.deepEqual(db.llamadas, ["empresas"]);
});

test("clasifica exclusivamente las nueve alertas aprobadas y permite varias por Empresa", async () => {
  const db = dbConEmpresas([
    { id: "empresa-1", data: { nombre: "Café Uno", estado: "suspendida", paisFiscal: "CO" } },
    { id: "empresa-2", data: { nombre: "Café Dos", estado: "activa", paisFiscal: "CO" } },
  ]);
  const porEmpresa: Record<string, any> = {
    "empresa-1": detalle({
      empresa: { id: "empresa-1", ownerUid: null },
      suscripcion: null,
      versionPlan: null,
      diagnosticoConfiguracion: { disponible: false, readiness: null, modulosHabilitados: [] },
      provisionamiento: { estado: "RETRYABLE_FAILURE" },
      adminInicial: null,
      credencialInicial: { estado: "PENDIENTE_ACTIVACION" },
    }),
    "empresa-2": detalle({
      empresa: { id: "empresa-2", ownerUid: "owner-2" },
      suscripcion: { empresaId: "empresa-2", planId: "base", planVersion: 1, estado: "trialing", trialFin: "2026-07-31" },
      credencialInicial: { estado: "EXPIRADA" },
    }),
  };
  const resumen = await obtenerResumenOperadorSaas(db as never, {
    ahoraMs: () => Date.parse("2026-07-30T12:00:00.000Z"),
    obtenerDetalle: async (_db, empresaId) => porEmpresa[empresaId],
    obtenerOnboarding: async (_db, empresaId) => empresaId === "empresa-1" ? onboardingDetenido : onboardingListo,
  });

  assert.deepEqual(
    new Set(resumen.alertas.map((alerta) => alerta.tipo)),
    new Set([
      "BOOTSTRAP_RECUPERABLE", "ADMINISTRADOR_PENDIENTE_ACTIVAR", "CREDENCIAL_TEMPORAL_EXPIRADA",
      "EMPRESA_SIN_SUSCRIPCION", "TRIAL_PROXIMO_VENCER", "ONBOARDING_DETENIDO",
      "READINESS_OPERATIVO_INCOMPLETO", "EMPRESA_SUSPENDIDA", "INCONSISTENCIA_CANONICA",
    ]),
  );
  assert.ok(resumen.alertas.filter((alerta) => alerta.empresaId === "empresa-1").length > 1);
  assert.equal(resumen.fuentesDegradadas.length, 0);
});

test("una fuente degradada conserva las alertas que no dependen de ella y no revela su error", async () => {
  const db = dbConEmpresas([{ id: "empresa-1", data: { nombre: "Café Uno", estado: "suspendida", paisFiscal: "CO" } }]);
  const resumen = await obtenerResumenOperadorSaas(db as never, {
    obtenerDetalle: async () => { throw new Error("token=secreto-no-visible"); },
    obtenerOnboarding: async () => onboardingListo,
  });

  assert.deepEqual(resumen.alertas.map((alerta) => alerta.tipo), ["EMPRESA_SUSPENDIDA"]);
  assert.deepEqual(resumen.fuentesDegradadas, [{ empresaId: "empresa-1", fuente: "DETALLE_EMPRESA" }]);
  assert.equal(JSON.stringify(resumen).includes("secreto-no-visible"), false);
});
