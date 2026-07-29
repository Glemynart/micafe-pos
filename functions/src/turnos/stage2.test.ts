import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  ejecutarAperturaTurnoOperativo,
  type ContextoAperturaTurno,
} from "./executor";
import { manejarAbrirTurnoOperativo } from "./callable";
import { validarEnvelopeAbrirTurno } from "./envelope";
import { crearIdentificadorInterno, descomponerIdentificadorInterno } from "./identificadores";

type Data = Record<string, unknown>;

class FakeSnapshot {
  constructor(readonly id: string, private readonly value: Data | undefined) {}
  get exists() { return this.value !== undefined; }
  data() { return this.value; }
}

class FakeRef {
  constructor(readonly path: string, private readonly db: FakeFirestore) {}
  get id() { return this.path.split("/").at(-1)!; }
  async get() { return this.db.snapshot(this.path); }
}

class FakeCollection {
  constructor(private readonly name: string, private readonly db: FakeFirestore) {}
  doc(id?: string) { return new FakeRef(`${this.name}/${id ?? `auto_${++this.db.autoId}`}`, this.db); }
}

class FakeTransaction {
  constructor(private readonly db: FakeFirestore) {}
  async get(ref: FakeRef) { return this.db.snapshot(ref.path); }
  create(ref: FakeRef, data: Data) {
    if (this.db.docs.has(ref.path)) throw new Error(`already exists: ${ref.path}`);
    this.db.docs.set(ref.path, data);
  }
}

class FakeFirestore {
  readonly docs = new Map<string, Data>();
  autoId = 0;
  collection(name: string) { return new FakeCollection(name, this); }
  snapshot(path: string) { return new FakeSnapshot(path.split("/").at(-1)!, this.docs.get(path)); }
  async runTransaction<T>(work: (tx: FakeTransaction) => Promise<T>) { return work(new FakeTransaction(this)); }
}

const contexto: ContextoAperturaTurno = {
  empresaId: "empresa_1",
  actorUid: "cajero_1",
};

const envelope = (sufijo = "1") => validarEnvelopeAbrirTurno({
  commandId: `cmd_apertura_${sufijo}`,
  idempotencyKey: `idem_apertura_${sufijo}`,
  correlationId: `corr_apertura_${sufijo}`,
  payload: { baseApertura: 150000, notasApertura: "Apertura" },
});

function seedCanonico(db: FakeFirestore, overrides: { empresa?: Data; membresia?: Data; usuario?: Data } = {}) {
  db.docs.set("empresas/empresa_1", { estado: "activa", ...(overrides.empresa ?? {}) });
  db.docs.set("membresias/empresa_1_cajero_1", {
    empresaId: "empresa_1", uid: "cajero_1", rol: "cajero", permisos: ["shifts"], estado: "activa", activo: true,
    ...(overrides.membresia ?? {}),
  });
  db.docs.set("usuarios/cajero_1", { nombre: "Cajera Uno", ...(overrides.usuario ?? {}) });
}

function seedCanonicoPara(db: FakeFirestore, contexto: ContextoAperturaTurno) {
  db.docs.set(`empresas/${contexto.empresaId}`, { estado: "activa" });
  db.docs.set(`membresias/${contexto.empresaId}_${contexto.actorUid}`, {
    empresaId: contexto.empresaId, uid: contexto.actorUid, rol: "cajero", permisos: ["shifts"], estado: "activa", activo: true,
  });
  db.docs.set(`usuarios/${contexto.actorUid}`, { nombre: `Cajero ${contexto.actorUid}` });
}

function assertDomain(error: unknown, transport: Parameters<typeof HttpsError>[0], code: string) {
  return error instanceof HttpsError && error.code === transport && (error.details as { code?: string } | undefined)?.code === code;
}

test("R1-A etapa 2: abre turno, candado, recibo, índice y auditoría en un único commit", async () => {
  const db = new FakeFirestore();
  seedCanonico(db);

  const result = await ejecutarAperturaTurnoOperativo(db as any, contexto, envelope(), { serverTimestamp: () => "SERVER_TIMESTAMP" });

  assert.deepEqual(result, {
    commandId: "cmd_apertura_1", turnoId: "auto_1", cajeroId: "cajero_1", estado: "abierto", correlationId: "corr_apertura_1",
  });
  const turnoCreado = db.docs.get("turnos/auto_1");
  assert.deepEqual(turnoCreado, {
    id: "auto_1", empresaId: "empresa_1", cajeroId: "cajero_1", cajeroNombre: "Cajera Uno",
    fechaApertura: "SERVER_TIMESTAMP", estado: "abierto", baseApertura: 150000,
    notasApertura: "Apertura",
  });
  for (const campoDeCierre of [
    "ventasEfectivo",
    "ventasOtrosMetodos",
    "totalEsperadoEfectivo",
    "totalReportadoEfectivo",
    "diferenciaEfectivo",
  ]) {
    assert.equal(campoDeCierre in (turnoCreado ?? {}), false);
  }
  assert.equal(db.docs.get(`turnos_activos/${crearIdentificadorInterno("empresa_1", "cajero_1")}`)?.turnoId, "auto_1");
  const referenciasEsperadas = {
    turnoId: "auto_1",
    turnoPath: "turnos/auto_1",
    candadoPath: `turnos_activos/${crearIdentificadorInterno("empresa_1", "cajero_1")}`,
    reciboPath: `operaciones_comandos/${crearIdentificadorInterno("empresa_1", "cmd_apertura_1")}`,
    indiceIdempotenciaPath: `operaciones_command_idempotency/${crearIdentificadorInterno("empresa_1", "idem_apertura_1")}`,
    auditoriaPath: `operaciones_auditoria/${crearIdentificadorInterno("empresa_1", "cmd_apertura_1")}`,
  };
  const recibo = db.docs.get(referenciasEsperadas.reciboPath);
  const auditoria = db.docs.get(referenciasEsperadas.auditoriaPath);
  assert.equal(recibo?.estado, "CONFIRMADO");
  assert.equal("causationId" in (recibo ?? {}), false);
  assert.equal(recibo?.motivo, null);
  assert.deepEqual(recibo?.referencias, referenciasEsperadas);
  assert.equal("causationId" in ((auditoria?.comando as Record<string, unknown> | undefined) ?? {}), false);
  assert.equal(auditoria?.motivo, null);
  assert.deepEqual(auditoria?.referencias, referenciasEsperadas);
  assert.equal(db.docs.get(referenciasEsperadas.indiceIdempotenciaPath)?.commandId, "cmd_apertura_1");
  assert.equal(auditoria?.tipo, "TurnoAbierto");
});

test("R1-A etapa 2: reintento idéntico devuelve el recibo sin volver a escribir auditoría", async () => {
  const db = new FakeFirestore();
  seedCanonico(db);
  const first = await ejecutarAperturaTurnoOperativo(db as any, contexto, envelope(), { serverTimestamp: () => "SERVER_TIMESTAMP" });
  const before = db.docs.size;

  const replay = await ejecutarAperturaTurnoOperativo(db as any, contexto, envelope(), { serverTimestamp: () => "SERVER_TIMESTAMP" });

  assert.deepEqual(replay, first);
  assert.equal(db.docs.size, before);
});

test("R1-A etapa 2: commandId o clave reutilizados con otra intención fallan sin efectos", async () => {
  const db = new FakeFirestore();
  seedCanonico(db);
  await ejecutarAperturaTurnoOperativo(db as any, contexto, envelope());
  const before = db.docs.size;

  await assert.rejects(
    ejecutarAperturaTurnoOperativo(db as any, contexto, validarEnvelopeAbrirTurno({
      ...envelope(), payload: { baseApertura: 1, notasApertura: "Otra" },
    })),
    (error) => assertDomain(error, "already-exists", "COMMAND_ID_CONFLICT"),
  );
  await assert.rejects(
    ejecutarAperturaTurnoOperativo(db as any, contexto, validarEnvelopeAbrirTurno({
      ...envelope("2"), idempotencyKey: "idem_apertura_1",
    })),
    (error) => assertDomain(error, "already-exists", "IDEMPOTENCY_CONFLICT"),
  );
  assert.equal(db.docs.size, before);
});

test("R1-A etapa 2: candado existente bloquea una nueva apertura", async () => {
  const db = new FakeFirestore();
  seedCanonico(db);
  db.docs.set(`turnos_activos/${crearIdentificadorInterno("empresa_1", "cajero_1")}`, {
    empresaId: "empresa_1", cajeroId: "cajero_1", turnoId: "turno_existente",
  });

  await assert.rejects(
    ejecutarAperturaTurnoOperativo(db as any, contexto, envelope()),
    (error) => assertDomain(error, "failed-precondition", "LOCK_CONFLICT"),
  );
  assert.equal(db.docs.has("turnos/auto_1"), false);
});

test("R1-A etapa 3: el candado es aislado por empresa para el mismo actor", async () => {
  const db = new FakeFirestore();
  const primeraEmpresa: ContextoAperturaTurno = { empresaId: "empresa_a", actorUid: "cajero_1" };
  const segundaEmpresa: ContextoAperturaTurno = { empresaId: "empresa_b", actorUid: "cajero_1" };
  seedCanonicoPara(db, primeraEmpresa);
  seedCanonicoPara(db, segundaEmpresa);

  await ejecutarAperturaTurnoOperativo(db as any, primeraEmpresa, envelope("empresa_a"));
  await ejecutarAperturaTurnoOperativo(db as any, segundaEmpresa, envelope("empresa_b"));

  const candados = [...db.docs.entries()]
    .filter(([path]) => path.startsWith("turnos_activos/"));
  assert.equal(candados.length, 2);
  assert.equal(candados.every(([, data]) => data.cajeroId === "cajero_1"), true);
  assert.deepEqual(new Set(candados.map(([, data]) => data.empresaId)), new Set(["empresa_a", "empresa_b"]));
});

test("R1-A etapa 3: pares con guiones bajos no colisionan en recibo, Ã­ndice ni auditorÃ­a", async () => {
  const db = new FakeFirestore();
  const primerContexto: ContextoAperturaTurno = { empresaId: "empresa_a", actorUid: "cajero_1" };
  const segundoContexto: ContextoAperturaTurno = { empresaId: "empresa", actorUid: "cajero_2" };
  seedCanonicoPara(db, primerContexto);
  seedCanonicoPara(db, segundoContexto);
  const primerEnvelope = validarEnvelopeAbrirTurno({
    commandId: "comando", idempotencyKey: "clave", correlationId: "corr_1",
    payload: { baseApertura: 100, notasApertura: "Primera" },
  });
  const segundoEnvelope = validarEnvelopeAbrirTurno({
    commandId: "a_comando", idempotencyKey: "a_clave", correlationId: "corr_2",
    payload: { baseApertura: 200, notasApertura: "Segunda" },
  });

  await ejecutarAperturaTurnoOperativo(db as any, primerContexto, primerEnvelope);
  await ejecutarAperturaTurnoOperativo(db as any, segundoContexto, segundoEnvelope);

  for (const collection of ["operaciones_comandos", "operaciones_command_idempotency", "operaciones_auditoria"]) {
    assert.equal([...db.docs.keys()].filter((path) => path.startsWith(`${collection}/`)).length, 2);
  }
});

test("R1-A etapa 3: la composiciÃ³n interna conserva cada segmento sin ambigÃ¼edad", () => {
  const identificador = crearIdentificadorInterno("empresa_a", "comando_con_guiones_bajos");

  assert.deepEqual(descomponerIdentificadorInterno(identificador), ["empresa_a", "comando_con_guiones_bajos"]);
  assert.notEqual(
    identificador,
    crearIdentificadorInterno("empresa", "a_comando_con_guiones_bajos"),
  );
});

test("R1-A etapa 2: rechaza lifecycle, membresía y permiso canónicos no autorizados", async () => {
  for (const overrides of [
    { empresa: { estado: "suspendida" }, expected: ["failed-precondition", "EMPRESA_NO_OPERATIVA"] as const },
    { membresia: { estado: "inactiva", activo: false }, expected: ["permission-denied", "TENANT_ACCESS_DENIED"] as const },
    { membresia: { permisos: ["sell"] }, expected: ["permission-denied", "ROLE_FORBIDDEN"] as const },
  ]) {
    const db = new FakeFirestore();
    seedCanonico(db, overrides);
    await assert.rejects(
      ejecutarAperturaTurnoOperativo(db as any, contexto, envelope()),
      (error) => assertDomain(error, overrides.expected[0], overrides.expected[1]),
    );
    assert.equal(db.docs.has("turnos/auto_1"), false);
  }
});

test("R1-A etapa 2: la Callable no acepta apertura anónima ni payload inválido", async () => {
  await assert.rejects(
    manejarAbrirTurnoOperativo(new FakeFirestore() as any, { data: {} }),
    (error) => assertDomain(error, "unauthenticated", "AUTH_REQUIRED"),
  );
  await assert.rejects(
    manejarAbrirTurnoOperativo(new FakeFirestore() as any, {
      auth: { uid: "cajero_1", token: { empresaId: "empresa_1" } },
      data: { empresaId: "inyectada" },
    }),
    (error) => assertDomain(error, "invalid-argument", "PAYLOAD_INVALID"),
  );
});
