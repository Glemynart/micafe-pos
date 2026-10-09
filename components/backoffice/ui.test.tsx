import assert from "node:assert/strict";
import test from "node:test";
import { fecha } from "./ui";

const formateador = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" });
const segundos = 1_760_000_000;

test("formatea timestamps Firestore serializados por Admin SDK", () => {
  const esperado = formateador.format(new Date(segundos * 1000));

  assert.equal(fecha({ _seconds: segundos, _nanoseconds: 0 }), esperado);
  assert.equal(fecha({ seconds: segundos, nanoseconds: 0 }), esperado);
});

test("formatea timestamps Firestore y fechas nativas sin cambiar el contrato", () => {
  const esperado = formateador.format(new Date(segundos * 1000));

  assert.equal(fecha({ toMillis: () => segundos * 1000 }), esperado);
  assert.equal(fecha({ toDate: () => new Date(segundos * 1000) }), esperado);
  assert.equal(fecha(new Date(segundos * 1000)), esperado);
  assert.equal(fecha({ _seconds: 0, _nanoseconds: 0 }), formateador.format(new Date(0)));
});

test("no expone objetos malformados como [object Object]", () => {
  assert.equal(fecha({ _seconds: "incorrecto", _nanoseconds: 0 }), "—");
  assert.equal(fecha({ inesperado: true }), "—");
  assert.equal(fecha(null), "—");
  assert.equal(fecha(0), "—");
});
