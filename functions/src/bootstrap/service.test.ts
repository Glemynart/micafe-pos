import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { ejecutarBootstrapEmpresarial } from "./service";
import { ofertaComercialActivaRef, ofertaComercialRef } from "../suscripciones/ofertas-tenant";
import { crearIdentificadorInterno } from "../turnos/identificadores";
import type { EntradaBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";
import { MODULOS_CONFIGURACION, MODULOS_PERMITIDOS_BODEGA_MVP1 } from "../../../lib/configuracion";
import { calcularVigenciaTrialUtc } from "../../../lib/suscripciones/contrato";

class Ref {
  constructor(public path: string, private db: Db) {}
  collection(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  async get() { return new Snap(this.db.docs.get(this.path)); }
  async update(data: any) { this.db.update(this.path, data); }
  async set(data: any) { this.db.seed(this.path, data); }
  async create(data: any) {
    if (this.db.docs.has(this.path)) throw new Error(`EXISTS:${this.path}`);
    this.db.seed(this.path, data);
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
  constructor() {
    this.seed("permisos_roles/admin", { permisos: ["configuracion", "pos"] });
  }
  collection(n: string) { return new Ref(n, this); }
  seed(k: string, v: any) { this.docs.set(k, structuredClone(v)); }
  read(k: string) { return this.docs.get(k); }
  update(k: string, v: any) {
    const cur = { ...this.docs.get(k) };
    for (const [key, val] of Object.entries(v)) {
      if (val === FieldValue.delete()) {
        delete cur[key];
      } else {
        cur[key] = structuredClone(val);
      }
    }
    this.docs.set(k, cur);
  }
  async runTransaction<T>(cb: (tx: any) => Promise<T>) {
    let release!: () => void;
    const before = this.queue;
    this.queue = new Promise((r) => (release = r));
    await before;
    const w = new Map([...this.docs].map(([k, v]) => [k, structuredClone(v)]));
    let hasWritten = false;
    const tx = {
      get: async (r: Ref) => {
        if (hasWritten) throw new Error("TRANSACTION_READ_AFTER_WRITE");
        return new Snap(w.get(r.path));
      },
      create: (r: Ref, v: any) => {
        hasWritten = true;
        if (w.has(r.path)) throw new Error("EXISTS");
        w.set(r.path, structuredClone(v));
      },
      set: (r: Ref, v: any) => {
        hasWritten = true;
        w.set(r.path, structuredClone(v));
      },
      update: (r: Ref, v: any) => {
        hasWritten = true;
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

const entradaBase: EntradaBootstrapEmpresarial = {
  commandId: "cmd_boot_1",
  idempotencyKey: "idem_boot_1",
  correlationId: "corr_boot_1",
  causationId: "cause_boot_1",
  ownerUid: "owner_usr_99",
  empresaId: "empresa_test_b5",
  nombreComercial: "Café B5 Central",
  paisFiscal: "CO",
  planId: "plan_pos_pro",
  planVersion: 1,
  trialDias: 30,
};

const ownerExistente = async () => {};

let credencialEmitidaLog: Array<{ empresaId: string; uid: string; permisos: string[]; nombreComercial: string }>;
const credencialIssuerExitoso = async (p: { empresaId: string; uid: string; permisos: string[]; nombreComercial: string }) => {
  credencialEmitidaLog.push(p);
  return {
    incorporacionId: `inc_${p.empresaId}_${p.uid}`,
    codigo: `codigo-${p.empresaId}`,
    pinTemporal: "123456",
    estado: "EMITIDA" as const,
  };
};

test("Bootstrap creates the audit obligation in the same core commit", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
  });

  await ejecutarBootstrapEmpresarial(
    db as any,
    entradaBase,
    async () => {},
    ownerExistente,
    (tx) => tx.create(db.collection("saas_auditoria_obligaciones").doc("bootstrap_atomic"), {
      estado: "PENDIENTE",
    }),
    undefined,
    credencialIssuerExitoso,
  );

  assert.equal(db.read("empresas/empresa_test_b5").estado, "trial");
  assert.equal(db.read("saas_auditoria_obligaciones/bootstrap_atomic").estado, "PENDIENTE");
});

test("Bootstrap does not publish its core when the durable audit obligation cannot be created", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
  });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(
      db as any,
      entradaBase,
      async () => {},
      ownerExistente,
      () => { throw new Error("AUDIT_OBLIGATION_WRITE_FAILED"); },
      undefined,
      credencialIssuerExitoso,
    ),
    /AUDIT_OBLIGATION_WRITE_FAILED/,
  );

  assert.equal(db.read("empresas/empresa_test_b5"), undefined);
  assert.equal(db.read("provisionamientos_empresariales/prov_"), undefined);
});

test("B5 Bootstrap — ownerUid existente completa sin emitir claims tenant", async () => {
  const db = new Db();
  // Sembrar versión de plan publicada
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
    codigo: "PLAN_PRO",
    capacidades: ["pos", "kds"],
    limites: {},
    periodicidad: "MENSUAL",
    grandfathered: false,
    revision: 1,
    schemaVersion: 1,
  });

  const claimsEmitidosLog: Array<{ uid: string; empresaId: string; rol: string }> = [];
  const mockEmitter = async (uid: string, empresaId: string, rol: "admin") => {
    claimsEmitidosLog.push({ uid, empresaId, rol });
  };
  credencialEmitidaLog = [];

  const res = await ejecutarBootstrapEmpresarial(
    db as any, entradaBase, mockEmitter, ownerExistente, undefined, undefined, credencialIssuerExitoso,
  );

  assert.equal(res.estado, "COMPLETED");
  assert.equal(res.claimsEmitidos, false);
  assert.equal(res.idempotente, false);
  assert.equal(claimsEmitidosLog.length, 0);

  // La credencial inicial se emite una sola vez para el owner del bootstrap;
  // los claims del tenant quedan reservados para su activación posterior.
  assert.equal(credencialEmitidaLog.length, 1);
  assert.equal(credencialEmitidaLog[0].uid, "owner_usr_99");
  assert.equal(credencialEmitidaLog[0].empresaId, "empresa_test_b5");
  assert.deepEqual(res.credencialInicial, { codigo: "codigo-empresa_test_b5", pinTemporal: "123456" });
  // El provisionamientoId real depende del hash de idempotencyKey; se
  // localiza por búsqueda en vez de precalcularlo aquí.
  const provDoc = [...db.docs.entries()].find(([k]) => k.startsWith("provisionamientos_empresariales/"));
  assert.ok(provDoc, "debe existir un documento de provisionamiento");
  assert.equal(provDoc![1].estado, "COMPLETED");
  assert.equal(provDoc![1].ultimoPasoConfirmado, "COMPLETED");
  const credencialInicialPersistida = provDoc![1].credencialInicial;
  assert.equal(credencialInicialPersistida.codigo, "codigo-empresa_test_b5");
  assert.equal("pinTemporal" in credencialInicialPersistida, false, "el provisionamiento NUNCA guarda el PIN");

  // Verificar que el núcleo completo fue creado en la transacción
  const empresa = db.read("empresas/empresa_test_b5");
  assert.equal(empresa.estado, "trial");
  assert.equal(empresa.ownerUid, "owner_usr_99");
  assert.equal(empresa.nombre, "Café B5 Central");
  assert.equal(empresa.esFundacional, false);

  for (const claveOperativa of ["caja-principal", "caja-fuerte"] as const) {
    const cuentaId = crearIdentificadorInterno("empresa_test_b5", `cuenta:${claveOperativa}`);
    const cuenta = db.read(`cuentas_bancarias/${cuentaId}`);
    assert.deepEqual(
      { id: cuenta.id, empresaId: cuenta.empresaId, claveOperativa: cuenta.claveOperativa, saldo: cuenta.saldo },
      { id: cuentaId, empresaId: "empresa_test_b5", claveOperativa, saldo: 0 },
    );
  }

  const config = db.read("configuraciones/empresa_test_b5");
  assert.equal(config.revision, 1);
  assert.equal(config.vertical, "GENERAL");
  assert.equal(config.identidadFiscal.nombreComercial, "Café B5 Central");
  assert.deepEqual(db.read("permisos_roles/vendedor").permisos, ["sell", "shifts"]);

  const espacio = db.read("espacios/esp_empresa_test_b5_1");
  assert.equal(espacio.empresaId, "empresa_test_b5");

  const numeracion = db.read("numeraciones/empresa_test_b5_num_empresa_test_b5_1");
  assert.equal(numeracion.estado, "BORRADOR");

  const membresia = db.read("membresias/empresa_test_b5_owner_usr_99");
  assert.equal(membresia.rol, "admin");
  assert.equal(membresia.estado, "activa");

  const sub = db.read("suscripciones/empresa_test_b5");
  assert.equal(sub.estado, "trialing");
  assert.equal(sub.planId, "plan_pos_pro");

  const reintento = await ejecutarBootstrapEmpresarial(
    db as any,
    entradaBase,
    async () => { throw new Error("NO_DEBE_EMITIR_CLAIMS"); },
    ownerExistente,
    undefined,
    undefined,
    credencialIssuerExitoso,
  );
  assert.equal(reintento.estado, "COMPLETED");
  assert.equal(reintento.claimsEmitidos, false);
  assert.equal(reintento.idempotente, true);
});

test("G-SAAS-02: Bootstrap materializa los módulos del Plan en un tenant DEMO", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
    capacidades: ["sell", "inventory", "purchases", "clientes", "finanzas", "reservas", "waste", "shifts", "cuentas_cobro"],
    limites: {},
    periodicidad: "ANUAL",
    codigo: "PLAN_PRO",
    precio: { importe: 1800000, moneda: "COP" },
    grandfathered: false,
    revision: 1,
    schemaVersion: 1,
  });

  await ejecutarBootstrapEmpresarial(
    db as any,
    entradaBase,
    async () => {},
    ownerExistente,
    undefined,
    undefined,
    credencialIssuerExitoso,
  );

  assert.deepEqual(db.read("configuraciones/empresa_test_b5").modulos.habilitados, [
    "sell", "inventory", "purchases", "shifts", "waste", "cuentas_cobro", "clientes", "reservas", "finanzas",
  ]);
});

test("ADR-SAAS-061: Bootstrap resuelve y consume atómicamente una oferta anual específica sin alterar el catálogo público", async () => {
  const db = new Db();
  const registrarBootstrapPlataforma = () => ({ obligacionId: "audit_bootstrap_jimenez_test" });
  const empresaId = "distribuidora-las-jimenez";
  const ofertaId = "oferta-distribuidora-jimenez-2026";
  db.seed("planes/mvp_comercial/versiones/2", {
    planId: "mvp_comercial",
    planVersion: 2,
    estado: "PUBLICADA",
    codigo: "MVP_COMERCIAL",
    capacidades: ["sell", "inventory", "clientes", "finanzas", "shifts"],
    limites: {},
    periodicidad: "ANUAL",
    precio: { importe: 1800000, moneda: "COP" },
    grandfathered: false,
    revision: 2,
    schemaVersion: 1,
  });
  db.seed(ofertaComercialActivaRef(db as never, empresaId).path, {
    empresaId,
    ofertaActivaId: ofertaId,
    revision: 1,
  });
  db.seed(ofertaComercialRef(db as never, empresaId, ofertaId).path, {
    ofertaId,
    empresaIdObjetivo: empresaId,
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1600000, moneda: "COP" },
    estado: "APROBADA",
    iniciaEn: "2026-10-16",
    expiraEn: null,
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "ADR-SAAS-061",
    revision: 2,
    schemaVersion: 1,
  });

  const entrada: EntradaBootstrapEmpresarial = {
    ...entradaBase,
    empresaId,
    nombreComercial: "Distribuidora Las Jiménez",
    planId: "mvp_comercial",
    planVersion: 2,
    vertical: "BODEGA_MVP1",
    commandId: "cmd_boot_jimenez_1",
    idempotencyKey: "idem_boot_jimenez_1",
    correlationId: "corr_boot_jimenez_1",
    causationId: "cause_boot_jimenez_1",
  };

  const creado = await ejecutarBootstrapEmpresarial(
    db as any, entrada, async () => {}, ownerExistente, registrarBootstrapPlataforma, undefined, credencialIssuerExitoso,
  );

  assert.equal(creado.estado, "COMPLETED");
  const suscripcion = db.read(`suscripciones/${empresaId}`);
  assert.equal(suscripcion.estado, "trialing");
  assert.equal(
    Date.parse(`${suscripcion.trialFin}T00:00:00.000Z`) - Date.parse(`${suscripcion.trialInicio}T00:00:00.000Z`),
    30 * 24 * 60 * 60 * 1000,
    "Bootstrap Bodega con oferta anual debe crear un Trial exacto de 30 días",
  );
  assert.deepEqual(suscripcion.snapshotContrato.precio, { importe: 1600000, moneda: "COP" });
  assert.deepEqual(db.read("planes/mvp_comercial/versiones/2").precio, { importe: 1800000, moneda: "COP" });
  assert.equal(db.read(ofertaComercialRef(db as never, empresaId, ofertaId).path).estado, "CONSUMIDA");
  assert.equal(db.read(ofertaComercialActivaRef(db as never, empresaId).path).ofertaActivaId, null);

  const replay = await ejecutarBootstrapEmpresarial(
    db as any, entrada, async () => { throw new Error("NO_DEBE_EMITIR_CLAIMS"); }, ownerExistente, registrarBootstrapPlataforma, undefined, credencialIssuerExitoso,
  );
  assert.equal(replay.idempotente, true);
  assert.deepEqual(db.read(`suscripciones/${empresaId}`).snapshotContrato.precio, { importe: 1600000, moneda: "COP" });

  const empresaVencida = "empresa-oferta-vencida";
  const ofertaVencida = "oferta-vencida-2020";
  db.seed(ofertaComercialActivaRef(db as never, empresaVencida).path, {
    empresaId: empresaVencida,
    ofertaActivaId: ofertaVencida,
    revision: 1,
  });
  db.seed(ofertaComercialRef(db as never, empresaVencida, ofertaVencida).path, {
    ofertaId: ofertaVencida,
    empresaIdObjetivo: empresaVencida,
    planIdBase: "mvp_comercial",
    planVersionBase: 2,
    periodicidad: "ANUAL",
    precioAcordado: { importe: 1600000, moneda: "COP" },
    estado: "APROBADA",
    iniciaEn: "2020-01-01",
    expiraEn: "2020-01-02",
    motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "ADR-SAAS-061",
    revision: 2,
    schemaVersion: 1,
  });
  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, {
      ...entrada,
      empresaId: empresaVencida,
      commandId: "cmd_boot_vencida_1",
      idempotencyKey: "idem_boot_vencida_1",
      correlationId: "corr_boot_vencida_1",
      causationId: "cause_boot_vencida_1",
    }, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso),
    /OFERTA_COMERCIAL_NO_ADMISIBLE/,
  );
  assert.equal(db.read(`empresas/${empresaVencida}`), undefined);
});

test("ADR-SAAS-087: Bootstrap obtiene 15 días de la oferta v2 aprobada, y snapshot, oferta y auditoría conservan la misma vigencia", async () => {
  const db = new Db();
  const empresaId = "distribuidora-las-jimenez";
  const ofertaId = "oferta-distribuidora-jimenez-2026";
  const referenciaAceptacionCliente = "G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23";
  db.seed("planes/mvp_comercial/versiones/2", {
    planId: "mvp_comercial", planVersion: 2, estado: "PUBLICADA", codigo: "MVP_COMERCIAL",
    capacidades: ["sell", "inventory", "clientes", "finanzas", "shifts"], limites: {}, periodicidad: "ANUAL",
    precio: { importe: 1800000, moneda: "COP" }, grandfathered: false, revision: 2, schemaVersion: 1,
  });
  db.seed(ofertaComercialActivaRef(db as never, empresaId).path, { empresaId, ofertaActivaId: ofertaId, revision: 1 });
  db.seed(ofertaComercialRef(db as never, empresaId, ofertaId).path, {
    schemaVersion: 2, ofertaId, empresaIdObjetivo: empresaId, planIdBase: "mvp_comercial", planVersionBase: 2,
    periodicidad: "ANUAL", precioAcordado: { importe: 1600000, moneda: "COP" }, estado: "APROBADA",
    iniciaEn: "2026-10-16", expiraEn: null, motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06",
    trialDias: 15, referenciaAceptacionCliente, revision: 2,
  });
  const entrada = {
    ...entradaBase, empresaId, nombreComercial: "Distribuidora Las Jiménez", planId: "mvp_comercial", planVersion: 2,
    vertical: "BODEGA_MVP1" as const, commandId: "cmd_trial_diana_15", idempotencyKey: "idem_trial_diana_15",
    correlationId: "corr_trial_diana_15", causationId: "cause_trial_diana_15", trialDias: 30,
  };

  const observer = () => ({ obligacionId: "audit_trial_diana_15" });
  const creado = await ejecutarBootstrapEmpresarial(db as any, entrada, async () => {}, ownerExistente, observer, undefined, credencialIssuerExitoso);
  const suscripcion = db.read(`suscripciones/${empresaId}`);
  const oferta = db.read(ofertaComercialRef(db as never, empresaId, ofertaId).path);
  const eventoTrial = [...db.docs.values()].find((documento) => documento.comando === "TrialIniciado");

  assert.equal(creado.estado, "COMPLETED");
  assert.equal(creado.ofertaComercialId, ofertaId);
  assert.equal(suscripcion.snapshotContrato.schemaVersion, 2);
  assert.equal(suscripcion.snapshotContrato.trialDias, 15);
  assert.equal(suscripcion.snapshotContrato.ofertaComercialId, ofertaId);
  assert.equal(suscripcion.snapshotContrato.referenciaAceptacionCliente, referenciaAceptacionCliente);
  assert.deepEqual(suscripcion.snapshotContrato.vigencia, { inicio: suscripcion.trialInicio, fin: suscripcion.trialFin });
  assert.equal(Date.parse(`${suscripcion.trialFin}T00:00:00.000Z`) - Date.parse(`${suscripcion.trialInicio}T00:00:00.000Z`), 15 * 86_400_000);
  assert.deepEqual(
    { inicio: oferta.trialInicio, fin: oferta.trialFin, trialDias: oferta.trialDias, estado: oferta.estado },
    { inicio: suscripcion.trialInicio, fin: suscripcion.trialFin, trialDias: 15, estado: "CONSUMIDA" },
  );
  assert.deepEqual(
    { inicio: eventoTrial.resultado.trialInicio, fin: eventoTrial.resultado.trialFin, trialDias: eventoTrial.resultado.trialDias, ofertaId: eventoTrial.resultado.ofertaComercialId },
    { inicio: suscripcion.trialInicio, fin: suscripcion.trialFin, trialDias: 15, ofertaId },
  );
  assert.deepEqual(suscripcion.snapshotContrato.precio, { importe: 1600000, moneda: "COP" });
  assert.equal([...db.docs.keys()].some((path) => path.startsWith("pagos_saas/")), false);
  assert.equal([...db.docs.values()].some((documento) => documento.comando === "SuscripcionPagoAnualConfirmado"), false);

  const replay = await ejecutarBootstrapEmpresarial(db as any, entrada, async () => {}, ownerExistente, observer, undefined, credencialIssuerExitoso);
  assert.equal(replay.idempotente, true);
  assert.equal(db.read(`suscripciones/${empresaId}`).trialFin, suscripcion.trialFin);
  assert.equal([...db.docs.values()].filter((documento) => documento.comando === "TrialIniciado").length, 1);
});

test("ADR-SAAS-087: la oferta v2 no puede aplicar la excepción a otra empresa", async () => {
  const db = new Db();
  const empresaId = "otra-empresa";
  const ofertaId = "oferta-distribuidora-jimenez-2026";
  db.seed("planes/mvp_comercial/versiones/2", {
    planId: "mvp_comercial", planVersion: 2, estado: "PUBLICADA", codigo: "MVP_COMERCIAL",
    capacidades: ["sell", "inventory"], limites: {}, periodicidad: "ANUAL",
    precio: { importe: 1800000, moneda: "COP" }, grandfathered: false, revision: 2, schemaVersion: 1,
  });
  db.seed(ofertaComercialActivaRef(db as never, empresaId).path, { empresaId, ofertaActivaId: ofertaId, revision: 1 });
  db.seed(ofertaComercialRef(db as never, empresaId, ofertaId).path, {
    schemaVersion: 2, ofertaId, empresaIdObjetivo: empresaId, planIdBase: "mvp_comercial", planVersionBase: 2,
    periodicidad: "ANUAL", precioAcordado: { importe: 1600000, moneda: "COP" }, estado: "APROBADA",
    iniciaEn: "2026-10-16", expiraEn: null, motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "G-SAAS-02-PO-OFFER-DISTRIBUIDORA-LAS-JIMENEZ-2026-10-06",
    trialDias: 15, referenciaAceptacionCliente: "G-SAAS-02-DIANA-TRIAL-15-DIAS-ACEPTADO-2026-10-23", revision: 2,
  });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, {
      ...entradaBase, empresaId, planId: "mvp_comercial", planVersion: 2, vertical: "BODEGA_MVP1",
      commandId: "cmd_trial_diana_other_tenant", idempotencyKey: "idem_trial_diana_other_tenant",
      correlationId: "corr_trial_diana_other_tenant", causationId: "cause_trial_diana_other_tenant",
    }, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso),
    /OFERTA_COMERCIAL_TRIAL_EXCEPTION_INVALIDA/,
  );
  assert.equal(db.read(`empresas/${empresaId}`), undefined);
  assert.equal(db.read(`suscripciones/${empresaId}`), undefined);
  assert.equal(db.read(ofertaComercialRef(db as never, empresaId, ofertaId).path).estado, "APROBADA");
});

test("ADR-SAAS-087: la excepción solo se consume por el Bootstrap de plataforma auditado", async () => {
  const db = new Db();
  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, {
      ...entradaBase, empresaId: "distribuidora-las-jimenez", planId: "mvp_comercial", planVersion: 2,
      commandId: "cmd_trial_diana_self_service", idempotencyKey: "idem_trial_diana_self_service",
      correlationId: "corr_trial_diana_self_service", causationId: "cause_trial_diana_self_service",
    }, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso),
    /BOOTSTRAP_TRIAL_EXCEPTION_REQUIRES_PLATFORM/,
  );
  assert.equal(db.read("bootstrap_identidades_owner/distribuidora-las-jimenez"), undefined);
  assert.equal(db.read("empresas/distribuidora-las-jimenez"), undefined);
  assert.equal(db.read("suscripciones/distribuidora-las-jimenez"), undefined);
});

test("ADR-SAAS-087: Bootstrap ignora cualquier intento de pedir 15 días desde el payload", async () => {
  const db = new Db();
  db.seed("planes/mvp_comercial/versiones/2", {
    planId: "mvp_comercial", planVersion: 2, estado: "PUBLICADA", codigo: "MVP_COMERCIAL",
    capacidades: ["sell", "inventory"], limites: {}, periodicidad: "ANUAL",
    precio: { importe: 1800000, moneda: "COP" }, grandfathered: false, revision: 2, schemaVersion: 1,
  });
  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, {
      ...entradaBase, empresaId: "empresa_trial_payload_15", planId: "mvp_comercial", planVersion: 2,
      trialDias: 15, commandId: "cmd_trial_payload_15", idempotencyKey: "idem_trial_payload_15",
      correlationId: "corr_trial_payload_15", causationId: "cause_trial_payload_15",
    }, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso),
    /TRIAL_ANUAL_DEBE_SER_30_DIAS/,
  );
  assert.equal(db.read("empresas/empresa_trial_payload_15"), undefined);
  assert.equal(db.read("suscripciones/empresa_trial_payload_15"), undefined);
});

test("ADR-SAAS-087: vigencia de 15 días usa fechas UTC exactas en fin de mes, año nuevo y año bisiesto", () => {
  const escenarios = [
    { inicio: "2026-10-25T23:45:00.000Z", fin: "2026-11-09" },
    { inicio: "2026-12-24T23:45:00.000Z", fin: "2027-01-08" },
    { inicio: "2024-02-20T23:45:00.000Z", fin: "2024-03-06" },
  ];
  for (const escenario of escenarios) {
    const vigencia = calcularVigenciaTrialUtc(new Date(escenario.inicio), 15);
    assert.equal(vigencia.fin, escenario.fin);
    assert.equal(Date.parse(`${vigencia.fin}T00:00:00.000Z`) - Date.parse(`${vigencia.inicio}T00:00:00.000Z`), 15 * 86_400_000);
  }
});

test("ADR-SAAS-061: Bootstrap rechaza un control de oferta existente sin revisión ni puntero canónico", async () => {
  const db = new Db();
  const empresaId = "empresa_control_oferta_invalido";
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
    codigo: "PLAN_PRO",
    capacidades: ["sell", "inventory", "purchases", "shifts"],
    limites: {},
    periodicidad: "ANUAL",
    precio: { importe: 1800000, moneda: "COP" },
    grandfathered: false,
    revision: 1,
    schemaVersion: 1,
  });
  db.seed(ofertaComercialActivaRef(db as never, empresaId).path, {
    empresaId,
    ofertaActivaId: null,
  });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, {
      ...entradaBase,
      empresaId,
      idempotencyKey: "idem_control_oferta_invalido",
      commandId: "cmd_control_oferta_invalido",
      correlationId: "corr_control_oferta_invalido",
      causationId: "cause_control_oferta_invalido",
    }, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso),
    /OFERTA_COMERCIAL_CONTROL_INVALIDO/,
  );
  assert.equal(db.read(`empresas/${empresaId}`), undefined);
  assert.equal(db.read(`suscripciones/${empresaId}`), undefined);
});

test("ADR-SAAS-061: Bootstrap falla cerrado si la identidad persistida de la oferta no coincide con su puntero", async (t) => {
  const casos = [
    { nombre: "ID embebido distinto al documento apuntado", schemaVersion: 1, revision: 2, ofertaId: "otra_oferta", periodicidad: "ANUAL" },
    { nombre: "revisión de oferta no positiva", schemaVersion: 1, revision: 0, ofertaId: "oferta_canonica", periodicidad: "ANUAL" },
    { nombre: "versión de oferta desconocida", schemaVersion: 3, revision: 1, ofertaId: "oferta_canonica", periodicidad: "ANUAL" },
    { nombre: "periodicidad persistida distinta de ANUAL", schemaVersion: 1, revision: 1, ofertaId: "oferta_canonica", periodicidad: "MENSUAL" },
  ];

  for (const [indice, caso] of casos.entries()) {
    await t.test(caso.nombre, async () => {
      const db = new Db();
      const empresaId = `empresa_oferta_malformada_${indice}`;
      const ofertaId = "oferta_canonica";
      db.seed("planes/plan_pos_pro/versiones/1", {
        planId: "plan_pos_pro",
        planVersion: 1,
        estado: "PUBLICADA",
        codigo: "PLAN_PRO",
        capacidades: ["sell", "inventory", "purchases", "shifts"],
        limites: {},
        periodicidad: "ANUAL",
        precio: { importe: 1800000, moneda: "COP" },
        grandfathered: false,
        revision: 1,
        schemaVersion: 1,
      });
      db.seed(ofertaComercialActivaRef(db as never, empresaId).path, {
        empresaId,
        ofertaActivaId: ofertaId,
        revision: 1,
      });
      db.seed(ofertaComercialRef(db as never, empresaId, ofertaId).path, {
        schemaVersion: caso.schemaVersion,
        ofertaId: caso.ofertaId,
        empresaIdObjetivo: empresaId,
        planIdBase: "plan_pos_pro",
        planVersionBase: 1,
        periodicidad: caso.periodicidad,
        precioAcordado: { importe: 1600000, moneda: "COP" },
        estado: "APROBADA",
        iniciaEn: "2026-10-16",
        expiraEn: null,
        motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
        referenciaAprobacion: "ADR-SAAS-061",
        revision: caso.revision,
      });

      await assert.rejects(
        ejecutarBootstrapEmpresarial(db as any, {
          ...entradaBase,
          empresaId,
          idempotencyKey: `idem_oferta_malformada_${indice}`,
          commandId: `cmd_oferta_malformada_${indice}`,
          correlationId: `corr_oferta_malformada_${indice}`,
          causationId: `cause_oferta_malformada_${indice}`,
        }, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso),
        /OFERTA_COMERCIAL_INVALIDA/,
      );
      assert.equal(db.read(`empresas/${empresaId}`), undefined);
      assert.equal(db.read(`suscripciones/${empresaId}`), undefined);
      assert.equal(db.read(ofertaComercialRef(db as never, empresaId, ofertaId).path).estado, "APROBADA");
      assert.equal(db.read(ofertaComercialActivaRef(db as never, empresaId).path).ofertaActivaId, ofertaId);
    });
  }
});

test("ADR-SAAS-061: tenant existente no consume la oferta ni crea un segundo Trial", async () => {
  const db = new Db();
  const empresaId = "empresa_bootstrap_duplicada";
  const ofertaId = "oferta_bootstrap_duplicada";
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro", planVersion: 1, estado: "PUBLICADA", codigo: "PLAN_PRO",
    capacidades: ["sell", "inventory", "purchases", "shifts"], limites: {}, periodicidad: "ANUAL",
    precio: { importe: 1800000, moneda: "COP" }, grandfathered: false, revision: 1, schemaVersion: 1,
  });
  db.seed(`empresas/${empresaId}`, { empresaId, estado: "trial", revision: 1 });
  db.seed(ofertaComercialActivaRef(db as never, empresaId).path, { empresaId, ofertaActivaId: ofertaId, revision: 1 });
  db.seed(ofertaComercialRef(db as never, empresaId, ofertaId).path, {
    schemaVersion: 1, ofertaId, empresaIdObjetivo: empresaId, planIdBase: "plan_pos_pro", planVersionBase: 1,
    periodicidad: "ANUAL", precioAcordado: { importe: 1600000, moneda: "COP" }, estado: "APROBADA",
    iniciaEn: "2026-10-16", expiraEn: null, motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "ADR-SAAS-061", revision: 1,
  });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, {
      ...entradaBase, empresaId, idempotencyKey: "idem_bootstrap_duplicado", commandId: "cmd_bootstrap_duplicado",
      correlationId: "corr_bootstrap_duplicado", causationId: "cause_bootstrap_duplicado",
    }, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso),
    /EMPRESA_ALREADY_EXISTS/,
  );
  assert.equal(db.read(`empresas/${empresaId}`).estado, "trial");
  assert.equal(db.read(`suscripciones/${empresaId}`), undefined);
  assert.equal(db.read(ofertaComercialRef(db as never, empresaId, ofertaId).path).estado, "APROBADA");
  assert.equal(db.read(ofertaComercialActivaRef(db as never, empresaId).path).ofertaActivaId, ofertaId);
  assert.equal([...db.docs.keys()].some((path) => path.startsWith("provisionamientos_empresariales/")), false);
});

test("ADR-SAAS-061: fallo posterior al commit conserva consumo único y permite recuperar el mismo Bootstrap", async () => {
  const db = new Db();
  const empresaId = "empresa_oferta_recovery";
  const ofertaId = "oferta_recovery";
  db.seed("planes/mvp_comercial/versiones/2", {
    planId: "mvp_comercial", planVersion: 2, estado: "PUBLICADA", codigo: "MVP_COMERCIAL",
    capacidades: ["sell", "inventory", "purchases", "shifts"], limites: {}, periodicidad: "ANUAL",
    precio: { importe: 1800000, moneda: "COP" }, grandfathered: false, revision: 2, schemaVersion: 1,
  });
  db.seed(ofertaComercialActivaRef(db as never, empresaId).path, { empresaId, ofertaActivaId: ofertaId, revision: 1 });
  db.seed(ofertaComercialRef(db as never, empresaId, ofertaId).path, {
    schemaVersion: 1, ofertaId, empresaIdObjetivo: empresaId, planIdBase: "mvp_comercial", planVersionBase: 2,
    periodicidad: "ANUAL", precioAcordado: { importe: 1600000, moneda: "COP" }, estado: "APROBADA",
    iniciaEn: "2026-10-16", expiraEn: null, motivoCodigo: "PRECIO_ESPECIAL_ANUAL",
    referenciaAprobacion: "ADR-SAAS-061", revision: 1,
  });
  const entrada: EntradaBootstrapEmpresarial = {
    ...entradaBase, empresaId, vertical: "BODEGA_MVP1", planId: "mvp_comercial", planVersion: 2,
    commandId: "cmd_offer_recovery", idempotencyKey: "idem_offer_recovery",
    correlationId: "corr_offer_recovery", causationId: "cause_offer_recovery",
  };

  const issuerQueFalla = async () => { throw new Error("CREDENTIAL_PROVIDER_TEMPORARY_FAILURE"); };
  const primerIntento = await ejecutarBootstrapEmpresarial(
    db as any, entrada, async () => {}, ownerExistente, undefined, undefined, issuerQueFalla,
  );
  assert.equal(primerIntento.estado, "RETRYABLE_FAILURE");
  assert.equal(db.read(`empresas/${empresaId}`)?.estado, "trial");
  assert.equal(db.read(`suscripciones/${empresaId}`)?.snapshotContrato.precio.importe, 1600000);
  assert.equal(db.read(ofertaComercialRef(db as never, empresaId, ofertaId).path)?.estado, "CONSUMIDA");
  assert.equal(db.read(ofertaComercialActivaRef(db as never, empresaId).path)?.ofertaActivaId, null);

  const segundoIntento = await ejecutarBootstrapEmpresarial(
    db as any, entrada, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso,
  );
  assert.equal(segundoIntento.estado, "COMPLETED");
  assert.equal(segundoIntento.idempotente, true);
  assert.equal(db.read(`suscripciones/${empresaId}`)?.snapshotContrato.precio.importe, 1600000);
  assert.equal(db.read(ofertaComercialRef(db as never, empresaId, ofertaId).path)?.estado, "CONSUMIDA");
  assert.equal([...db.docs.keys()].filter((path) => path === `empresas/${empresaId}`).length, 1);
  assert.equal([...db.docs.keys()].filter((path) => path === `suscripciones/${empresaId}`).length, 1);
  assert.equal([...db.docs.keys()].filter((path) => path.startsWith("provisionamientos_empresariales/")).length, 1);
});

test("Bodega con Plan anual rechaza duraciones distintas de 30 días antes del commit", async (t) => {
  for (const trialDias of [29, 31]) {
    await t.test(`${trialDias} días`, async () => {
      const db = new Db();
      const empresaId = `empresa_trial_bodega_${trialDias}`;
      db.seed("planes/plan_pos_pro/versiones/1", {
        planId: "plan_pos_pro", planVersion: 1, estado: "PUBLICADA", codigo: "PLAN_PRO",
        capacidades: ["sell", "inventory", "purchases", "shifts"], limites: {}, periodicidad: "ANUAL",
        precio: { importe: 1800000, moneda: "COP" }, grandfathered: false, revision: 1, schemaVersion: 1,
      });
      await assert.rejects(
        ejecutarBootstrapEmpresarial(db as any, {
          ...entradaBase, empresaId, vertical: "BODEGA_MVP1", trialDias,
          idempotencyKey: `idem_trial_bodega_${trialDias}`, commandId: `cmd_trial_bodega_${trialDias}`,
          correlationId: `corr_trial_bodega_${trialDias}`, causationId: `cause_trial_bodega_${trialDias}`,
        }, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso),
        /TRIAL_ANUAL_DEBE_SER_30_DIAS/,
      );
      assert.equal(db.read(`empresas/${empresaId}`), undefined);
      assert.equal(db.read(`suscripciones/${empresaId}`), undefined);
      assert.equal(db.read(ofertaComercialActivaRef(db as never, empresaId).path), undefined);
    });
  }
});

test("Bodega MVP1: Bootstrap propaga el vertical y excluye módulos de restaurante", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
    capacidades: [...MODULOS_CONFIGURACION],
    limites: {},
    periodicidad: "ANUAL",
    codigo: "PLAN_PRO",
    precio: { importe: 1800000, moneda: "COP" },
    grandfathered: false,
    revision: 1,
    schemaVersion: 1,
  });

  await ejecutarBootstrapEmpresarial(
    db as any,
    { ...entradaBase, empresaId: "empresa_bodega_sintetica", idempotencyKey: "idem_bodega_sintetica", commandId: "cmd_bodega_sintetica", correlationId: "corr_bodega_sintetica", causationId: "cause_bodega_sintetica", vertical: "BODEGA_MVP1" },
    async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso,
  );

  const config = db.read("configuraciones/empresa_bodega_sintetica");
  assert.equal(config.vertical, "BODEGA_MVP1");
  assert.deepEqual(config.modulos.habilitados, [...MODULOS_PERMITIDOS_BODEGA_MVP1]);
  assert.equal(config.modulos.habilitados.includes("salon"), false);
  assert.equal(config.modulos.habilitados.includes("reservas"), false);
  assert.deepEqual(db.read("permisos_roles/vendedor").permisos, ["sell", "shifts"]);
  const suscripcion = db.read("suscripciones/empresa_bodega_sintetica");
  assert.equal(suscripcion.estado, "trialing");
  assert.deepEqual(
    suscripcion.snapshotContrato.precio,
    { importe: 1800000, moneda: "COP" },
    "sin oferta tenant, Bootstrap conserva el precio público del Plan",
  );
  assert.equal(
    Date.parse(`${suscripcion.trialFin}T00:00:00.000Z`) - Date.parse(`${suscripcion.trialInicio}T00:00:00.000Z`),
    30 * 24 * 60 * 60 * 1000,
    "Bootstrap Bodega inicia un Trial de 30 días sin catálogo inicial",
  );
  assert.equal([...db.docs.keys()].some(path => path.startsWith("productos/")), false);
  assert.equal([...db.docs.keys()].some(path => path.startsWith("presentaciones_producto/")), false);
  assert.equal(
    db.read("ofertas_comerciales_tenant/empresa_bodega_sintetica"),
    undefined,
    "la ausencia de oferta no crea un control comercial implícito",
  );
});

test("Bodega MVP1: Bootstrap rechaza vertical fuera del contrato cerrado", async () => {
  await assert.rejects(
    ejecutarBootstrapEmpresarial(new Db() as any, { ...entradaBase, vertical: "OTRO" as never }, async () => {}, ownerExistente),
    /ENTRADA_BOOTSTRAP_INVALIDA/,
  );
});

test("Bootstrap rejects a non-existent owner before committing the core", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
  });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(
      db as any,
      entradaBase,
      async () => {},
      async () => { throw new Error("OWNER_NOT_FOUND"); },
    ),
    /OWNER_NOT_FOUND/
  );
  assert.equal(db.read("empresas/empresa_test_b5"), undefined);
});

test("B5 Bootstrap — Rechazo si la versión del Plan no está PUBLICADA", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "BORRADOR",
  });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, entradaBase, async () => {}, ownerExistente),
    /PLAN_NOT_PUBLISHED/
  );
});

test("B5 Bootstrap — ownerUid existente no invoca el emisor de claims", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
  });

  // Si esta función se invocara, el Bootstrap fallaría. El owner existente
  // debe recibir la sesión tenant solo al activar su credencial temporal.
  const failingEmitter = async () => {
    throw new Error("AUTH_NETWORK_TIMEOUT");
  };
  credencialEmitidaLog = [];

  const res = await ejecutarBootstrapEmpresarial(
    db as any, entradaBase, failingEmitter, ownerExistente, undefined, undefined, credencialIssuerExitoso,
  );

  assert.equal(res.estado, "COMPLETED");
  assert.equal(res.claimsEmitidos, false);
  // La credencial inicial se entrega normalmente, sin proyectar claims.
  assert.deepEqual(res.credencialInicial, { codigo: "codigo-empresa_test_b5", pinTemporal: "123456" });
  assert.equal(credencialEmitidaLog.length, 1, "el paso H debe haberse ejecutado exactamente una vez");

  // El núcleo Firestore permanece consistente e intacto.
  assert.equal(db.read("empresas/empresa_test_b5").estado, "trial");
  assert.equal(db.read("suscripciones/empresa_test_b5").estado, "trialing");

});

test("B5 Bootstrap — Fallo al emitir la credencial inicial (paso H) ejecuta Forward Recovery sin tocar claims", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
  });

  let claimsInvocado = false;
  const emitterQueNoDeberiaLlamarse = async () => { claimsInvocado = true; };
  const issuerQueFalla = async () => { throw new Error("CODIGO_OPERATIVO_NO_DISPONIBLE"); };

  const res = await ejecutarBootstrapEmpresarial(
    db as any, entradaBase, emitterQueNoDeberiaLlamarse, ownerExistente, undefined, undefined, issuerQueFalla,
  );

  assert.equal(res.estado, "RETRYABLE_FAILURE");
  assert.equal(res.claimsEmitidos, false);
  assert.equal(res.credencialInicial, null);
  assert.equal(claimsInvocado, false, "los claims no deben emitirse si la credencial inicial falló primero");

  // El núcleo permanece intacto — mismo Forward Recovery que el resto de pasos.
  assert.equal(db.read("empresas/empresa_test_b5").estado, "trial");

  // Reintento con un emisor funcional retoma exactamente en el paso H.
  credencialEmitidaLog = [];
  const res2 = await ejecutarBootstrapEmpresarial(
    db as any, entradaBase, emitterQueNoDeberiaLlamarse, ownerExistente, undefined, undefined, credencialIssuerExitoso,
  );
  assert.equal(res2.estado, "COMPLETED");
  assert.equal(credencialEmitidaLog.length, 1);
  assert.equal(claimsInvocado, false, "ownerUid existente no debe recibir claims durante Bootstrap");
});

test("B5 Bootstrap — Conflicto de idempotencia si se reutiliza idempotencyKey con fingerprint distinto", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
  });

  await ejecutarBootstrapEmpresarial(
    db as any, entradaBase, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso,
  );

  // Intentar reutilizar la misma clave de idempotencia pero modificando el nombre comercial
  const entradaIncompatible: EntradaBootstrapEmpresarial = {
    ...entradaBase,
    nombreComercial: "Otro Nombre Incompatible",
  };

  await assert.rejects(
    ejecutarBootstrapEmpresarial(
      db as any, entradaIncompatible, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso,
    ),
    /IDEMPOTENCY_CONFLICT/
  );
});

// ADR-SAAS-013 (Capa 4) — resolución de identidad del administrador cuando
// el Backoffice no provee un `ownerUid` preexistente.

const entradaSinOwner: EntradaBootstrapEmpresarial = {
  commandId: "cmd_boot_sinowner",
  idempotencyKey: "idem_boot_sinowner",
  correlationId: "corr_boot_sinowner",
  causationId: "cause_boot_sinowner",
  nombreAdministrador: "Ana Admin",
  empresaId: "empresa_test_sinowner",
  nombreComercial: "Café Sin Owner",
  paisFiscal: "CO",
  planId: "plan_pos_pro",
  planVersion: 1,
  trialDias: 30,
};

test("B5 Bootstrap Capa 4 — sin ownerUid, crea el ancla vía resolver (disabled) y la habilita solo al emitir claims", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", { planId: "plan_pos_pro", planVersion: 1, estado: "PUBLICADA" });

  let resolverInvocaciones = 0;
  const resolver = async (nombre: string) => {
    resolverInvocaciones += 1;
    assert.equal(nombre, "Ana Admin");
    return { uid: "uid_generado_por_firebase" };
  };
  const habilitados: string[] = [];
  const enabler = async (uid: string) => { habilitados.push(uid); };
  const claimsLog: Array<{ uid: string }> = [];
  credencialEmitidaLog = [];

  const res = await ejecutarBootstrapEmpresarial(
    db as any,
    entradaSinOwner,
    async (uid) => { claimsLog.push({ uid }); },
    ownerExistente,
    undefined,
    undefined,
    credencialIssuerExitoso,
    resolver,
    enabler,
  );

  assert.equal(res.estado, "COMPLETED");
  assert.equal(resolverInvocaciones, 1);
  assert.equal(db.read("empresas/empresa_test_sinowner").ownerUid, "uid_generado_por_firebase");
  assert.equal(db.read("membresias/empresa_test_sinowner_uid_generado_por_firebase").rol, "admin");
  assert.equal(credencialEmitidaLog[0].uid, "uid_generado_por_firebase");
  assert.equal(claimsLog[0].uid, "uid_generado_por_firebase");
  assert.deepEqual(habilitados, ["uid_generado_por_firebase"], "el ancla creada por Bootstrap debe habilitarse exactamente una vez, en el paso de claims");

  const identidad = db.read("bootstrap_identidades_owner/" + [...db.docs.keys()].find((k) => k.startsWith("bootstrap_identidades_owner/"))!.split("/")[1]);
  assert.equal(identidad.ownerUid, "uid_generado_por_firebase");
});

test("B5 Bootstrap Capa 4 — un reintento con ownerUid conserva los claims y la habilitación de un ancla creada", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", { planId: "plan_pos_pro", planVersion: 1, estado: "PUBLICADA" });

  let resolverInvocaciones = 0;
  const resolver = async () => {
    resolverInvocaciones += 1;
    return { uid: `uid_intento_${resolverInvocaciones}` };
  };
  const habilitados: string[] = [];
  const enabler = async (uid: string) => { habilitados.push(uid); };
  credencialEmitidaLog = [];

  const res1 = await ejecutarBootstrapEmpresarial(
    db as any,
    entradaSinOwner,
    async () => { throw new Error("AUTH_NETWORK_TIMEOUT"); },
    ownerExistente,
    undefined,
    undefined,
    credencialIssuerExitoso,
    resolver,
    enabler,
  );
  assert.equal(res1.estado, "RETRYABLE_FAILURE");
  assert.equal(resolverInvocaciones, 1);
  const ownerUidTrasIntento1 = db.read("empresas/empresa_test_sinowner").ownerUid;
  assert.equal(ownerUidTrasIntento1, "uid_intento_1");

  const entradaReintentoConOwner: EntradaBootstrapEmpresarial = {
    ...entradaSinOwner,
    ownerUid: "uid_intento_1",
  };
  delete entradaReintentoConOwner.nombreAdministrador;
  let claimsEmitidos = false;
  const res2 = await ejecutarBootstrapEmpresarial(
    db as any,
    entradaReintentoConOwner,
    async () => { claimsEmitidos = true; },
    ownerExistente,
    undefined,
    undefined,
    credencialIssuerExitoso,
    resolver,
    enabler,
  );
  assert.equal(res2.estado, "COMPLETED");
  assert.equal(res2.claimsEmitidos, true);
  assert.equal(resolverInvocaciones, 1, "el reintento no debe invocar auth.createUser() de nuevo — reutiliza el UID ya persistido");
  assert.equal(db.read("empresas/empresa_test_sinowner").ownerUid, "uid_intento_1", "el owner no cambia entre intentos");
  assert.equal(claimsEmitidos, true, "un ancla creada por Bootstrap debe emitir claims al recuperarse");
  assert.deepEqual(habilitados, ["uid_intento_1"], "un ancla creada por Bootstrap debe habilitarse al recuperarse");
  assert.equal(credencialEmitidaLog.length, 1, "el reintento no debe volver a emitir la credencial inicial");
});

test("B5 Bootstrap Capa 4 — un rechazo por plan no publicado no crea ningún ancla de identidad (D2: se resuelve DESPUÉS de las verificaciones baratas)", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", { planId: "plan_pos_pro", planVersion: 1, estado: "BORRADOR" });
  let resolverInvocado = false;
  const resolver = async () => { resolverInvocado = true; return { uid: "no-deberia-crearse" }; };

  await assert.rejects(
    ejecutarBootstrapEmpresarial(
      db as any, entradaSinOwner, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso, resolver,
    ),
    /PLAN_NOT_PUBLISHED/,
  );
  assert.equal(resolverInvocado, false, "el rechazo por plan debe ocurrir antes de tocar Auth");
  const identidades = [...db.docs.keys()].filter((k) => k.startsWith("bootstrap_identidades_owner/"));
  assert.equal(identidades.length, 0, "ningún ancla debe crearse si el bootstrap se rechaza antes de llegar a la identidad");
});

test("B5 Bootstrap Capa 4 — un reintento con OTRO envelope sobre la MISMA empresa reutiliza el ancla, no acumula identidades huérfanas (D2)", async () => {
  // Regresión del defecto hallado en la validación E2E: el ancla estaba
  // keyed por `provisionamientoId` (derivado del idempotencyKey), así que
  // cada reintento con un envelope nuevo — el caso típico cuando el
  // operador reenvía el formulario del Backoffice tras un rechazo — fallaba
  // en encontrar el ancla anterior y creaba un principal de Auth adicional.
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", { planId: "plan_pos_pro", planVersion: 1, estado: "PUBLICADA" });

  let resolverInvocaciones = 0;
  const resolver = async () => {
    resolverInvocaciones += 1;
    return { uid: `uid_intento_${resolverInvocaciones}` };
  };
  const enabler = async () => {};

  const res1 = await ejecutarBootstrapEmpresarial(
    db as any, entradaSinOwner, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso, resolver, enabler,
  );
  assert.equal(res1.estado, "COMPLETED");
  assert.equal(resolverInvocaciones, 1);

  // Segundo intento: envelope enteramente distinto, misma empresa. La
  // empresa ya existe (el primer intento la completó), así que este debe
  // rechazarse — pero SIN haber creado una segunda identidad para llegar a
  // ese rechazo.
  const entradaSegundoIntento: EntradaBootstrapEmpresarial = {
    ...entradaSinOwner,
    commandId: "cmd_boot_sinowner_2",
    idempotencyKey: "idem_boot_sinowner_2",
    correlationId: "corr_boot_sinowner_2",
    causationId: "cause_boot_sinowner_2",
  };
  await assert.rejects(
    ejecutarBootstrapEmpresarial(
      db as any, entradaSegundoIntento, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso, resolver, enabler,
    ),
    /EMPRESA_ALREADY_EXISTS/,
  );
  assert.equal(resolverInvocaciones, 1, "debe reutilizar el ancla ya persistida para esta empresa — nunca una segunda identidad por reintentar con otro envelope");

  const identidades = [...db.docs.keys()].filter((k) => k.startsWith("bootstrap_identidades_owner/"));
  assert.equal(identidades.length, 1, "una sola ancla de identidad por empresa, sin importar cuántos envelopes distintos se hayan intentado");
});

test("B5 Bootstrap Capa 4 — con ownerUid explícito, el enabler nunca se invoca (no se toca el disabled de un principal ajeno)", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", { planId: "plan_pos_pro", planVersion: 1, estado: "PUBLICADA" });
  const habilitados: string[] = [];
  const enabler = async (uid: string) => { habilitados.push(uid); };
  credencialEmitidaLog = [];

  const res = await ejecutarBootstrapEmpresarial(
    db as any, entradaBase, async () => {}, ownerExistente, undefined, undefined, credencialIssuerExitoso, undefined, enabler,
  );

  assert.equal(res.estado, "COMPLETED");
  assert.deepEqual(habilitados, [], "ownerUid provisto por el llamador: su disabled no es responsabilidad de Bootstrap");
});

test("B5 Bootstrap Capa 4 — rechaza si se proveen ownerUid y nombreAdministrador a la vez, o ninguno", async () => {
  const db = new Db();
  db.seed("planes/plan_pos_pro/versiones/1", { planId: "plan_pos_pro", planVersion: 1, estado: "PUBLICADA" });

  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, { ...entradaBase, nombreAdministrador: "Ana Admin" }, async () => {}, ownerExistente),
    /ENTRADA_BOOTSTRAP_INVALIDA/,
  );

  const { ownerUid, ...sinOwnerUid } = entradaBase;
  await assert.rejects(
    ejecutarBootstrapEmpresarial(db as any, sinOwnerUid as EntradaBootstrapEmpresarial, async () => {}, ownerExistente),
    /ENTRADA_BOOTSTRAP_INVALIDA/,
  );
});
