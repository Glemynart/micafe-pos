import assert from "node:assert/strict";
import test from "node:test";
import {
  derivarSlugParaCodigo,
  generarCodigoOperativo,
  generarPinTemporal,
} from "./credencial-inicial";

const CODIGO_REGEX = /^[a-z0-9._-]{3,32}$/;
const PIN_REGEX = /^[0-9]{6}$/;

test("generarPinTemporal produce siempre 6 dígitos", () => {
  for (let i = 0; i < 200; i++) {
    assert.match(generarPinTemporal(), PIN_REGEX);
  }
});

test("derivarSlugParaCodigo normaliza acentos, minúsculas y caracteres no alfanuméricos", () => {
  assert.equal(derivarSlugParaCodigo("Café Atrato"), "cafeatrato");
  assert.equal(derivarSlugParaCodigo("Mi Café Especial"), "micafeespecial");
  assert.equal(derivarSlugParaCodigo("ÑOÑO S.A.S"), "nonosas");
});

test("derivarSlugParaCodigo nunca produce menos de 3 caracteres", () => {
  assert.equal(derivarSlugParaCodigo("A B"), "ab0");
  assert.equal(derivarSlugParaCodigo(""), "000");
});

test("generarCodigoOperativo produce un identificador recordable de negocio y persona", () => {
  const codigo = generarCodigoOperativo("Café Atrato", "María López");
  assert.equal(codigo, "cafeatrato-maria");
  assert.match(codigo, CODIGO_REGEX);
});

test("generarCodigoOperativo usa el rol admin y un diferenciador legible en colisión", () => {
  assert.equal(generarCodigoOperativo("Café Atrato", "admin"), "cafeatrato-admin");
  assert.equal(generarCodigoOperativo("Café Atrato", "admin", 1), "cafeatrato-admin-2");
  assert.match(generarCodigoOperativo("Nombre Comercial Largo", "Persona Operativa", 4), CODIGO_REGEX);
});
