import assert from "node:assert/strict";
import test from "node:test";
import { solicitarSoporte, transicionarSoporte } from "./support";

class Ref {
  constructor(readonly path: string, private readonly db: DbSoporte) {}
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  async get() { return new Snap(this.db.docs.get(this.path)); }
}

class Snap {
  constructor(private readonly value: Record<string, unknown> | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class DbSoporte {
  readonly docs = new Map<string, Record<string, unknown>>();
  collection(name: string) { return new Ref(name, this); }
  async runTransaction<T>(callback: (tx: {
    get: (ref: Ref) => Promise<Snap>;
    create: (ref: Ref, data: Record<string, unknown>) => void;
    update: (ref: Ref, data: Record<string, unknown>) => void;
  }) => Promise<T>) {
    const working = new Map(this.docs);
    const tx = {
      get: async (ref: Ref) => new Snap(working.get(ref.path)),
      create: (ref: Ref, data: Record<string, unknown>) => {
        if (working.has(ref.path)) throw new Error("EXISTS");
        working.set(ref.path, data);
      },
      update: (ref: Ref, data: Record<string, unknown>) => {
        const previous = working.get(ref.path);
        if (!previous) throw new Error("MISSING");
        working.set(ref.path, { ...previous, ...data });
      },
    };
    const result = await callback(tx);
    this.docs.clear();
    for (const [path, data] of working) this.docs.set(path, data);
    return result;
  }
}

const tokenOperador = {
  saas: { operador: true, versionAutorizacion: 1, facultades: ["PLATAFORMA_CONSULTAR"] },
};

function prepararDb() {
  const db = new DbSoporte();
  db.docs.set("saas_operadores/operador_1", {
    uid: "operador_1",
    estado: "ACTIVO",
    facultades: ["PLATAFORMA_CONSULTAR"],
    versionAutorizacion: 1,
  });
  db.docs.set("empresas/empresa_suspendida", { estado: "suspendida" });
  return db;
}

test("soporte en suspendida permanece pendiente y no crea contexto tenant ni permisos operativos", async () => {
  const db = prepararDb();
  const resultado = await solicitarSoporte(db as never, "operador_1", tokenOperador, {
    commandId: "cmd_soporte_1",
    idempotencyKey: "idem_soporte_1",
    correlationId: "corr_soporte_1",
    causationId: null,
    motivoCodigo: "DIAGNOSTICO",
    empresaObjetivoId: "empresa_suspendida",
    duracionMinutos: 15,
  });
  const sesion = db.docs.get(`saas_soporte_autorizaciones/${resultado.autorizacionId}`)!;

  assert.equal(resultado.estado, "SOLICITADA");
  assert.equal(sesion.estado, "SOLICITADA");
  assert.equal(sesion.alcanceCodigo, "DIAGNOSTICO_SOLO_LECTURA");
  assert.equal(sesion.sesionId, null);
  assert.equal(sesion.consentimientoPorUid, null);
  assert.equal("empresaId" in sesion, false);
  assert.equal("rol" in sesion, false);
});

test("soporte en suspendida no puede iniciar sin consentimiento admin vigente", async () => {
  const db = prepararDb();
  db.docs.set("saas_soporte_autorizaciones/soporte_1", {
    estado: "AUTORIZADA",
    version: 1,
    empresaObjetivoId: "empresa_suspendida",
    operadorUid: "operador_1",
    consentimientoPorUid: null,
    expiraEn: { toMillis: () => Date.now() + 60_000 },
    sesionId: null,
    alcanceCodigo: "DIAGNOSTICO_SOLO_LECTURA",
  });

  await assert.rejects(
    transicionarSoporte(db as never, { uid: "operador_1", token: tokenOperador }, "EN_SESION", {
      commandId: "cmd_soporte_2",
      idempotencyKey: "idem_soporte_2",
      correlationId: "corr_soporte_2",
      causationId: null,
      motivoCodigo: "DIAGNOSTICO",
      autorizacionId: "soporte_1",
      expectedVersion: 1,
    }),
    /CONSENTIMIENTO_NO_VIGENTE/,
  );
  assert.equal(db.docs.get("saas_soporte_autorizaciones/soporte_1")?.estado, "AUTORIZADA");
});
