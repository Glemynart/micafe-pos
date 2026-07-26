import assert from "node:assert/strict";
import test from "node:test";
import { esCredencialTemporalPlataformaVencidaOInvalida } from "./vigencia-credencial-temporal";

const timestamp = (millis: number) => ({ toMillis: () => millis });
const ahora = 1_000_000;

test("la credencial temporal de plataforma vence en el límite exacto", () => {
  const documento = { origen: "PLATAFORMA", expiraEn: timestamp(ahora) };
  assert.equal(esCredencialTemporalPlataformaVencidaOInvalida(documento, documento, ahora), true);
});

test("la credencial temporal de plataforma exige TTL válido en ambos documentos", () => {
  const vigente = { origen: "PLATAFORMA", expiraEn: timestamp(ahora + 1) };
  assert.equal(esCredencialTemporalPlataformaVencidaOInvalida(vigente, vigente, ahora), false);
  assert.equal(esCredencialTemporalPlataformaVencidaOInvalida({ origen: "PLATAFORMA" }, vigente, ahora), true);
  assert.equal(esCredencialTemporalPlataformaVencidaOInvalida(vigente, { origen: "PLATAFORMA", expiraEn: {} }, ahora), true);
});

test("los documentos DIRECTA heredados sin origen ni TTL no cambian de comportamiento", () => {
  assert.equal(esCredencialTemporalPlataformaVencidaOInvalida({}, {}, ahora), false);
});
