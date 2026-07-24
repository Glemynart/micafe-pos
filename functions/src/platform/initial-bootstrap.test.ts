import assert from "node:assert/strict";
import test from "node:test";
import { reconciliarClaimsOperadores } from "./initial-bootstrap";

class OperadorDoc {
  constructor(readonly id: string, private readonly value: Record<string, unknown>) {}
  data() { return this.value; }
}

class ConsultaOperadores {
  private cursor: OperadorDoc | undefined;
  private pageSize = 100;
  constructor(private readonly docs: OperadorDoc[]) {}
  orderBy() { return this; }
  limit(value: number) { this.pageSize = value; return this; }
  startAfter(cursor: OperadorDoc) { this.cursor = cursor; return this; }
  async get() {
    const start = this.cursor ? this.docs.findIndex((doc) => doc.id === this.cursor!.id) + 1 : 0;
    const docs = this.docs.slice(start, start + this.pageSize);
    return { docs };
  }
}

class DbOperadores {
  constructor(private readonly docs: OperadorDoc[]) {}
  collection(name: string) {
    assert.equal(name, "saas_operadores");
    return new ConsultaOperadores(this.docs);
  }
}

class AuthOperadores {
  readonly claims = new Map<string, Record<string, unknown>>();
  readonly proyectados: string[] = [];
  async getUser(uid: string) { return { uid, customClaims: this.claims.get(uid) }; }
  async setCustomUserClaims(uid: string, claims: Record<string, unknown>) {
    this.claims.set(uid, claims);
    this.proyectados.push(uid);
  }
  async revokeRefreshTokens() {}
}

test("reconciliar claims recorre paginas posteriores a las primeras 100", async () => {
  const auth = new AuthOperadores();
  const docs = Array.from({ length: 101 }, (_, index) => {
    const uid = `operador_${String(index).padStart(3, "0")}`;
    const esperado = { operador: true, versionAutorizacion: 1, facultades: ["PLATAFORMA_CONSULTAR"] };
    auth.claims.set(uid, { saas: index === 100 ? { ...esperado, versionAutorizacion: 0 } : esperado });
    return new OperadorDoc(uid, {
      uid,
      estado: "ACTIVO",
      facultades: ["PLATAFORMA_CONSULTAR"],
      versionAutorizacion: 1,
    });
  });

  const reconciliados = await reconciliarClaimsOperadores(
    new DbOperadores(docs) as never,
    auth as never,
  );

  assert.equal(reconciliados, 1);
  assert.deepEqual(auth.proyectados, ["operador_100"]);
  assert.deepEqual(auth.claims.get("operador_100")?.saas, {
    operador: true,
    versionAutorizacion: 1,
    facultades: ["PLATAFORMA_CONSULTAR"],
  });
});
