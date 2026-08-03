import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import {
  completarPasoConfiguracionFiscalOnboarding,
  completarPasoNumeracionOnboarding,
  obtenerEstadoOnboardingTenant,
} from "./service";
import { ejecutarBootstrapEmpresarial } from "../bootstrap/service";
import { crearPlantillaConfiguracionRevision1, evaluarReadinessConfiguracion } from "../../../lib/configuracion";
import { confirmarVentaFiscal } from "../fiscal/service";

function getProp(obj: any, path: string) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

class Query {
  constructor(private docs: any[]) {}
  where(field: string, op: string, val: any) {
    if (op === "==") return new Query(this.docs.filter((d) => getProp(d, field) === val));
    if (op === "!=") return new Query(this.docs.filter((d) => getProp(d, field) != null && getProp(d, field) !== val));
    return this;
  }
  limit(n: number) { return new Query(this.docs.slice(0, n)); }
  get empty() { return this.docs.length === 0; }
  async get() {
    return {
      empty: this.docs.length === 0,
      docs: this.docs.map((v) => new Snap(v)),
    };
  }
}

class Ref {
  constructor(public path: string, private db: Db) {}
  collection(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  async get() { return new Snap(this.db.docs.get(this.path)); }
  async update(data: any) { this.db.update(this.path, data); }
  async set(data: any) { this.db.seed(this.path, data); }
  where(field: string, op: string, val: any) {
    const docs = Array.from(this.db.docs.entries())
      .filter(([k]) => k.startsWith(this.path + "/"))
      .map(([, v]) => v);
    return new Query(docs).where(field, op, val);
  }
}

class Snap {
  constructor(private readonly v: any) {}
  get exists() { return this.v !== undefined; }
  data() { return structuredClone(this.v); }
}

class Db {
  docs = new Map<string, any>();
  private queue = Promise.resolve();
  collection(n: string) { return new Ref(n, this); }
  seed(k: string, v: any) { this.docs.set(k, structuredClone(v)); }
  read(k: string) { return this.docs.get(k); }
  update(k: string, v: any) {
    const cur = { ...this.docs.get(k) };
    for (const [key, val] of Object.entries(v)) {
      if (val === FieldValue.delete()) delete cur[key];
      else cur[key] = structuredClone(val);
    }
    this.docs.set(k, cur);
  }
  async runTransaction<T>(cb: (tx: any) => Promise<T>) {
    let release!: () => void;
    const before = this.queue;
    this.queue = new Promise((r) => (release = r));
    await before;
    const w = new Map([...this.docs].map(([k, v]) => [k, structuredClone(v)]));
    const tx = {
      get: async (target: any) => {
        if (!target?.path && typeof target?.get === "function") {
          return target.get();
        }
        return new Snap(w.get(target.path));
      },
      create: (r: Ref, v: any) => {
        if (w.has(r.path)) throw new Error("EXISTS");
        w.set(r.path, structuredClone(v));
      },
      set: (r: Ref, v: any) => {
        w.set(r.path, structuredClone(v));
      },
      update: (r: Ref, v: any) => {
        if (!w.has(r.path)) throw new Error("MISSING");
        const cur = { ...w.get(r.path) };
        for (const [k, val] of Object.entries(v)) {
          if (val === FieldValue.delete()) delete cur[k];
          else cur[k] = structuredClone(val);
        }
        w.set(r.path, cur);
      },
    };
    try {
      const r = await cb(tx);
      this.docs = w;
      return r;
    } finally {
      release();
    }
  }
}

test("B6 Onboarding — Flujo completo de reanudación y completitud del Onboarding (B1 + B2 + B5)", async () => {
  const db = new Db();
  db.seed("permisos_roles/admin", { permisos: ["configuracion", "pos"] });
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
    capacidades: ["sell"],
  });

  // 1. Ejecutar Bootstrap (B5) — El tenant nace en trial con numeración en BORRADOR y config básica
  const bootRes = await ejecutarBootstrapEmpresarial(db as any, {
    commandId: "cmd_b6_boot",
    idempotencyKey: "idem_b6_boot",
    correlationId: "corr_b6_boot",
    causationId: "cause_b6_boot",
    ownerUid: "owner_usr_77",
    empresaId: "empresa_b6_flow",
    nombreComercial: "Café B6 Flujo",
    paisFiscal: "CO",
    planId: "plan_pos_pro",
    planVersion: 1,
  }, async () => {}, async () => {}, undefined, undefined, async (p) => ({
    // ADR-SAAS-013 paso H: el fake `Db` de este archivo no soporta `.where()`;
    // se inyecta un emisor mínimo, ya que esta prueba cubre el flujo de
    // Onboarding (B6), no la credencial inicial en sí.
    incorporacionId: `inc_${p.empresaId}_${p.uid}`,
    codigo: `codigo-${p.empresaId}`,
    pinTemporal: "123456",
    estado: "EMITIDA" as const,
  }));

  assert.equal(bootRes.estado, "COMPLETED");

  // 2. Verificar estado inicial de Onboarding (Incompleto)
  const estado1 = await obtenerEstadoOnboardingTenant(db as any, "empresa_b6_flow", "CO");
  assert.equal(estado1.readinessTotal.listo, false);
  assert.ok(estado1.numeracionBorrador !== null);
  assert.equal(estado1.ventaDemostracion.disponible, true);

  // Intentar realizar una venta fiscal desde backend (debe rebotar por readiness fiscal incompleta)
  await assert.rejects(
    confirmarVentaFiscal(
      db as any,
      {
        commandId: "cmd_sale_fail",
        idempotencyKey: "idem_sale_fail",
        correlationId: "corr_sale_fail",
        causationId: "cause_sale_fail",
        expectedRevision: 1,
        ventaId: "vta_test_1",
        tipoDocumento: "pos",
        expectedAsignacionRevision: 1,
        venta: {
          items: [{ id: "prod_1", nombre: "Café", cantidad: 1, precioUnitario: 5000, subtotal: 5000, impuestoTipo: "excluido", impuestoTarifa: 0, impuestoValor: 0, base: 5000 }],
          totales: { subtotalBase: 5000, totalINC: 0, total: 5000 },
          pago: { metodo: "efectivo", recibido: 5000, cambio: 0 },
        },
      },
      { empresaId: "empresa_b6_flow", actorId: "owner_usr_77", paisFiscal: "CO", origen: "ADMIN", rolEfectivo: "admin" }
    ),
    /ASIGNACION_NOT_FOUND|READINESS_FISCAL_INCOMPLETA|NUMERACION_INVALIDA/
  );
  db.docs.delete("ventas/vta_test_1");

  // 3. Paso 1 Onboarding: Guardar Configuración Fiscal (B1)
  await completarPasoConfiguracionFiscalOnboarding(
    db as any,
    {
      commandId: "cmd_onb_fiscal",
      idempotencyKey: "idem_onb_fiscal",
      correlationId: "corr_onb_fiscal",
      causationId: "cause_onb_fiscal",
      expectedRevision: 1,
      identidadFiscal: {
        razonSocial: "Café B6 Flujo S.A.S.",
        tipoPersona: "JURIDICA",
        tipoDocumento: "NIT",
        numeroDocumento: "900999888",
        digitoVerificacion: "5",
        regimenTributario: "responsable_iva",
        actividadEconomicaPrincipal: "5611",
        contactoEmail: "admin@cafeb6.com",
        contactoTelefono: "+573001234567",
      },
      direccionFiscal: {
        linea1: "Carrera 7 # 12-34",
        departamentoCodigo: "11",
        departamentoNombre: "Bogotá D.C.",
        municipioCodigo: "11001",
        municipioNombre: "Bogotá",
      },
    },
    { empresaId: "empresa_b6_flow", actorId: "owner_usr_77", origen: "ONBOARDING", paisFiscal: "CO" }
  );
  assert.deepEqual(
    db.read("configuraciones/empresa_b6_flow").modulos.habilitados,
    ["sell"],
    "onboarding persiste el módulo operativo; readiness no puede simularlo en memoria"
  );

  // 4. Paso 2 Onboarding: Configurar, Habilitar y Asignar Numeración Pos (B2)
  const borradorId = estado1.numeracionBorrador!.numeracionId;
  const numRes = await completarPasoNumeracionOnboarding(
    db as any,
    {
      commandId: "cmd_onb_num",
      idempotencyKey: "idem_onb_num",
      correlationId: "corr_onb_num",
      causationId: "cause_onb_num",
      expectedRevision: 1,
      numeracionId: borradorId,
      prefijo: "POS",
      resolucion: "18769999999",
      rangoInicio: 1,
      rangoFin: 5000,
      vigenciaDesde: "2026-01-01",
      vigenciaHasta: "2099-12-31",
    },
    { empresaId: "empresa_b6_flow", actorId: "owner_usr_77", origen: "ADMIN", paisFiscal: "CO" }
  );

  assert.ok(numRes.numeracionRevision >= 2);
  assert.ok(numRes.asignacionRevision >= 1);

  // 5. Verificar estado final de Onboarding (Listo)
  const estado2 = await obtenerEstadoOnboardingTenant(db as any, "empresa_b6_flow", "CO");
  assert.equal(estado2.readinessTotal.listo, true);
  assert.equal(estado2.readinessTotal.causas.length, 0);
  assert.equal(estado2.ventaDemostracion.disponible, false);
  assert.equal(estado2.ventaDemostracion.causa, "READINESS_FISCAL_COMPLETA");

  // 6. Confirmar que la autoridad de Lifecycle (Empresa.estado) PERMANECE intacta en "trial"
  const empresa = db.read("empresas/empresa_b6_flow");
  assert.equal(empresa.estado, "trial");

  // 7. Confirmar que las operaciones de backend de ventas (B2) ahora quedan completamente habilitadas
  const ventaOk = await confirmarVentaFiscal(
    db as any,
    {
      commandId: "cmd_sale_ok",
      idempotencyKey: "idem_sale_ok",
      correlationId: "corr_sale_ok",
      causationId: "cause_sale_ok",
      expectedRevision: numRes.numeracionRevision,
      ventaId: "vta_test_ok",
      tipoDocumento: "pos",
      expectedAsignacionRevision: 1,
      venta: {
        items: [{ id: "prod_1", nombre: "Café Espresso", cantidad: 1, precioUnitario: 4500, subtotal: 4500, impuestoTipo: "excluido", impuestoTarifa: 0, impuestoValor: 0, base: 4500 }],
        totales: { subtotalBase: 4500, totalINC: 0, total: 4500 },
        pago: { metodo: "efectivo", recibido: 5000, cambio: 500 },
      },
    },
    { empresaId: "empresa_b6_flow", actorId: "owner_usr_77", paisFiscal: "CO", origen: "ADMIN", rolEfectivo: "admin" }
  );

  assert.equal(ventaOk.numero, 1);
  assert.equal(ventaOk.prefijo, "POS");
});

test("B6 Onboarding persiste solo módulos contratados y nunca agrega sell", async () => {
  const db = new Db();
  const empresaId = "empresa_sin_sell";
  db.seed(`empresas/${empresaId}`, { id: empresaId, empresaId, paisFiscal: "CO", estado: "trial" });
  db.seed(`configuraciones/${empresaId}`, crearPlantillaConfiguracionRevision1({
    empresaId,
    nombreComercial: "Tenant sin POS",
    creadaEn: "t",
    actualizadaEn: "t",
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BOOTSTRAP", commandId: "cmd_init", correlationId: "corr_init" },
  }));
  db.seed(`suscripciones/${empresaId}`, { empresaId, planId: "plan_reportes", planVersion: 1, estado: "trialing" });
  db.seed("planes/plan_reportes/versiones/1", {
    planId: "plan_reportes", planVersion: 1, estado: "PUBLICADA", capacidades: ["reports", "capacidad_no_soportada"],
  });

  await completarPasoConfiguracionFiscalOnboarding(db as any, {
    commandId: "cmd_onb_sin_sell", idempotencyKey: "idem_onb_sin_sell", correlationId: "corr_onb_sin_sell", causationId: "cause_onb_sin_sell", expectedRevision: 1,
    identidadFiscal: { razonSocial: "Tenant sin POS SAS", tipoPersona: "JURIDICA", tipoDocumento: "NIT", numeroDocumento: "900999888", digitoVerificacion: "5", regimenTributario: "responsable_iva", actividadEconomicaPrincipal: "5611" },
    direccionFiscal: { linea1: "Calle 1", departamentoCodigo: "11", departamentoNombre: "Bogotá", municipioCodigo: "11001", municipioNombre: "Bogotá" },
  }, { empresaId, actorId: "owner_sin_sell", origen: "ONBOARDING", paisFiscal: "CO" });

  assert.deepEqual(db.read(`configuraciones/${empresaId}`).modulos.habilitados, ["reports"]);
});
