import assert from "node:assert/strict";
import test from "node:test";
import { camposPerfilComercialParaRuta, mensajeSeguroErrorPerfilComercial } from "../perfil-comercial-errores";

test("mapea únicamente rutas canónicas conocidas a campos del formulario", () => {
  assert.deepEqual(camposPerfilComercialParaRuta("identidadFiscal"), ["nit", "digitoVerificacion"]);
  assert.deepEqual(camposPerfilComercialParaRuta("identidadFiscal.contacto.email"), ["email"]);
  assert.deepEqual(camposPerfilComercialParaRuta("localizacion.direccion"), ["departamentoCodigo", "municipioCodigo"]);
  for (const ruta of ["ruta.interna.desconocida", "constructor", "toString", "__proto__"]) {
    assert.deepEqual(camposPerfilComercialParaRuta(ruta), []);
  }
});

test("presenta etiquetas permitidas y nunca refleja valores o nombres arbitrarios", () => {
  const mensaje = mensajeSeguroErrorPerfilComercial({
    code: "functions/invalid-argument",
    message: "PERFIL_COMERCIAL_INVALIDO",
    details: { campos: ["email", "digitoVerificacion", "correo-interno", "900373913"] },
  });

  assert.equal(mensaje, "Revisa correo de contacto y dígito de verificación; no se guardó el perfil.");
  assert.equal(mensaje?.includes("900373913"), false);
  assert.equal(mensaje?.includes("correo-interno"), false);
});

test("no convierte errores genéricos ni detalles no controlados en mensajes visibles", () => {
  assert.equal(mensajeSeguroErrorPerfilComercial({ code: "functions/unavailable", message: "PERFIL_COMERCIAL_INVALIDO", details: { campos: ["email"] } }), null);
  assert.equal(mensajeSeguroErrorPerfilComercial({ code: "functions/invalid-argument", message: "otro error", details: { campos: ["email"] } }), null);
  assert.equal(mensajeSeguroErrorPerfilComercial({ code: "functions/invalid-argument", message: "PERFIL_COMERCIAL_INVALIDO", details: { campos: ["dato-sensible"] } }), null);
});
