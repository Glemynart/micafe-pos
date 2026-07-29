import assert from "node:assert/strict";
import test from "node:test";
import {
  ErrorAperturaTurnoCliente,
  ejecutarAperturaPendiente,
  limpiarYRechazarAperturaSinSesion,
  limpiarAperturaPendiente,
  type AdaptadoresAperturaPendiente,
} from "../turnos-apertura-r1a";

function crearAdaptadores(): AdaptadoresAperturaPendiente & { readonly valores: Map<string, string>; readonly bloqueos: string[] } {
  const valores = new Map<string, string>();
  const bloqueos: string[] = [];
  return {
    valores,
    bloqueos,
    storage: {
      getItem: (key) => valores.get(key) ?? null,
      setItem: (key, value) => { valores.set(key, value); },
      removeItem: (key) => { valores.delete(key); },
      keys: () => [...valores.keys()],
    },
    locks: {
      request: async (name, _options, callback) => {
        bloqueos.push(name);
        return callback();
      },
    },
    now: () => 1_000,
    generarId: (() => {
      let numero = 0;
      return () => `id-${++numero}`;
    })(),
    dormir: async () => undefined,
  };
}

const contexto = { uid: "uid-1", empresaId: "empresa-1" };
const entrada = { baseApertura: 12000, notasApertura: "  Inicio de turno  " };
const resultado = {
  commandId: "id-1",
  turnoId: "turno-1",
  cajeroId: "uid-1",
  estado: "abierto" as const,
  correlationId: "id-3",
};

test("crea el envelope canónico, lo persiste antes de invocar y lo elimina al confirmar", async () => {
  const adaptadores = crearAdaptadores();
  let recibido: unknown;

  const actual = await ejecutarAperturaPendiente(contexto, entrada, async (envelope) => {
    recibido = envelope;
    assert.equal(adaptadores.valores.size, 2);
    return resultado;
  }, adaptadores);

  assert.deepEqual(actual, resultado);
  assert.deepEqual(recibido, {
    commandId: "id-1",
    idempotencyKey: "id-2",
    correlationId: "id-3",
    causationId: null,
    motivo: null,
    payload: { baseApertura: 12000, notasApertura: "Inicio de turno" },
  });
  assert.equal(adaptadores.valores.size, 0);
  assert.deepEqual(adaptadores.bloqueos, ["r1a:abrirTurnoOperativoV1:uid-1:empresa-1"]);
});

test("reutiliza exactamente el envelope persistido para el mismo payload", async () => {
  const adaptadores = crearAdaptadores();
  const envelopes: unknown[] = [];
  let disponible = false;
  const invocar = async (envelope: unknown) => {
    envelopes.push(envelope);
    if (!disponible) throw { code: "functions/unavailable" };
    return resultado;
  };

  await assert.rejects(
    () => ejecutarAperturaPendiente(contexto, entrada, invocar, adaptadores),
    (error: unknown) => error instanceof ErrorAperturaTurnoCliente && error.code === "UNAVAILABLE",
  );
  disponible = true;
  await ejecutarAperturaPendiente(contexto, entrada, invocar, adaptadores);

  assert.deepEqual(envelopes[0], envelopes[envelopes.length - 1]);
  assert.equal(adaptadores.valores.size, 0);
});

test("sustituye una intención pendiente si cambia el payload canónico", async () => {
  const adaptadores = crearAdaptadores();
  const envelopes: any[] = [];
  await assert.rejects(
    () => ejecutarAperturaPendiente(contexto, entrada, async () => { throw { code: "functions/unavailable" }; }, adaptadores),
  );

  await ejecutarAperturaPendiente(
    contexto,
    { baseApertura: 15000, notasApertura: "Inicio de turno" },
    async (envelope) => { envelopes.push(envelope); return { ...resultado, commandId: envelope.commandId, correlationId: envelope.correlationId }; },
    adaptadores,
  );

  assert.notEqual(envelopes[0].commandId, "id-1");
  assert.equal(adaptadores.valores.size, 0);
});

test("limpia registros vencidos o de otro contexto antes de crear una nueva intención", async () => {
  const adaptadores = crearAdaptadores();
  const prefijo = "r1a:abrirTurnoOperativoV1:uid-1:empresa-1";
  adaptadores.valores.set(`${prefijo}:id-viejo`, JSON.stringify({
    commandId: "id-viejo", idempotencyKey: "key-vieja", correlationId: "corr-vieja", causationId: null, motivo: null,
    payload: { baseApertura: 1, notasApertura: "" }, uid: "uid-1", empresaId: "empresa-1", createdAt: -900_000, updatedAt: -900_000, retryCount: 0,
  }));
  adaptadores.valores.set(`${prefijo}:index`, JSON.stringify({ commandId: "id-viejo", createdAt: -900_000 }));

  await ejecutarAperturaPendiente(contexto, entrada, async (envelope) => ({ ...resultado, commandId: envelope.commandId, correlationId: envelope.correlationId }), adaptadores);

  assert.equal(adaptadores.valores.size, 0);
});

test("limpia la intención del contexto conocido al cambiar de sesión o tenant", async () => {
  const adaptadores = crearAdaptadores();
  await assert.rejects(
    () => ejecutarAperturaPendiente(contexto, entrada, async () => { throw { code: "functions/unavailable" }; }, adaptadores),
  );
  assert.equal(adaptadores.valores.size, 2);

  await limpiarAperturaPendiente(contexto, adaptadores);

  assert.equal(adaptadores.valores.size, 0);
});

test("al perder el UID limpia la intención antes de devolver AUTH_REQUIRED", async () => {
  const adaptadores = crearAdaptadores();
  await assert.rejects(
    () => ejecutarAperturaPendiente(contexto, entrada, async () => { throw { code: "functions/unavailable" }; }, adaptadores),
  );
  assert.equal(adaptadores.valores.size, 2);

  await assert.rejects(
    () => limpiarYRechazarAperturaSinSesion(contexto, adaptadores),
    (error: unknown) => error instanceof ErrorAperturaTurnoCliente && error.code === "AUTH_REQUIRED",
  );
  assert.equal(adaptadores.valores.size, 0);
});

test("rechaza sin invocar cuando Web Locks o storage no están disponibles", async () => {
  let invocaciones = 0;
  await assert.rejects(
    () => ejecutarAperturaPendiente(contexto, entrada, async () => { invocaciones += 1; return resultado; }, {
      storage: null,
      locks: null,
      now: () => 1_000,
      generarId: () => "id",
      dormir: async () => undefined,
    }),
    (error: unknown) => error instanceof ErrorAperturaTurnoCliente && error.code === "CLIENT_STORAGE_UNAVAILABLE",
  );
  assert.equal(invocaciones, 0);
});
