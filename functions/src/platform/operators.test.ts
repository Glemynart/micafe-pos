import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { ejecutarComandoOperador } from "./operators";

class Ref {
  constructor(readonly path: string, private db: FakeDb) {}
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  async get() { return new Snap(this.db.docs.get(this.path)); }
}
class Snap {
  constructor(private value: any) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}
class FakeDb {
  docs = new Map<string, any>();
  collection(name: string) { return new Ref(name, this); }
  async runTransaction<T>(callback: (tx: any) => Promise<T>) {
    const working = new Map(this.docs);
    let wrote = false;
    const tx = {
      get: async (ref: Ref) => {
        if (wrote) throw new Error("READ_AFTER_WRITE");
        return new Snap(working.get(ref.path));
      },
      create: (ref: Ref, data: any) => {
        wrote = true;
        if (working.has(ref.path)) throw new Error("EXISTS");
        working.set(ref.path, data);
      },
      update: (ref: Ref, data: any) => {
        wrote = true;
        if (!working.has(ref.path)) throw new Error("MISSING");
        const current = working.get(ref.path);
        const next = { ...current };
        for (const [key, value] of Object.entries(data)) {
          next[key] = value === FieldValue.delete() ? undefined : value;
        }
        working.set(ref.path, next);
      },
    };
    const result = await callback(tx);
    this.docs = working;
    return result;
  }
}

class FakeAuth {
  claims: Record<string, any> = { empresaId: "empresa-a", rol: "admin" };
  proyectados: Record<string, any> | null = null;
  revocados: string[] = [];
  async getUser(uid: string) { return { uid, customClaims: this.claims }; }
  async setCustomUserClaims(_uid: string, claims: Record<string, any>) {
    this.proyectados = claims;
    this.claims = claims;
  }
  async revokeRefreshTokens(uid: string) { this.revocados.push(uid); }
}

const entrada = {
  commandId: "cmd_operador_1",
  idempotencyKey: "idem_operador_1",
  correlationId: "corr_operador_1",
  causationId: null,
  motivoCodigo: "ALTA_OPERATIVA",
  objetivoUid: "operador_objetivo",
  facultades: ["PLATAFORMA_CONSULTAR" as const],
};

test("incorporar operador conserva claims tenant, proyecta saas y emite evidencia", async () => {
  const db = new FakeDb();
  const auth = new FakeAuth();
  const result = await ejecutarComandoOperador(
    db as never,
    "operador_actor",
    "IncorporarOperador",
    entrada,
    auth as never,
  );

  assert.equal(result.estado, "ACTIVO");
  assert.equal(result.versionAutorizacion, 1);
  assert.deepEqual(auth.proyectados, {
    empresaId: "empresa-a",
    rol: "admin",
    saas: {
      operador: true,
      versionAutorizacion: 1,
      facultades: ["PLATAFORMA_CONSULTAR"],
    },
  });
  assert.deepEqual(auth.revocados, ["operador_objetivo"]);
  assert.equal(db.docs.get("saas_operadores/operador_objetivo").creadoPor.uid, "operador_actor");
  assert.equal([...db.docs.keys()].filter((key) => key.startsWith("saas_auditoria/")).length, 1);
  assert.equal([...db.docs.keys()].filter((key) => key.startsWith("saas_auditoria_obligaciones/")).length, 1);
});

test("reintento compatible recupera resultado sin duplicar operador ni evidencia", async () => {
  const db = new FakeDb();
  const auth = new FakeAuth();
  await ejecutarComandoOperador(db as never, "operador_actor", "IncorporarOperador", entrada, auth as never);
  const second = await ejecutarComandoOperador(db as never, "operador_actor", "IncorporarOperador", entrada, auth as never);
  assert.equal(second.idempotente, true);
  assert.equal([...db.docs.keys()].filter((key) => key.startsWith("saas_operadores/")).length, 1);
  assert.equal([...db.docs.keys()].filter((key) => key.startsWith("saas_auditoria/")).length, 1);
});

test("H9 — un reintento idempotente no reproyecta claims ni vuelve a revocar refresh tokens", async () => {
  const db = new FakeDb();
  const auth = new FakeAuth();
  await ejecutarComandoOperador(db as never, "operador_actor", "IncorporarOperador", entrada, auth as never);
  assert.equal(auth.revocados.length, 1);
  const proyectadosTrasPrimero = auth.proyectados;

  const second = await ejecutarComandoOperador(db as never, "operador_actor", "IncorporarOperador", entrada, auth as never);

  assert.equal(second.idempotente, true);
  // Ni la revocación de tokens ni la proyección de claims se repiten en el reintento.
  assert.equal(auth.revocados.length, 1);
  assert.equal(auth.proyectados, proyectadosTrasPrimero);
});

test("un operador no puede modificar su propia autoridad", async () => {
  const db = new FakeDb();
  const auth = new FakeAuth();
  await assert.rejects(
    ejecutarComandoOperador(
      db as never,
      "operador_objetivo",
      "IncorporarOperador",
      entrada,
      auth as never,
    ),
    /AUTOESCALAMIENTO_DENEGADO/,
  );
  assert.equal(db.docs.has("saas_operadores/operador_objetivo"), false);
  assert.equal([...db.docs.keys()].filter((key) => key.startsWith("saas_auditoria/")).length, 1);
});

