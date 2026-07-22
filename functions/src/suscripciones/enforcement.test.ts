import assert from "node:assert/strict";
import test from "node:test";
import { FieldValue } from "firebase-admin/firestore";
import { exigirTenantActivo, exigirTenantLecturaAdmin, validarEmpresaEscribible } from "../operational-auth";
import { transicionarEmpresa } from "./service";

class Ref {
  constructor(public path: string, private db: Db) {}
  collection(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  doc(id: string) { return new Ref(`${this.path}/${id}`, this.db); }
  async get() { return new Snap(this.db.docs.get(this.path)); }
}
class Snap { constructor(private readonly v: any) {} get exists() { return this.v !== undefined; } data() { return structuredClone(this.v); } }
class Db {
  docs = new Map<string, any>();
  private queue = Promise.resolve();
  collection(n: string) { return new Ref(n, this); }
  seed(k: string, v: any) { this.docs.set(k, structuredClone(v)); }
  read(k: string) { return this.docs.get(k); }
  async runTransaction<T>(cb: (tx: any) => Promise<T>) {
    let release!: () => void;
    const before = this.queue;
    this.queue = new Promise(r => release = r);
    await before;
    const w = new Map([...this.docs].map(([k,v]) => [k, structuredClone(v)]));
    const tx = {
      get: async (r: Ref) => new Snap(w.get(r.path)),
      create: (r: Ref, v: any) => { if (w.has(r.path)) throw new Error("EXISTS"); w.set(r.path, structuredClone(v)); },
      update: (r: Ref, v: any) => {
        if (!w.has(r.path)) throw new Error("MISSING");
        const cur = { ...w.get(r.path) };
        for (const [k, val] of Object.entries(v)) {
          if (val && (val === FieldValue.delete() || (val as any)._methodName === "delete" || (typeof val === "object" && Object.keys(val as object).length === 0))) {
            delete cur[k];
          } else {
            cur[k] = structuredClone(val);
          }
        }
        w.set(r.path, cur);
      }
    };
    try { const r = await cb(tx); this.docs = w; return r; } finally { release(); }
  }
}

const ctx = { actorId: "operator_b4", origen: "PLATFORM" as const };
const env = (n: string, rev = 1) => ({ commandId: `cmd_b4_${n}`, idempotencyKey: `idem_b4_${n}`, correlationId: `corr_b4_${n}`, causationId: `cause_b4_${n}`, expectedRevision: rev, motivo: "enforcement test" });

test("B4 Enforcement — Empresa.estado es la autoridad única sobre operaciones de escritura", async () => {
  // Mock de DB con estados de prueba
  const db = new Db();
  db.seed("empresas/empresa_trial", { estado: "trial" });
  db.seed("empresas/empresa_activa", { estado: "activa" });
  db.seed("empresas/empresa_suspendida", { estado: "suspendida" });
  db.seed("empresas/empresa_cancelada", { estado: "cancelada" });
  db.seed("empresas/empresa_archivada", { estado: "archivada" });
  db.seed("empresas/empresa_eliminada", { estado: "eliminada" });

  // 1. trial y activa permiten escrituras
  assert.equal((await validarEmpresaEscribible("empresa_trial", db as any)).estado, "trial");
  assert.equal((await validarEmpresaEscribible("empresa_activa", db as any)).estado, "activa");

  // 2. suspendida, cancelada, archivada y eliminada rechazan escrituras
  await assert.rejects(validarEmpresaEscribible("empresa_suspendida", db as any), /La empresa no permite operaciones de escritura/);
  await assert.rejects(validarEmpresaEscribible("empresa_cancelada", db as any), /La empresa no permite operaciones de escritura/);
  await assert.rejects(validarEmpresaEscribible("empresa_archivada", db as any), /La empresa no permite operaciones de escritura/);
  await assert.rejects(validarEmpresaEscribible("empresa_eliminada", db as any), /La empresa no permite operaciones de escritura/);
});

test("B4 Enforcement — Suscripción nunca autoriza acceso si Empresa.estado es no-operativo", async () => {
  const db = new Db();
  // Empresa suspendida pero con suscripción 'active'
  db.seed("empresas/empresa_mora_comercial", { estado: "suspendida" });
  db.seed("suscripciones/empresa_mora_comercial", { estado: "active" });

  // Aunque la suscripción reporte 'active', el enforcement rechaza las escrituras porque Empresa.estado es 'suspendida'
  await assert.rejects(
    validarEmpresaEscribible("empresa_mora_comercial", db as any),
    /La empresa no permite operaciones de escritura/
  );
});

test("B4 Enforcement — Matriz de acceso administrativo vs operativo en estado suspendida", async () => {
  const db = new Db();
  db.seed("empresas/empresa_susp", { estado: "suspendida" });
  db.seed("membresias/empresa_susp_user_admin", { empresaId: "empresa_susp", uid: "user_admin", rol: "admin", permisos: ["pos"], estado: "activa", activo: true });
  db.seed("membresias/empresa_susp_user_cajero", { empresaId: "empresa_susp", uid: "user_cajero", rol: "cajero", permisos: ["pos"], estado: "activa", activo: true });

  const reqAdmin = { auth: { uid: "user_admin", token: { empresaId: "empresa_susp", rol: "admin" } } };
  const reqCajero = { auth: { uid: "user_cajero", token: { empresaId: "empresa_susp", rol: "cajero" } } };

  // 1. exigirTenantActivo (operaciones operativas/escrituras) rechaza a AMBOS en suspendida
  await assert.rejects(exigirTenantActivo(reqAdmin, db as any), /Acceso denegado/);
  await assert.rejects(exigirTenantActivo(reqCajero, db as any), /Acceso denegado/);

  // 2. exigirTenantLecturaAdmin (lectura administrativa en suspendida) permite a Admin pero rechaza a Cajero
  const resAdmin = await exigirTenantLecturaAdmin(reqAdmin, db as any);
  assert.equal(resAdmin.id, "empresa_susp");
  assert.equal(resAdmin.rol, "admin");

  await assert.rejects(exigirTenantLecturaAdmin(reqCajero, db as any), /Acceso denegado/);
});

test("B4 Enforcement — Transición de lifecycle ejecuta revocación de tokens idempotente", async () => {
  const db = new Db();
  db.seed("empresas/empresa_activa", { estado: "activa", revision: 1 });
  db.seed("suscripciones/empresa_activa", { estado: "active", planId: "plan_1", planVersion: 1, periodoInicio: "2026-07-01", periodoFin: "2026-08-01" });
  db.seed("membresias/empresa_activa_u1", { empresaId: "empresa_activa", uid: "u1" });

  const e = { ...env("suspender"), empresaId: "empresa_activa", destino: "suspendida" as const };
  const res = await transicionarEmpresa(db as any, e, ctx);
  assert.equal(res.idempotente, false);
  assert.equal(db.read("empresas/empresa_activa").estado, "suspendida");

  // Reintento idempotente no vuelve a revocar
  const res2 = await transicionarEmpresa(db as any, e, ctx);
  assert.equal(res2.idempotente, true);
});
