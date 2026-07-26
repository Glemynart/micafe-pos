import assert from "node:assert/strict";
import test from "node:test";
import {
  derivarSlugParaCodigo,
  generarCodigoOperativo,
  generarPinTemporal,
} from "./credencial-inicial";

const CODIGO_REGEX = /^[a-z0-9._-]{3,32}$/;
const PIN_REGEX = /^[0-9]{6}$/;

test("generarPinTemporal produce siempre 6 dígitos, con ceros a la izquierda si aplica", () => {
  for (let i = 0; i < 200; i++) {
    const pin = generarPinTemporal();
    assert.match(pin, PIN_REGEX, `PIN inválido: ${pin}`);
  }
});

test("derivarSlugParaCodigo normaliza acentos, minúsculas y caracteres no alfanuméricos", () => {
  assert.equal(derivarSlugParaCodigo("Café Atrato"), "cafeat");
  assert.equal(derivarSlugParaCodigo("Mi Café Especial"), "micafe");
  assert.equal(derivarSlugParaCodigo("ÑOÑO S.A.S"), "nonosa");
});

test("derivarSlugParaCodigo nunca produce menos de 3 caracteres", () => {
  assert.equal(derivarSlugParaCodigo("A B"), "ab0");
  assert.equal(derivarSlugParaCodigo(""), "000");
});

test("generarCodigoOperativo cumple el CODIGO_REGEX del contrato existente", () => {
  for (let i = 0; i < 100; i++) {
    const codigo = generarCodigoOperativo("atrato");
    assert.match(codigo, CODIGO_REGEX, `código inválido: ${codigo}`);
    assert.match(codigo, /^atrato-[0-9a-hj-km-np-tv-z]{4}$/, `alfabeto Crockford violado: ${codigo}`);
  }
});

test("generarCodigoOperativo excluye los caracteres ambiguos i, l, o, u", () => {
  const codigos = Array.from({ length: 500 }, () => generarCodigoOperativo("atrato"));
  const sufijos = codigos.map((c) => c.split("-")[1]).join("");
  for (const ambiguo of ["i", "l", "o", "u"]) {
    assert.equal(sufijos.includes(ambiguo), false, `carácter ambiguo '${ambiguo}' apareció en un código generado`);
  }
});
