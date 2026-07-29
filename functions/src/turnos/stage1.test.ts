import assert from "node:assert/strict";
import test from "node:test";
import {
  ABRIR_TURNO_OPERATIVO_V1,
  ErrorContratoAperturaTurno,
  crearBorradoresConfirmacionAperturaTurno,
  crearHuellaSemanticaAperturaTurno,
  crearReferenciasOperacionAperturaTurno,
  validarEnvelopeAbrirTurno,
} from "./index";

const envelopeValido = () => ({
  commandId: "cmd_apertura_1",
  idempotencyKey: "idem_apertura_1",
  correlationId: "corr_apertura_1",
  payload: {
    baseApertura: 150000,
    notasApertura: "  Apertura de la ma\u00f1ana  ",
  },
});

test("R1-A etapa 1: acepta exclusivamente el envelope de apertura y lo normaliza", () => {
  const envelope = validarEnvelopeAbrirTurno(envelopeValido());

  assert.deepEqual(envelope, {
    commandId: "cmd_apertura_1",
    idempotencyKey: "idem_apertura_1",
    correlationId: "corr_apertura_1",
    causationId: null,
    motivo: null,
    payload: {
      baseApertura: 150000,
      notasApertura: "Apertura de la ma\u00f1ana",
    },
  });
});

test("R1-A etapa 1: reutiliza el validador canónico de notas con máximo de 240 y bloquea HTML o secretos", () => {
  const conMaximo = validarEnvelopeAbrirTurno({
    ...envelopeValido(),
    payload: { baseApertura: 0, notasApertura: `  ${"a".repeat(240)}  ` },
  });
  assert.equal(conMaximo.payload.notasApertura, "a".repeat(240));

  for (const notasApertura of ["a".repeat(241), "<b>texto</b>", "token=secreto-recuperable"]) {
    assert.throws(
      () => validarEnvelopeAbrirTurno({
        ...envelopeValido(),
        payload: { baseApertura: 0, notasApertura },
      }),
      (error: unknown) => error instanceof ErrorContratoAperturaTurno
        && error.code === "PAYLOAD_INVALID",
    );
  }
});

test("R1-A etapa 1: una apertura normal solo admite causationId y motivo nulos o ausentes", () => {
  const ausentes = validarEnvelopeAbrirTurno({
    commandId: "cmd_apertura_ausente",
    idempotencyKey: "idem_apertura_ausente",
    correlationId: "corr_apertura_ausente",
    payload: { baseApertura: 0, notasApertura: "" },
  });
  assert.deepEqual({ causationId: ausentes.causationId, motivo: ausentes.motivo }, {
    causationId: null,
    motivo: null,
  });

  for (const cambios of [
    { causationId: "hecho_origen" },
    { motivo: "Ajuste manual" },
  ]) {
    assert.throws(
      () => validarEnvelopeAbrirTurno({ ...envelopeValido(), ...cambios }),
      (error: unknown) => error instanceof ErrorContratoAperturaTurno
        && error.code === "PAYLOAD_INVALID",
    );
  }
});

test("R1-A etapa 1: rechaza autoridad o campos desconocidos en el envelope", () => {
  assert.throws(
    () => validarEnvelopeAbrirTurno({ ...envelopeValido(), empresaId: "empresa_inyectada" }),
    (error: unknown) => error instanceof ErrorContratoAperturaTurno
      && error.code === "PAYLOAD_INVALID",
  );

  assert.throws(
    () => validarEnvelopeAbrirTurno({
      ...envelopeValido(),
      payload: { baseApertura: 0, cajeroId: "actor_inyectado" },
    }),
    (error: unknown) => error instanceof ErrorContratoAperturaTurno
      && error.code === "PAYLOAD_INVALID",
  );
});

test("R1-A etapa 1: genera referencias de efectos completas solo con turno y candado ya resueltos", () => {
  const referencias = crearReferenciasOperacionAperturaTurno(
    "empresa_1",
    validarEnvelopeAbrirTurno(envelopeValido()),
    { turnoId: "turno_1", actorUid: "cajero_1" },
  );

  assert.deepEqual(
    referencias,
    {
      turnoId: "turno_1",
      turnoPath: "turnos/turno_1",
      candadoPath: "turnos_activos/r1a-WyJlbXByZXNhXzEiLCJjYWplcm9fMSJd",
      reciboPath: "operaciones_comandos/r1a-WyJlbXByZXNhXzEiLCJjbWRfYXBlcnR1cmFfMSJd",
      indiceIdempotenciaPath: "operaciones_command_idempotency/r1a-WyJlbXByZXNhXzEiLCJpZGVtX2FwZXJ0dXJhXzEiXQ",
      auditoriaPath: "operaciones_auditoria/r1a-WyJlbXByZXNhXzEiLCJjbWRfYXBlcnR1cmFfMSJd",
    },
  );
});

test("R1-A etapa 1: la huella es semántica y no cambia por correlación ni por el orden de propiedades", () => {
  const original = validarEnvelopeAbrirTurno(envelopeValido());
  const mismaIntencion = validarEnvelopeAbrirTurno({
    correlationId: "corr_apertura_2",
    idempotencyKey: "idem_apertura_2",
    commandId: "cmd_apertura_2",
    payload: { notasApertura: "Apertura de la ma\u00f1ana", baseApertura: 150000 },
  });

  assert.equal(
    crearHuellaSemanticaAperturaTurno(original),
    crearHuellaSemanticaAperturaTurno(mismaIntencion),
  );
});

test("R1-A etapa 1: construye los borradores backend-only coherentes de recibo, índice y auditoría", () => {
  const envelope = validarEnvelopeAbrirTurno(envelopeValido());
  const referencias = crearReferenciasOperacionAperturaTurno(
    "empresa_1",
    envelope,
    { turnoId: "turno_1", actorUid: "cajero_1" },
  );
  const borradores = crearBorradoresConfirmacionAperturaTurno({
    empresaId: "empresa_1",
    envelope,
    huella: crearHuellaSemanticaAperturaTurno(envelope),
    actor: { uid: "cajero_1", rolEfectivo: "cajero" },
    resultado: {
      commandId: "cmd_apertura_1",
      turnoId: "turno_1",
      cajeroId: "cajero_1",
      estado: "abierto",
      correlationId: "corr_apertura_1",
    },
    referencias,
  });

  assert.equal(borradores.recibo.tipo, ABRIR_TURNO_OPERATIVO_V1);
  assert.equal(borradores.recibo.empresaId, "empresa_1");
  assert.equal("causationId" in borradores.recibo, false);
  assert.equal(borradores.recibo.motivo, null);
  assert.equal(borradores.indice.reciboPath, referencias.reciboPath);
  assert.equal(borradores.auditoria.tipo, "TurnoAbierto");
  assert.equal("causationId" in borradores.auditoria.comando, false);
  assert.equal(borradores.auditoria.motivo, null);
  assert.deepEqual(borradores.auditoria.referencias, referencias);
});
