import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { resolverModulosInicialesDelPlan } from "./capacidades-plan";

class Ref {
  constructor(public readonly path: string) {}
  collection(id: string) { return new Ref(`${this.path}/${id}`); }
  doc(id: string) { return new Ref(`${this.path}/${id}`); }
}

class Db {
  private readonly docs = new Map<string, any>();
  collection(name: string) { return new Ref(name); }
  seed(path: string, value: unknown) { this.docs.set(path, structuredClone(value)); }
  get(path: string) {
    const value = this.docs.get(path);
    return { exists: value !== undefined, data: () => structuredClone(value) };
  }
}

function dbWithGet(db: Db) {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        collection: (child: string) => ({
          doc: (childId: string) => ({ get: async () => db.get(`${name}/${id}/${child}/${childId}`) }),
        }),
        get: async () => db.get(`${name}/${id}`),
      }),
    }),
  };
}

test("la configuracion resuelve las capacidades del snapshot de la relacion vigente", async () => {
  const db = new Db();
  db.seed("suscripciones/cafe/relaciones/_vigente", { relacionVigenteId: "rel_annual" });
  db.seed("suscripciones/cafe/relaciones/rel_annual", {
    estado: "trialing",
    snapshotContrato: {
      capacidades: ["sell", "inventory", "purchases", "clientes", "finanzas", "reservas", "waste", "shifts", "cuentas_cobro"],
    },
  });
  db.seed("suscripciones/cafe", { planId: "mvp_comercial", planVersion: 1 });

  const modulos = await resolverModulosInicialesDelPlan(dbWithGet(db) as any, "cafe");

  assert.deepEqual(modulos, ["sell", "inventory", "purchases", "shifts", "waste", "cuentas_cobro", "clientes", "reservas", "finanzas"]);
});

test("la configuracion no cae silenciosamente a la raiz si el control apunta a una relacion inexistente", async () => {
  const db = new Db();
  db.seed("suscripciones/cafe/relaciones/_vigente", { relacionVigenteId: "rel_missing" });
  db.seed("suscripciones/cafe", { planId: "mvp_comercial", planVersion: 1 });

  await assert.rejects(
    resolverModulosInicialesDelPlan(dbWithGet(db) as any, "cafe"),
    (error: unknown) => error instanceof HttpsError && error.message === "RELACION_CONTRACTUAL_NOT_FOUND",
  );
});
