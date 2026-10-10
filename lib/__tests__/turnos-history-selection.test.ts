import assert from "node:assert/strict";
import test from "node:test";
import { resolverTurnoSeleccionado } from "../turnos-history-selection";

test("la selección refleja el snapshot nuevo del turno después del cierre", () => {
  const turnoAbierto = { id: "turno-1", estado: "abierto" as const };
  const turnoCerrado = { id: "turno-1", estado: "cerrado" as const };

  const seleccionado = resolverTurnoSeleccionado([turnoCerrado], turnoAbierto.id);

  assert.equal(seleccionado, turnoCerrado);
  assert.equal(seleccionado?.estado, "cerrado");
});

test("cierra la selección si ya no existe en el historial actual", () => {
  const seleccionado = resolverTurnoSeleccionado(
    [{ id: "otro-turno", estado: "cerrado" }],
    "turno-1",
  );

  assert.equal(seleccionado, null);
});

test("no resuelve un turno cuando no hay selección", () => {
  assert.equal(resolverTurnoSeleccionado([{ id: "turno-1" }], null), null);
});
