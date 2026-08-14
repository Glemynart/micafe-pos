import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { ejecutarComandoComercial, solicitarBootstrapEmpresarial } from "./operations";
import { ejecutarBootstrapEmpresarial } from "../bootstrap/service";
import { ejecutarComandoConfiguracion } from "../configuracion/service";
import { suspenderTrialVencido } from "../suscripciones/service";
import type { EntradaBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";
import { crearPlantillaConfiguracionRevision1 } from "../../../lib/configuracion";

// Réplica del fake usado en functions/src/bootstrap/service.test.ts, extendida con un
// mecanismo de fallo de una sola vez para simular una emisión de evidencia que falla
// después de que el hecho de dominio ya quedó confirmado de forma durable.
class Ref {
  constructor(public path: string, private db: Db) {}
  collection(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  where(campo: string, op: "==" | "!=", valor: unknown) { return new Query(this.path, [[campo, op, valor]]); }
  async get() { return new Snap(this.db.docs.get(this.path)); }
  async update(data: any) { this.db.update(this.path, data); }
  async set(data: any) { this.db.seed(this.path, data); }
}

/** Soporta las consultas por-igualdad usadas por `ejecutarComandoConfiguracion` (p. ej. la comprobación de emisiones DIAN). */
class Query {
  readonly __isQuery = true;
  constructor(public readonly coleccion: string, public readonly filtros: [string, "==" | "!=", unknown][] = []) {}
  where(campo: string, op: "==" | "!=", valor: unknown) { return new Query(this.coleccion, [...this.filtros, [campo, op, valor]]); }
  limit(_n: number) { return this; }
}

class Snap {
  constructor(private readonly v: any) {}
  get exists() { return this.v !== undefined; }
  data() { return structuredClone(this.v); }
}

class Db {
  docs = new Map<string, any>();
  private queue = Promise.resolve();
  /** Prefijo de colección cuyo próximo `create` debe fallar exactamente una vez. */
  failCreateOnce: string | null = null;
  constructor() {
    this.seed("permisos_roles/admin", { permisos: ["configuracion", "pos"] });
  }
  collection(n: string) { return new Ref(n, this); }
  seed(k: string, v: any) { this.docs.set(k, structuredClone(v)); }
  read(k: string) { return this.docs.get(k); }
  countByPrefix(prefix: string) { return [...this.docs.keys()].filter((k) => k.startsWith(prefix)).length; }
  docsByPrefix(prefix: string) { return [...this.docs.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v); }
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
    let hasWritten = false;
    const tx = {
      get: async (r: Ref | Query) => {
        if (hasWritten) throw new Error("TRANSACTION_READ_AFTER_WRITE");
        if (r instanceof Query) {
          const leerCampo = (data: any, campo: string) => campo.split(".").reduce((v, k) => v?.[k], data);
          const docs = [...w.entries()]
            .filter(([path]) => path.startsWith(`${r.coleccion}/`))
            .filter(([, data]) => r.filtros.every(([campo, op, valor]) => {
              const v = leerCampo(data, campo);
              return op === "!=" ? v !== valor && v !== undefined : v === valor;
            }))
            .map(([path, data]) => ({ id: path.split("/").pop()!, data: () => structuredClone(data) }));
          return { size: docs.length, empty: docs.length === 0, docs };
        }
        return new Snap(w.get(r.path));
      },
      create: (r: Ref, v: any) => {
        if (this.failCreateOnce && r.path.startsWith(this.failCreateOnce)) {
          this.failCreateOnce = null;
          throw new Error("SIMULATED_EVIDENCE_WRITE_FAILURE");
        }
        hasWritten = true;
        if (w.has(r.path)) throw new Error("EXISTS");
        w.set(r.path, structuredClone(v));
      },
      set: (r: Ref, v: any) => { hasWritten = true; w.set(r.path, structuredClone(v)); },
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

function entradaBackoffice(overrides: Partial<EntradaBootstrapEmpresarial> = {}) {
  // Forma exacta que envía components/backoffice/bootstrap-form.tsx a través de
  // lib/platform/client.ts#envelope(): causationId siempre null en un comando raíz.
  return {
    commandId: "cmd_backoffice_1",
    idempotencyKey: "idem_backoffice_1",
    correlationId: "corr_backoffice_1",
    causationId: null as unknown as string,
    motivoCodigo: "BACKOFFICE_BOOTSTRAP_EMPRESARIAL",
    ownerUid: "owner_backoffice_1",
    empresaId: "empresa_backoffice_1",
    nombreComercial: "Café Backoffice",
    paisFiscal: "CO",
    planId: "plan_pos_pro",
    planVersion: 1,
    trialDias: 14,
    ...overrides,
  };
}

// ADR-SAAS-013 paso H: el fake `Db` de este archivo no soporta `.where()`,
// así que el emisor real de `emitirCredencialInicial` no puede ejecutarse
// contra él (igual que en bootstrap/service.test.ts). Se inyecta un emisor
// mínimo para que las pruebas de este archivo —centradas en auditoría e
// idempotencia del comando, no en la credencial en sí— no dependan de él.
const credencialIssuerMock = async (p: { empresaId: string; uid: string }) => ({
  incorporacionId: `inc_${p.empresaId}_${p.uid}`,
  codigo: `codigo-${p.empresaId}`,
  pinTemporal: "123456",
  estado: "EMITIDA" as const,
});

function seedPlanPublicado(db: Db) {
  db.seed("planes/plan_pos_pro/versiones/1", {
    planId: "plan_pos_pro",
    planVersion: 1,
    estado: "PUBLICADA",
  });
}

test("H1 — el Backoffice crea la empresa de extremo a extremo con causationId nulo en el envelope", async () => {
  const db = new Db();
  seedPlanPublicado(db);

  const resultado = await solicitarBootstrapEmpresarial(db as never, "operador_1", entradaBackoffice(), async () => {}, async () => {}, credencialIssuerMock);

  assert.equal(resultado.estado, "COMPLETED");
  assert.equal(db.read("empresas/empresa_backoffice_1")?.estado, "trial");
  assert.equal(db.read("membresias/empresa_backoffice_1_owner_backoffice_1")?.rol, "admin");
});

test("H2 + H5 — un reintento tras fallar la emisión de evidencia recupera el mismo obligacionId y no duplica evidencia", async () => {
  const db = new Db();
  seedPlanPublicado(db);
  const entrada = entradaBackoffice({ empresaId: "empresa_backoffice_2", idempotencyKey: "idem_backoffice_2", commandId: "cmd_backoffice_2" });

  db.failCreateOnce = "saas_auditoria/";
  await assert.rejects(
    solicitarBootstrapEmpresarial(db as never, "operador_1", entrada, async () => {}, async () => {}, credencialIssuerMock),
    /SIMULATED_EVIDENCE_WRITE_FAILURE/,
  );

  // El hecho de dominio ya es durable pese al fallo de evidencia. Tanto la obligación de
  // SOLICITADO (creada en el commit del núcleo) como la de COMPLETADO (creada en la
  // transacción de finalización, que tampoco toca `saas_auditoria/`) ya nacieron; solo
  // falta su emisión — nunca intentada para COMPLETADO porque el comando entero rechazó
  // antes de llegar a esa rama.
  assert.equal(db.read("empresas/empresa_backoffice_2")?.estado, "trial");
  assert.equal(db.countByPrefix("saas_auditoria/"), 0);
  const obligacionesPendientes = db.docsByPrefix("saas_auditoria_obligaciones/").filter((o) => o.estado === "PENDIENTE");
  assert.equal(obligacionesPendientes.length, 2);
  const obligacionSolicitud = obligacionesPendientes.find((o) => o.evidencia.tipo === "BOOTSTRAP_EMPRESARIAL_SOLICITADO");
  assert.ok(obligacionSolicitud);
  const obligacionIdOriginal = obligacionSolicitud.obligacionId;

  const resultado = await solicitarBootstrapEmpresarial(db as never, "operador_1", entrada, async () => {}, async () => {}, credencialIssuerMock);

  assert.equal(resultado.estado, "COMPLETED");
  assert.equal(resultado.idempotente, true);
  assert.equal(resultado.obligacionId, obligacionIdOriginal);

  // No se crea una segunda empresa ni una segunda evidencia CONFIRMADO del mismo hecho.
  assert.equal(db.countByPrefix("empresas/"), 1);
  const evidencias = db.docsByPrefix("saas_auditoria/");
  assert.equal(evidencias.length, 2);
  assert.equal(evidencias.filter((e) => e.tipo === "BOOTSTRAP_EMPRESARIAL_SOLICITADO").length, 1);
  assert.equal(evidencias.filter((e) => e.tipo === "BOOTSTRAP_EMPRESARIAL_COMPLETADO").length, 1);
  assert.equal(evidencias.find((e) => e.tipo === "BOOTSTRAP_EMPRESARIAL_SOLICITADO")?.evidenciaId, obligacionSolicitud.evidenciaId);
  assert.ok(evidencias.every((e) => e.empresaObjetivoId === "empresa_backoffice_2"));
  assert.ok(db.docsByPrefix("saas_auditoria_obligaciones/").every((o) => o.estado === "EMITIDA"));
});

test("P0-01 crea un Trial existente mediante el comando comercial y conserva la Empresa", async () => {
  const db = new Db();
  seedPlanPublicado(db);
  db.seed("empresas/empresa_trial_existente", { empresaId: "empresa_trial_existente", estado: "activa", revision: 1 });
  const entrada = {
    ...entradaBackoffice({
      empresaId: "empresa_trial_existente",
      planId: "plan_pos_pro",
      planVersion: 1,
      trialDias: 30,
      commandId: "cmd_trial_existente",
      idempotencyKey: "idem_trial_existente",
      correlationId: "corr_trial_existente",
      motivoCodigo: "BACKOFFICE_SUSCRIPCION_TRIAL",
    }),
    expectedRevision: 1,
  };

  const relojOriginal = Date.now;
  try {
    Date.now = () => Date.parse("2026-08-02T12:00:00.000Z");
    const resultado = await ejecutarComandoComercial(db as never, "operador_1", "CrearSuscripcionTrial", entrada as any);

    assert.equal(resultado.idempotente, false);
    const suscripcion = db.read("suscripciones/empresa_trial_existente");
    assert.equal(suscripcion?.empresaId, "empresa_trial_existente");
    assert.equal(suscripcion?.planId, "plan_pos_pro");
    assert.equal(suscripcion?.planVersion, 1);
    assert.equal(suscripcion?.estado, "trialing");
    assert.equal(suscripcion?.trialInicio, "2026-08-02");
    assert.equal(suscripcion?.trialFin, "2026-09-01");
    assert.equal(suscripcion?.revision, 1);
    assert.equal(suscripcion?.schemaVersion, 1);
    assert.equal(db.read("empresas/empresa_trial_existente")?.estado, "activa");
    assert.ok(db.docsByPrefix("saas_auditoria_obligaciones/").some(o => o.estado === "EMITIDA"));
  } finally {
    Date.now = relojOriginal;
  }
});

test("MT-U9 confirma el pago anual solo por el comando comercial y audita el periodo server-side", async () => {
  const db = new Db();
  db.seed("empresas/empresa_pago", { empresaId: "empresa_pago", estado: "suspendida", revision: 4 });
  db.seed("suscripciones/empresa_pago", {
    empresaId: "empresa_pago", planId: "mvp_comercial", planVersion: 2, estado: "suspended", revision: 7, schemaVersion: 1,
    snapshotContrato: {
      schemaVersion: 1, planId: "mvp_comercial", planVersion: 2, codigoPlan: "MVP_COMERCIAL", periodicidad: "ANUAL",
      precio: { importe: 1800000, moneda: "COP" }, capacidades: ["sell"], limites: {}, sedeConceptual: { cantidad: 1 }, fiscalidad: null,
      vigencia: { inicio: "2026-07-01", fin: "2026-07-31" },
    },
  });
  const resultado = await ejecutarComandoComercial(db as never, "operador_1", "ConfirmarPagoAnualSuscripcion", {
    commandId: "cmd_pago_anual_1", idempotencyKey: "idem_pago_anual_1", correlationId: "corr_pago_anual_1",
    causationId: null, motivoCodigo: "BACKOFFICE_PAGO_ANUAL", empresaId: "empresa_pago", expectedRevision: 7,
    referenciaPago: "REC-OPERADOR-001",
  });
  assert.equal((resultado as any).idempotente, false);
  assert.equal(db.read("suscripciones/empresa_pago")?.estado, "active");
  assert.equal(db.read("empresas/empresa_pago")?.estado, "activa");
  assert.equal(db.read("pagos_saas/" + (resultado as any).reciboId)?.importe, 1800000);
  assert.ok(db.docsByPrefix("saas_auditoria/").some((e) => e.tipo === "SUSCRIPCION_PAGO_ANUAL_CONFIRMADO"));
});

test("H5 — BOOTSTRAP_EMPRESARIAL_COMPLETADO referencia el agregado de provisionamiento, con actor de sistema", async () => {
  const db = new Db();
  seedPlanPublicado(db);
  const entrada = entradaBackoffice({ empresaId: "empresa_backoffice_3", idempotencyKey: "idem_backoffice_3", commandId: "cmd_backoffice_3" });

  await solicitarBootstrapEmpresarial(db as never, "operador_1", entrada, async () => {}, async () => {}, credencialIssuerMock);

  const completado = db.docsByPrefix("saas_auditoria/").find((e) => e.tipo === "BOOTSTRAP_EMPRESARIAL_COMPLETADO");
  assert.ok(completado);
  assert.equal(completado.agregado.tipo, "PROVISIONAMIENTO_EMPRESARIAL");
  assert.equal(completado.actor.tipo, "SISTEMA");
  assert.equal(completado.actor.uid, null);
  assert.equal(completado.facultad, null);
  assert.equal(completado.empresaObjetivoId, "empresa_backoffice_3");
});

test("H2 — un comando comercial reutiliza el obligacionId original tras un reintento", async () => {
  const db = new Db();
  db.seed("planes/plan_reintento", { planId: "plan_reintento", codigo: "PLAN_REINTENTO", revision: 1, versionActual: 1 });
  db.seed("planes/plan_reintento/versiones/1", {
    planId: "plan_reintento", planVersion: 1, estado: "BORRADOR", codigo: "PLAN_REINTENTO",
    capacidades: ["pos"], limites: {}, periodicidad: "MENSUAL", grandfathered: false, revision: 1, schemaVersion: 1,
  });
  const entrada = {
    commandId: "cmd_comercial_1",
    idempotencyKey: "idem_comercial_1",
    correlationId: "corr_comercial_1",
    causationId: null as unknown as string,
    motivoCodigo: "BACKOFFICE_PLAN_PUBLICAR",
    planId: "plan_reintento",
    planVersion: 1,
    expectedRevision: 1,
  };

  db.failCreateOnce = "saas_auditoria/";
  await assert.rejects(
    ejecutarComandoComercial(db as never, "operador_1", "PublicarPlan", entrada),
    /SIMULATED_EVIDENCE_WRITE_FAILURE/,
  );
  assert.equal(db.read("planes/plan_reintento/versiones/1")?.estado, "PUBLICADA");
  const pendiente = db.docsByPrefix("saas_auditoria_obligaciones/").find((o) => o.estado === "PENDIENTE");
  assert.ok(pendiente);

  const resultado = await ejecutarComandoComercial(db as never, "operador_1", "PublicarPlan", entrada);

  assert.equal((resultado as any).idempotente, true);
  assert.equal((resultado as any).obligacionId, pendiente.obligacionId);
  const evidencias = db.docsByPrefix("saas_auditoria/");
  assert.equal(evidencias.length, 1);
  assert.equal(evidencias[0].tipo, "PLAN_VERSION_PUBLICADA");
});

test("M-1 — un provisionamiento COMPLETED sin obligacionCompletadoId (ruta de autoservicio) no revienta al solicitarse por plataforma", async () => {
  const db = new Db();
  seedPlanPublicado(db);
  // La ruta de autoservicio (bootstrapEmpresarialCallable) recibe causationId real del
  // cliente, no el envelope de plataforma con causationId nulo.
  const entrada = entradaBackoffice({ empresaId: "empresa_m1", idempotencyKey: "idem_m1", commandId: "cmd_m1", causationId: "cause_m1" });

  // Ruta de autoservicio (bootstrapEmpresarialCallable): sin observador de plataforma,
  // por lo que el provisionamiento completa con obligacionCompletadoId: null.
  const directo = await ejecutarBootstrapEmpresarial(
    db as never, entrada, async () => {}, async () => {}, undefined, undefined, credencialIssuerMock,
  );
  assert.equal(directo.estado, "COMPLETED");
  assert.equal(directo.obligacionCompletadoId, null);

  // La misma clave de idempotencia, ahora solicitada por un operador de plataforma, no
  // debe fallar ni intentar emitir una obligación que nunca existió.
  const resultado = await solicitarBootstrapEmpresarial(
    db as never,
    "operador_1",
    entrada,
    async () => {},
    async () => {},
    credencialIssuerMock,
  );

  assert.equal(resultado.estado, "COMPLETED");
  assert.equal(resultado.idempotente, true);
  assert.equal(db.countByPrefix("saas_auditoria/"), 0);
});

test("M-2 — dos transacciones de finalización concurrentes sobre el mismo provisionamiento no duplican la obligación", async () => {
  const db = new Db();
  seedPlanPublicado(db);
  const entrada = entradaBackoffice({ empresaId: "empresa_m2", idempotencyKey: "idem_m2", commandId: "cmd_m2", causationId: "cause_m2" });

  let invocacionesObservador = 0;
  const completionObserver = (tx: any) => {
    invocacionesObservador += 1;
    const evidenciaId = `evidencia_completado_${invocacionesObservador}`;
    tx.create(db.collection("saas_auditoria_obligaciones").doc(evidenciaId), {
      schemaVersion: 1, obligacionId: evidenciaId, estado: "PENDIENTE", evidenciaId,
      dedupeKey: evidenciaId, evidencia: { tipo: "BOOTSTRAP_EMPRESARIAL_COMPLETADO" }, creadaEn: Date.now(),
      emitidaEn: null, intentos: 0, ultimoErrorCodigo: null,
    });
    return { obligacionId: evidenciaId };
  };

  // Llevar el provisionamiento hasta COMPLETED una vez para obtener un doc válido
  // (idempotencyKey/fingerprint correctos), luego retrocederlo a CLAIMS_ISSUED sin
  // obligacionCompletadoId: así se simulan dos intentos que aún NO comprometieron el
  // cierre, el escenario real donde la carrera puede ocurrir (p. ej. dos reintentos del
  // mismo comando de plataforma tras una caída antes de la finalización).
  await ejecutarBootstrapEmpresarial(
    db as never, entrada, async () => {}, async () => {}, undefined, completionObserver, credencialIssuerMock,
  );
  const provPath = [...db.docs.keys()].find((k) => k.startsWith("provisionamientos_empresariales/"))!;
  const provCompletado = db.read(provPath);
  db.seed(provPath, { ...provCompletado, estado: "CLAIMS_ISSUED", ultimoPasoConfirmado: "CLAIMS_ISSUED", obligacionCompletadoId: null });
  const invocacionesAntesDeLaCarrera = invocacionesObservador;

  const [r1, r2] = await Promise.all([
    ejecutarBootstrapEmpresarial(db as never, entrada, async () => {}, async () => {}, undefined, completionObserver, credencialIssuerMock),
    ejecutarBootstrapEmpresarial(db as never, entrada, async () => {}, async () => {}, undefined, completionObserver, credencialIssuerMock),
  ]);

  assert.equal(r1.estado, "COMPLETED");
  assert.equal(r2.estado, "COMPLETED");
  assert.equal(
    invocacionesObservador - invocacionesAntesDeLaCarrera,
    1,
    "el observador de finalización solo debe invocarse una vez pese a dos intentos concurrentes",
  );
  assert.equal(r1.obligacionCompletadoId, r2.obligacionCompletadoId);
  assert.ok(r1.obligacionCompletadoId);
  // Solo existe un documento de obligación para el obligacionCompletadoId ganador: la
  // rama que perdió la carrera no creó una obligación propia, solo leyó y reutilizó.
  assert.equal(db.docsByPrefix(`saas_auditoria_obligaciones/${r1.obligacionCompletadoId}`).length, 1);
});

test("ActualizarDatosAdministrativosEmpresa (ADR-SAAS-013 §5.3) — renombra por revisión, audita, no toca paisFiscal ni estado", async () => {
  const db = new Db();
  db.seed("empresas/empresa_rename", { estado: "activa", nombre: "Mi Café Especial", nombreComercial: "Mi Café Especial", paisFiscal: "CO", revision: 3 });
  // La propagación a `configuraciones/{empresaId}` (ADR-SAAS-013 §5.3) reutiliza
  // ejecutarComandoConfiguracion — necesita una configuración ya inicializada.
  db.seed("configuraciones/empresa_rename", crearPlantillaConfiguracionRevision1({
    empresaId: "empresa_rename", nombreComercial: "Mi Café Especial",
    creadaEn: "2026-01-01", actualizadaEn: "2026-01-01",
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BOOTSTRAP", commandId: "cmd", correlationId: "corr" },
  }));
  const entrada = {
    commandId: "cmd_rename_1",
    idempotencyKey: "idem_rename_1",
    correlationId: "corr_rename_1",
    causationId: null as unknown as string,
    motivoCodigo: "BACKOFFICE_RENOMBRAR_EMPRESA",
    empresaId: "empresa_rename",
    nombreComercial: "Café Atrato",
    expectedRevision: 3,
  };

  const resultado = await ejecutarComandoComercial(db as never, "operador_1", "ActualizarDatosAdministrativosEmpresa", entrada);

  assert.equal((resultado as any).nombreComercial, "Café Atrato");
  assert.equal((resultado as any).revision, 4);
  const empresa = db.read("empresas/empresa_rename");
  assert.equal(empresa.nombre, "Café Atrato");
  assert.equal(empresa.nombreComercial, "Café Atrato");
  assert.equal(empresa.paisFiscal, "CO", "paisFiscal no debe tocarse — excluido explícitamente por el ADR");
  assert.equal(empresa.estado, "activa", "estado pertenece a lifecycle, no a este comando");
  assert.equal(empresa.revision, 4);

  const evidencia = db.docsByPrefix("saas_auditoria/").find((e) => e.tipo === "EMPRESA_DATOS_ADMINISTRATIVOS_ACTUALIZADOS");
  assert.ok(evidencia, "debe auditarse en la plataforma");
  assert.equal(evidencia.facultad, "LIFECYCLE_GOBERNAR");

  const configuracion = db.read("configuraciones/empresa_rename");
  assert.equal(configuracion.identidadFiscal.nombreComercial, "Café Atrato", "debe propagarse a configuraciones/{empresaId}, no solo a empresas");
  assert.equal(configuracion.revision, 2, "el comando de configuración compuesto también avanza su propia revisión");
  assert.equal(configuracion.ultimaMutacion.origen, "PLATFORM");
  assert.equal(configuracion.ultimaMutacion.actorTipo, "PLATFORM");
});

test("ActualizarDatosAdministrativosEmpresa — corrige el nombre de una empresa suspendida (conservación, no operatividad, es la barrera de plataforma)", async () => {
  const db = new Db();
  db.seed("empresas/empresa_suspendida", { estado: "suspendida", nombre: "Café Viejo", nombreComercial: "Café Viejo", paisFiscal: "CO", revision: 2 });
  db.seed("configuraciones/empresa_suspendida", crearPlantillaConfiguracionRevision1({
    empresaId: "empresa_suspendida", nombreComercial: "Café Viejo",
    creadaEn: "2026-01-01", actualizadaEn: "2026-01-01",
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BOOTSTRAP", commandId: "cmd", correlationId: "corr" },
  }));
  const entrada = {
    commandId: "cmd_rename_susp",
    idempotencyKey: "idem_rename_susp",
    correlationId: "corr_rename_susp",
    causationId: null as unknown as string,
    motivoCodigo: "BACKOFFICE_RENOMBRAR_EMPRESA",
    empresaId: "empresa_suspendida",
    nombreComercial: "Café Corregido",
    expectedRevision: 2,
  };

  const resultado = await ejecutarComandoComercial(db as never, "operador_1", "ActualizarDatosAdministrativosEmpresa", entrada);

  assert.equal((resultado as any).nombreComercial, "Café Corregido");
  assert.equal(db.read("empresas/empresa_suspendida").estado, "suspendida", "la corrección no cambia el lifecycle");
  assert.equal(db.read("configuraciones/empresa_suspendida").identidadFiscal.nombreComercial, "Café Corregido");
});

test("ActualizarDatosAdministrativosEmpresa — sigue bloqueado para una empresa archivada (frontera de conservación)", async () => {
  const db = new Db();
  db.seed("empresas/empresa_archivada", { estado: "archivada", nombre: "Café Cerrado", nombreComercial: "Café Cerrado", paisFiscal: "CO", revision: 4 });
  db.seed("configuraciones/empresa_archivada", crearPlantillaConfiguracionRevision1({
    empresaId: "empresa_archivada", nombreComercial: "Café Cerrado",
    creadaEn: "2026-01-01", actualizadaEn: "2026-01-01",
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BOOTSTRAP", commandId: "cmd", correlationId: "corr" },
  }));
  const entrada = {
    commandId: "cmd_rename_arch",
    idempotencyKey: "idem_rename_arch",
    correlationId: "corr_rename_arch",
    causationId: null as unknown as string,
    motivoCodigo: "BACKOFFICE_RENOMBRAR_EMPRESA",
    empresaId: "empresa_archivada",
    nombreComercial: "Café Nuevo",
    expectedRevision: 4,
  };

  await assert.rejects(
    ejecutarComandoComercial(db as never, "operador_1", "ActualizarDatosAdministrativosEmpresa", entrada),
    /Lifecycle no escribible/,
  );
  assert.equal(db.read("empresas/empresa_archivada").nombreComercial, "Café Cerrado");
});

test("ActualizarDatosAdministrativosEmpresa — si el tenant ya emitió documentos DIAN, la precondición fiscal de configuración bloquea el renombre y no escribe nada", async () => {
  const db = new Db();
  db.seed("empresas/empresa_dian", { estado: "activa", nombre: "Café Sur", nombreComercial: "Café Sur", paisFiscal: "CO", revision: 1 });
  db.seed("configuraciones/empresa_dian", crearPlantillaConfiguracionRevision1({
    empresaId: "empresa_dian", nombreComercial: "Café Sur",
    creadaEn: "2026-01-01", actualizadaEn: "2026-01-01",
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BOOTSTRAP", commandId: "cmd", correlationId: "corr" },
  }));
  db.seed("ventas/venta_1", { empresaId: "empresa_dian", dian: { emitidoEn: "2026-02-01" } });
  const entrada = {
    commandId: "cmd_rename_dian",
    idempotencyKey: "idem_rename_dian",
    correlationId: "corr_rename_dian",
    causationId: null as unknown as string,
    motivoCodigo: "BACKOFFICE_RENOMBRAR_EMPRESA",
    empresaId: "empresa_dian",
    nombreComercial: "Café Nuevo Nombre",
    expectedRevision: 1,
  };

  await assert.rejects(
    ejecutarComandoComercial(db as never, "operador_1", "ActualizarDatosAdministrativosEmpresa", entrada),
    /IDENTIDAD_FISCAL_BLOQUEADA_POR_EMISION/,
  );
  assert.equal(db.read("empresas/empresa_dian").nombreComercial, "Café Sur", "empresas no debe cambiar si configuraciones rechaza la precondición fiscal");
  assert.equal(db.read("configuraciones/empresa_dian").identidadFiscal.nombreComercial, "Café Sur");
});

test("ActualizarDatosAdministrativosEmpresa rechaza por conflicto de revisión, sin escribir nada", async () => {
  const db = new Db();
  db.seed("empresas/empresa_rename2", { estado: "activa", nombre: "X", nombreComercial: "X", paisFiscal: "CO", revision: 5 });
  const entrada = {
    commandId: "cmd_rename_2",
    idempotencyKey: "idem_rename_2",
    correlationId: "corr_rename_2",
    causationId: null as unknown as string,
    motivoCodigo: "BACKOFFICE_RENOMBRAR_EMPRESA",
    empresaId: "empresa_rename2",
    nombreComercial: "Y",
    expectedRevision: 2,
  };

  await assert.rejects(
    ejecutarComandoComercial(db as never, "operador_1", "ActualizarDatosAdministrativosEmpresa", entrada),
    /EMPRESA_REVISION_CONFLICT/,
  );
  assert.equal(db.read("empresas/empresa_rename2").nombre, "X");
});
test("P0-01 recupera la auditoría pendiente del Trial sin duplicar la suscripción", async () => {
  const db = new Db();
  seedPlanPublicado(db);
  db.seed("empresas/empresa_trial_auditoria", { empresaId: "empresa_trial_auditoria", estado: "activa", revision: 1 });
  const entrada = {
    ...entradaBackoffice({
      empresaId: "empresa_trial_auditoria",
      planId: "plan_pos_pro",
      planVersion: 1,
      trialDias: 30,
      commandId: "cmd_trial_auditoria",
      idempotencyKey: "idem_trial_auditoria",
      correlationId: "corr_trial_auditoria",
      motivoCodigo: "BACKOFFICE_SUSCRIPCION_TRIAL",
    }),
    expectedRevision: 1,
  };

  db.failCreateOnce = "saas_auditoria/";
  await assert.rejects(
    ejecutarComandoComercial(db as never, "operador_1", "CrearSuscripcionTrial", entrada as any),
    /SIMULATED_EVIDENCE_WRITE_FAILURE/,
  );

  const suscripcionInicial = db.read("suscripciones/empresa_trial_auditoria");
  const obligacionPendiente = db.docsByPrefix("saas_auditoria_obligaciones/").find((o) => o.estado === "PENDIENTE");
  assert.ok(suscripcionInicial);
  assert.ok(obligacionPendiente);
  assert.equal(db.countByPrefix("saas_auditoria/"), 0);

  const reintento = await ejecutarComandoComercial(db as never, "operador_1", "CrearSuscripcionTrial", entrada as any);

  assert.equal(reintento.idempotente, true);
  assert.equal(reintento.obligacionId, obligacionPendiente.obligacionId);
  assert.deepEqual(db.read("suscripciones/empresa_trial_auditoria"), suscripcionInicial);
  assert.equal(db.docsByPrefix("saas_auditoria/").filter((e) => e.tipo === "SUSCRIPCION_CREADA").length, 1);
  assert.equal(db.docsByPrefix("saas_auditoria_obligaciones/").filter((o) => o.estado === "EMITIDA").length, 1);
});

test("G-SAAS-02 completa la secuencia post-vencimiento sin reescribir el contrato raiz historico", async () => {
  const db = new Db();
  const empresaId = "cafe_atrato_transition";
  const capacidadesAnuales = ["sell", "inventory", "purchases", "clientes", "finanzas", "reservas", "waste", "shifts", "cuentas_cobro"];
  const suscripcionHistorica = {
    empresaId,
    planId: "mvp_comercial",
    planVersion: 1,
    estado: "trialing",
    trialInicio: "2026-08-03",
    trialFin: "2026-09-02",
    revision: 1,
    schemaVersion: 1,
  };
  const configuracionHistorica = crearPlantillaConfiguracionRevision1({
    empresaId,
    nombreComercial: "Cafe Atrato",
    creadaEn: {},
    actualizadaEn: {},
    modulosIniciales: ["sell", "inventory", "purchases", "clientes", "finanzas", "reservas", "waste"],
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "system", origen: "BOOTSTRAP", commandId: "cmd_init", correlationId: "corr_init" },
  });
  db.seed(`empresas/${empresaId}`, { empresaId, estado: "trial", paisFiscal: "CO", revision: 1 });
  db.seed(`suscripciones/${empresaId}`, suscripcionHistorica);
  db.seed(`configuraciones/${empresaId}`, configuracionHistorica);
  db.seed("planes/mvp_comercial/versiones/2", {
    planId: "mvp_comercial",
    codigo: "MVP_COMERCIAL",
    planVersion: 2,
    estado: "PUBLICADA",
    capacidades: capacidadesAnuales,
    limites: {},
    periodicidad: "ANUAL",
    precio: { importe: 1800000, moneda: "COP" },
    grandfathered: false,
    revision: 2,
    schemaVersion: 1,
  });

  const relojOriginal = globalThis.Date;
  try {
    globalThis.Date = class FechaFija extends relojOriginal {
      constructor(...args: any[]) {
        super(args.length === 0 ? "2026-09-03T12:00:00.000Z" : args[0]);
      }
    } as DateConstructor;

    const vencimiento = await suspenderTrialVencido(db as never, empresaId, "2026-09-02");
    assert.equal(vencimiento.idempotente, false);
    assert.equal(db.read(`suscripciones/${empresaId}`)?.estado, "suspended");
    assert.equal(db.read(`empresas/${empresaId}`)?.estado, "suspendida");

    const relacion = await ejecutarComandoComercial(db as never, "operador_1", "CrearRelacionContractualTrial", {
      commandId: "cmd_cafe_relation",
      idempotencyKey: "idem_cafe_relation",
      correlationId: "corr_cafe_relation",
      causationId: null,
      motivoCodigo: "G_SAAS_02_TRANSICION_ANUAL",
      empresaId,
      planId: "mvp_comercial",
      planVersion: 2,
      relacionAnteriorId: "legacy_mensual_v1",
      expectedRevision: 2,
    });
    const relacionCreada = db.read(`suscripciones/${empresaId}/relaciones/${relacion.relacionId}`);
    assert.equal(relacionCreada.estado, "trialing");
    assert.equal(relacionCreada.relacionAnteriorId, "legacy_mensual_v1");
    assert.equal(relacionCreada.snapshotContrato.precio.importe, 1800000);
    assert.equal(relacionCreada.snapshotContrato.precio.moneda, "COP");
    assert.deepEqual(relacionCreada.snapshotContrato.capacidades, capacidadesAnuales);
    assert.equal(relacionCreada.trialInicio, "2026-09-03");
    assert.equal(relacionCreada.trialFin, "2026-10-03");

    const reactivacion = await ejecutarComandoComercial(db as never, "operador_1", "TransicionarEmpresa", {
      commandId: "cmd_cafe_reactivate",
      idempotencyKey: "idem_cafe_reactivate",
      correlationId: "corr_cafe_reactivate",
      causationId: null,
      motivoCodigo: "G_SAAS_02_TRANSICION_ANUAL",
      empresaId,
      destino: "activa",
      expectedRevision: 2,
    });
    assert.equal(reactivacion.idempotente, false);
    assert.equal(db.read(`empresas/${empresaId}`)?.estado, "activa");
    assert.equal(db.read(`empresas/${empresaId}`)?.revision, 3);

    const configuracion = await ejecutarComandoConfiguracion(db as never, {
      comando: "ActualizarConfiguracionEmpresa",
      expectedRevision: 1,
      idempotencyKey: "idem_cafe_config",
      commandId: "cmd_cafe_config",
      correlationId: "corr_cafe_config",
      motivo: "G_SAAS_02_TRANSICION_ANUAL",
      operaciones: [{ tipo: "SET", ruta: "modulos.habilitados", valor: capacidadesAnuales }],
    }, {
      empresaId,
      actorId: "operador_1",
      origen: "PLATFORM",
      paisFiscal: "CO",
      modulosPermitidos: capacidadesAnuales,
      metodosPagoPermitidos: ["efectivo", "transferencia", "cuenta_cobro", "mixto"],
    });
    assert.equal(configuracion.idempotente, false);
    assert.deepEqual(db.read(`configuraciones/${empresaId}`)?.modulos.habilitados, capacidadesAnuales);

    const raizDespues = { ...db.read(`suscripciones/${empresaId}`) };
    delete raizDespues.actualizadaEn;
    assert.deepEqual(raizDespues, {
      ...suscripcionHistorica,
      estado: "suspended",
      revision: 2,
    });
    assert.equal(db.docsByPrefix(`suscripciones/${empresaId}/relaciones/`).filter((value) => value.relacionId).length, 1);
    const evidencias = db.docsByPrefix("saas_auditoria/").filter((e) => e.empresaObjetivoId === empresaId);
    assert.ok(evidencias.some((e) => e.tipo === "SUSCRIPCION_RELACION_CONTRACTUAL_CREADA"));
    assert.ok(evidencias.some((e) => e.tipo === "EMPRESA_ACTIVADA"));
  } finally {
    globalThis.Date = relojOriginal;
  }
});
