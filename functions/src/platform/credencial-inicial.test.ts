import assert from "node:assert/strict";
import test from "node:test";
import {
  codigoOperativoDisponibleGlobalmente,
  derivarSlugParaCodigo,
  generarCodigoOperativo,
  generarCodigoOperativoUnico,
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

function dbFalso(codigosExistentes: Set<string>) {
  return {
    collection: () => ({
      where: (_campo: string, _op: string, valor: string) => ({
        limit: () => ({
          get: async () => ({ empty: !codigosExistentes.has(valor) }),
        }),
      }),
    }),
  } as unknown as FirebaseFirestore.Firestore;
}

test("codigoOperativoDisponibleGlobalmente consulta por 'codigo' sin filtrar por empresaId", async () => {
  const db = dbFalso(new Set(["atrato-7k2m"]));
  assert.equal(await codigoOperativoDisponibleGlobalmente(db, "atrato-7k2m"), false);
  assert.equal(await codigoOperativoDisponibleGlobalmente(db, "atrato-9xq4"), true);
});

test("generarCodigoOperativoUnico reintenta hasta obtener un código disponible", async () => {
  let intentos = 0;
  const dbConColisionesForzadas = {
    collection: () => ({
      where: () => ({
        limit: () => ({
          get: async () => {
            intentos++;
            // Las dos primeras consultas "colisionan"; la tercera está libre.
            return { empty: intentos > 2 };
          },
        }),
      }),
    }),
  } as unknown as FirebaseFirestore.Firestore;

  const codigo = await generarCodigoOperativoUnico(dbConColisionesForzadas, "atrato");
  assert.match(codigo, CODIGO_REGEX);
  assert.equal(intentos, 3, "debe haber verificado exactamente 3 veces antes de aceptar el código");
});

test("generarCodigoOperativoUnico falla explícito si agota los intentos", async () => {
  const dbSiempreColisiona = {
    collection: () => ({
      where: () => ({
        limit: () => ({
          get: async () => ({ empty: false }),
        }),
      }),
    }),
  } as unknown as FirebaseFirestore.Firestore;

  await assert.rejects(
    () => generarCodigoOperativoUnico(dbSiempreColisiona, "atrato"),
    /CODIGO_OPERATIVO_NO_DISPONIBLE/,
  );
});
