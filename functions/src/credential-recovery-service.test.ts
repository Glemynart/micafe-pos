import assert from "node:assert/strict";
import test from "node:test";
import { hashearPin } from "./pin-security";
import {
  activarRestablecimientoCredencial,
  solicitarRestablecimientoCredencial,
} from "./credential-recovery-service";

class Ref {
  constructor(public readonly path: string) {}
  get id() { return this.path.split("/").pop()!; }
  collection(id: string) { return new Ref(`${this.path}/${id}`); }
  doc(id: string) { return new Ref(`${this.path}/${id}`); }
}

class Snap {
  constructor(public readonly id: string, private readonly value: any) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
  get(field: string) { return this.value?.[field]; }
}

class Query {
  readonly __isQuery = true;
  constructor(
    private readonly collectionName: string,
    private readonly docs: () => Map<string, any>,
    private readonly filters: [string, unknown][] = [],
    private readonly max: number | null = null,
  ) {}
  where(field: string, _operator: "==", value: unknown) {
    return new Query(this.collectionName, this.docs, [...this.filters, [field, value]], this.max);
  }
  limit(max: number) { return new Query(this.collectionName, this.docs, this.filters, max); }
  private read(data: any, path: string): unknown {
    return path.split(".").reduce((value, key) => value?.[key], data);
  }
  execute() {
    const matches = [...this.docs().entries()]
      .filter(([path]) => path.startsWith(`${this.collectionName}/`))
      .filter(([, data]) => this.filters.every(([field, value]) => this.read(data, field) === value))
      .slice(0, this.max ?? Number.MAX_SAFE_INTEGER)
      .map(([path, data]) => new Snap(path.split("/").pop()!, data));
    return { size: matches.length, empty: matches.length === 0, docs: matches };
  }
  async get() { return this.execute(); }
}

class FakeDb {
  docs = new Map<string, any>();
  collection(name: string) {
    const db = this;
    const makeRef = (path: string) => Object.assign(new Ref(path), {
      async get() { return new Snap(path.split("/").pop()!, db.docs.get(path)); },
    });
    return Object.assign(makeRef(name), {
      doc(id: string) { return makeRef(`${name}/${id}`); },
      where(field: string, operator: "==", value: unknown) { return new Query(name, () => db.docs).where(field, operator, value); },
      async get() { return new Snap(name, db.docs.get(name)); },
    });
  }
  async runTransaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    const working = new Map(this.docs);
    const tx = {
      get: async (refOrQuery: any) => refOrQuery.__isQuery
        ? refOrQuery.execute()
        : new Snap(refOrQuery.path.split("/").pop()!, working.get(refOrQuery.path)),
      create: (ref: Ref, value: any) => {
        if (working.has(ref.path)) throw new Error(`EXISTS:${ref.path}`);
        working.set(ref.path, value);
      },
      update: (ref: Ref, value: any) => {
        if (!working.has(ref.path)) throw new Error(`MISSING:${ref.path}`);
        working.set(ref.path, { ...working.get(ref.path), ...value });
      },
    };
    const result = await callback(tx);
    this.docs = working;
    return result;
  }
  seed(path: string, value: any) { this.docs.set(path, value); }
  read(path: string) { return this.docs.get(path); }
}

function command(key = "key-1") {
  return {
    commandId: `command-${key}`,
    idempotencyKey: key,
    correlationId: `correlation-${key}`,
    causationId: null,
    motivoCodigo: "TEST_RESTABLECIMIENTO",
  } as const;
}

test("ADR-SAAS-017: rechaza una referencia de verificaciÃ³n demasiado corta antes de escribir", async () => {
  await assert.rejects(
    solicitarRestablecimientoCredencial(
      new FakeDb() as any,
      { tipo: "OPERADOR_SAAS", uid: "saas-operator", facultad: "ACCESO_RESTABLECER" },
      command("short-reference"),
      "tenant-owner",
      "owner-1",
      "test-pepper",
      { metodo: "CONFIRMACION_PROPIETARIO", referencia: "abc" },
    ),
    (cause: any) => cause?.code === "invalid-argument" && cause?.message === "EVIDENCIA_FUERA_DE_BANDA_INVALIDA",
  );
});

test("ADR-SAAS-017: recupera operador, no persiste secretos en el agregado y activa de un solo uso", async () => {
  const db = new FakeDb();
  const pepper = "test-pepper";
  const oldPin = "123456";
  const oldCredentialPath = "credenciales_operativas/tenant-1_old-code";
  db.seed("empresas/tenant-1", { estado: "trial", ownerUid: "owner-1", nombreComercial: "Café Atrato" });
  db.seed("membresias/tenant-1_admin-1", { empresaId: "tenant-1", uid: "admin-1", rol: "admin", estado: "activa", activo: true, permisos: [] });
  db.seed("membresias/tenant-1_operator-1", { empresaId: "tenant-1", uid: "operator-1", rol: "cajero", estado: "activa", activo: true, permisos: [] });
  db.seed("usuarios/operator-1", { uid: "operator-1", nombre: "Operador Uno" });
  db.seed(oldCredentialPath, {
    empresaId: "tenant-1", uid: "operator-1", codigo: "old-code", pinHash: await hashearPin(oldPin, pepper),
    activo: true, requiereCambio: false, fallosConsecutivos: 0, bloqueadoHasta: null,
  });

  const primera = await solicitarRestablecimientoCredencial(
    db as any,
    { tipo: "ADMIN_TENANT", uid: "admin-1", facultad: null },
    command(),
    "tenant-1",
    "operator-1",
    pepper,
  );
  assert.equal(primera.idempotente, false);
  assert.equal(primera.estado, "PENDIENTE_ACTIVACION");
  assert.equal(primera.codigo, "cafeatrato-operador");
  assert.match(primera.pinTemporal!, /^\d{6}$/);
  const recovery = db.read(`restablecimientos_credencial/${primera.restablecimientoId}`);
  assert.equal("pinHash" in recovery, false);
  assert.equal("pinTemporal" in recovery, false);
  assert.equal("codigo" in recovery, false);
  assert.equal(db.read(oldCredentialPath).activo, false);

  const reintento = await solicitarRestablecimientoCredencial(
    db as any,
    { tipo: "ADMIN_TENANT", uid: "admin-1", facultad: null },
    command(),
    "tenant-1",
    "operator-1",
    pepper,
  );
  assert.equal(reintento.idempotente, true);
  assert.equal(reintento.pinTemporal, null);
  assert.equal(reintento.codigo, null);

  const activada = await activarRestablecimientoCredencial(
    db as any,
    "operator-1",
    primera.restablecimientoId,
    primera.pinTemporal!,
    "654321",
    pepper,
  );
  assert.equal(activada.idempotente, false);
  assert.equal(activada.rol, "cajero");
  assert.equal(db.read(`restablecimientos_credencial/${primera.restablecimientoId}`).estado, "ACTIVADO");
  const nueva = db.read(`credenciales_operativas/${primera.codigo && `tenant-1_${primera.codigo}`}`);
  assert.equal(nueva.requiereCambio, false);
  assert.equal("pinTemporal" in nueva, false);
  assert.equal("codigo" in recovery, false);

  const activacionReintentada = await activarRestablecimientoCredencial(
    db as any,
    "operator-1",
    primera.restablecimientoId,
    primera.pinTemporal!,
    "654321",
    pepper,
  );
  assert.equal(activacionReintentada.idempotente, true);
  assert.equal(db.docs.size > 0, true);
});

test("ADR-SAAS-035: reemite una recuperaciÃ³n pendiente de administrador de forma atÃ³mica", async () => {
  const db = new FakeDb();
  const pepper = "test-pepper";
  db.seed("empresas/tenant-owner", { estado: "activa", ownerUid: "owner-1", nombreComercial: "Tenant Demo" });
  db.seed("membresias/tenant-owner_owner-1", { empresaId: "tenant-owner", uid: "owner-1", rol: "admin", estado: "activa", activo: true, permisos: [] });
  db.seed("usuarios/owner-1", { uid: "owner-1", nombre: "Owner Demo" });
  db.seed("credenciales_operativas/tenant-owner_owner-old", {
    empresaId: "tenant-owner", uid: "owner-1", codigo: "owner-old", pinHash: await hashearPin("123456", pepper),
    activo: true, requiereCambio: false, fallosConsecutivos: 0, bloqueadoHasta: null,
  });

  const primera = await solicitarRestablecimientoCredencial(
    db as any,
    { tipo: "OPERADOR_SAAS", uid: "saas-operator", facultad: "ACCESO_RESTABLECER" },
    command("first-reset"),
    "tenant-owner",
    "owner-1",
    pepper,
    { metodo: "CONFIRMACION_PROPIETARIO", referencia: "ticket-1" },
  );
  await assert.rejects(
    solicitarRestablecimientoCredencial(
      db as any,
      { tipo: "OPERADOR_SAAS", uid: "saas-operator", facultad: "ACCESO_RESTABLECER" },
      command("blocked-reset"),
      "tenant-owner",
      "owner-1",
      pepper,
      { metodo: "CONFIRMACION_PROPIETARIO", referencia: "ticket-2" },
    ),
    (cause: any) => cause?.message === "CREDENCIAL_RESTABLECIMIENTO_PENDIENTE",
  );
  db.read(`restablecimientos_credencial/${primera.restablecimientoId}`).expiraEn = { toMillis: () => Date.now() - 1 };

  const segunda = await solicitarRestablecimientoCredencial(
    db as any,
    { tipo: "OPERADOR_SAAS", uid: "saas-operator", facultad: "ACCESO_RESTABLECER" },
    command("second-reset"),
    "tenant-owner",
    "owner-1",
    pepper,
    { metodo: "CONFIRMACION_PROPIETARIO", referencia: "ticket-3" },
    { reemitirPendiente: true },
  );
  assert.equal(segunda.idempotente, false);
  assert.equal(segunda.estado, "PENDIENTE_ACTIVACION");
  assert.notEqual(segunda.restablecimientoId, primera.restablecimientoId);
  assert.equal(db.read(`restablecimientos_credencial/${primera.restablecimientoId}`).estado, "CANCELADO");
  assert.equal(db.read(`credenciales_operativas/tenant-owner_${primera.codigo}`).activo, false);
  assert.equal(db.read(`credenciales_operativas/tenant-owner_${segunda.codigo}`).activo, true);
  assert.equal(db.read(`restablecimientos_credencial/${segunda.restablecimientoId}`).estado, "PENDIENTE_ACTIVACION");

  const reintento = await solicitarRestablecimientoCredencial(
    db as any,
    { tipo: "OPERADOR_SAAS", uid: "saas-operator", facultad: "ACCESO_RESTABLECER" },
    command("second-reset"),
    "tenant-owner",
    "owner-1",
    pepper,
    { metodo: "CONFIRMACION_PROPIETARIO", referencia: "ticket-3" },
    { reemitirPendiente: true },
  );
  assert.equal(reintento.idempotente, true);
  assert.equal(reintento.codigo, null);
  assert.equal(reintento.pinTemporal, null);
});

test("ADR-SAAS-017: un admin de tenant no puede recuperar al administrador", async () => {
  const db = new FakeDb();
  db.seed("empresas/tenant-1", { estado: "activa", ownerUid: "owner-1" });
  db.seed("membresias/tenant-1_admin-1", { empresaId: "tenant-1", uid: "admin-1", rol: "admin", estado: "activa", activo: true, permisos: [] });
  db.seed("membresias/tenant-1_owner-1", { empresaId: "tenant-1", uid: "owner-1", rol: "admin", estado: "activa", activo: true, permisos: [] });
  await assert.rejects(
    solicitarRestablecimientoCredencial(db as any, { tipo: "ADMIN_TENANT", uid: "admin-1", facultad: null }, command("admin"), "tenant-1", "owner-1", "test-pepper"),
    (cause: any) => cause?.code === "permission-denied",
  );
});

test("ADR-SAAS-017: la recuperación del administrador exige autoridad SaaS y evidencia fuera de banda", async () => {
  const db = new FakeDb();
  const pepper = "test-pepper";
  db.seed("empresas/tenant-owner", { estado: "activa", ownerUid: "owner-1", nombreComercial: "Tenant Demo" });
  db.seed("membresias/tenant-owner_owner-1", { empresaId: "tenant-owner", uid: "owner-1", rol: "admin", estado: "activa", activo: true, permisos: [] });
  db.seed("usuarios/owner-1", { uid: "owner-1", nombre: "Owner Demo" });
  db.seed("credenciales_operativas/tenant-owner_owner-old", {
    empresaId: "tenant-owner", uid: "owner-1", codigo: "owner-old", pinHash: await hashearPin("123456", pepper),
    activo: true, requiereCambio: false, fallosConsecutivos: 0, bloqueadoHasta: null,
  });
  const resultado = await solicitarRestablecimientoCredencial(
    db as any,
    { tipo: "OPERADOR_SAAS", uid: "saas-operator", facultad: "ACCESO_RESTABLECER" },
    command("owner-reset"),
    "tenant-owner",
    "owner-1",
    pepper,
    { metodo: "CONFIRMACION_PROPIETARIO", referencia: "ticket-1234" },
  );
  assert.equal(resultado.uid, "owner-1");
  assert.equal(resultado.codigo, "tenantdemo-admin");
  const recovery = db.read(`restablecimientos_credencial/${resultado.restablecimientoId}`);
  assert.deepEqual(recovery.verificacionFueraDeBanda, undefined);
  assert.equal(recovery.solicitadoPor.tipo, "OPERADOR_SAAS");
  const audit = [...db.docs.values()].find((value) => value?.evidencia?.tipo === "CREDENCIAL_RESTABLECIMIENTO_SOLICITADO");
  assert.equal(audit.evidencia.detalle.verificacionFueraDeBanda.referencia, "ticket-1234");
});
