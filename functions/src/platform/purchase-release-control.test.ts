import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { transicionarPausaCompras } from "./purchase-release-control";

type Data = Record<string, any>;

class Ref {
  constructor(readonly path: string) {}
  get id() { return this.path.split("/").at(-1)!; }
}

class Snapshot {
  constructor(private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class Transaction {
  private readonly creates: Array<[Ref, Data]> = [];
  private readonly updates: Array<[Ref, Data]> = [];
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: Ref) { return new Snapshot(this.db.docs.get(ref.path)); }
  create(ref: Ref, data: Data) {
    if (this.db.docs.has(ref.path) || this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("already-exists");
    this.creates.push([ref, data]);
  }
  update(ref: Ref, data: Data) {
    if (!this.db.docs.has(ref.path) && !this.creates.some(([pending]) => pending.path === ref.path)) throw new Error("not-found");
    this.updates.push([ref, data]);
  }
  commit() {
    for (const [ref, data] of this.creates) this.db.docs.set(ref.path, data);
    for (const [ref, data] of this.updates) this.db.docs.set(ref.path, { ...this.db.docs.get(ref.path), ...data });
  }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  collection(name: string) { return { doc: (id: string) => new Ref(`${name}/${id}`) }; }
  async runTransaction<T>(work: (tx: Transaction) => Promise<T>) {
    const tx = new Transaction(this);
    const value = await work(tx);
    tx.commit();
    return value;
  }
}

const token = { saas: { operador: true, versionAutorizacion: 3, facultades: ["RELEASE_COMPRAS_GOBERNAR"] } };
const entrada = (suffix: string, empresaId: string, destino: "ACTIVA" | "PAUSADA", expectedRevision: number, verificacionRelease?: Record<string, string>) => ({
  commandId: `release:${suffix}`,
  idempotencyKey: `release:${suffix}`,
  correlationId: `correlation:${suffix}`,
  causationId: null,
  motivoCodigo: "CORTE_RULES_APROBADO",
  empresaId,
  destino,
  expectedRevision,
  ...(verificacionRelease ? { verificacionRelease } : {}),
});

function seed(db: FakeFirestore) {
  db.docs.set("saas_operadores/op-release", {
    uid: "op-release",
    estado: "ACTIVO",
    facultades: ["RELEASE_COMPRAS_GOBERNAR"],
    versionAutorizacion: 3,
  });
  db.docs.set("empresas/empresa-a", { estado: "activa" });
  db.docs.set("empresas/empresa-b", { estado: "activa" });
}

const domain = (error: unknown, code: string) => error instanceof HttpsError && error.message === code;

test("ADR-SAAS-081: el control se inicializa, pausa y reanuda con revisión, recibo y auditoría", async () => {
  const db = new FakeFirestore(); seed(db);
  const inicial = await transicionarPausaCompras(db as never, "op-release", token, entrada("inicial", "empresa-a", "ACTIVA", 0));
  assert.deepEqual({ ...inicial, obligacionId: "redacted" }, { empresaId: "empresa-a", estado: "ACTIVA", revision: 1, obligacionId: "redacted", idempotente: false });
  const pausa = await transicionarPausaCompras(db as never, "op-release", token, entrada("pausa", "empresa-a", "PAUSADA", 1));
  assert.equal(pausa.revision, 2);
  assert.equal(db.docs.get("controles_release_compras/empresa-a")?.estado, "PAUSADA");
  assert.equal(db.docs.get("controles_release_compras/empresa-a")?.revision, 2);
  assert.ok([...db.docs.keys()].some(path => path.startsWith("saas_auditoria/")));
  const reanudada = await transicionarPausaCompras(db as never, "op-release", token, entrada("reanudar", "empresa-a", "ACTIVA", 2, {
    functionArtifactSha: "artifact-sha-1",
    rulesetHash: "rules-hash-1",
    releaseReferencia: "gate-i-release-1",
  }));
  assert.equal(reanudada.revision, 3);
  assert.equal(db.docs.get("controles_release_compras/empresa-a")?.estado, "ACTIVA");
  assert.deepEqual(db.docs.get("controles_release_compras/empresa-a")?.ultimaVerificacionRelease, {
    functionArtifactSha: "artifact-sha-1",
    rulesetHash: "rules-hash-1",
    releaseReferencia: "gate-i-release-1",
  });
});

test("ADR-SAAS-081: el mismo envelope es idempotente y una revisión obsoleta no cambia el control", async () => {
  const db = new FakeFirestore(); seed(db);
  const init = entrada("idempotente", "empresa-a", "ACTIVA", 0);
  const first = await transicionarPausaCompras(db as never, "op-release", token, init);
  const replay = await transicionarPausaCompras(db as never, "op-release", token, init);
  assert.equal(first.revision, replay.revision);
  assert.equal(replay.idempotente, true);

  await assert.rejects(
    transicionarPausaCompras(db as never, "op-release", token, entrada("stale", "empresa-a", "PAUSADA", 0)),
    error => domain(error, "CONFLICTO_REVISION_CORTE_COMPRAS"),
  );
  assert.equal(db.docs.get("controles_release_compras/empresa-a")?.estado, "ACTIVA");
  assert.equal(db.docs.get("controles_release_compras/empresa-a")?.revision, 1);
});

test("ADR-SAAS-081: un control con estado ambiguo no se repara silenciosamente", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set("controles_release_compras/empresa-a", {
    empresaId: "empresa-a",
    estado: "DESCONOCIDA",
    revision: 1,
  });

  await assert.rejects(
    transicionarPausaCompras(db as never, "op-release", token, entrada("ambiguo", "empresa-a", "PAUSADA", 1)),
    error => domain(error, "CONTROL_COMPRAS_INVALIDO"),
  );
  assert.equal(db.docs.get("controles_release_compras/empresa-a")?.estado, "DESCONOCIDA");
});

test("ADR-SAAS-081: reanudar exige atestación de los artefactos verificados", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set("controles_release_compras/empresa-a", { empresaId: "empresa-a", estado: "PAUSADA", revision: 2 });

  await assert.rejects(
    transicionarPausaCompras(db as never, "op-release", token, entrada("reanudar-sin-evidencia", "empresa-a", "ACTIVA", 2)),
    error => domain(error, "VERIFICACION_RELEASE_REQUERIDA"),
  );
  assert.equal(db.docs.get("controles_release_compras/empresa-a")?.estado, "PAUSADA");
});

test("ADR-SAAS-081: una facultad ausente no puede pausar y los tenants no se cruzan", async () => {
  const db = new FakeFirestore(); seed(db);
  db.docs.set("saas_operadores/op-release", {
    uid: "op-release",
    estado: "ACTIVO",
    facultades: ["LIFECYCLE_GOBERNAR"],
    versionAutorizacion: 3,
  });
  await assert.rejects(
    transicionarPausaCompras(db as never, "op-release", token, entrada("denegada", "empresa-a", "ACTIVA", 0)),
    /PLATFORM_ACCESS_DENIED/,
  );

  db.docs.set("saas_operadores/op-release", {
    uid: "op-release",
    estado: "ACTIVO",
    facultades: ["RELEASE_COMPRAS_GOBERNAR"],
    versionAutorizacion: 3,
  });

  await transicionarPausaCompras(db as never, "op-release", token, entrada("a", "empresa-a", "ACTIVA", 0));
  await transicionarPausaCompras(db as never, "op-release", token, entrada("b", "empresa-b", "PAUSADA", 0));
  assert.equal(db.docs.get("controles_release_compras/empresa-a")?.estado, "ACTIVA");
  assert.equal(db.docs.get("controles_release_compras/empresa-b")?.estado, "PAUSADA");
});
