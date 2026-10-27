import assert from "node:assert/strict";
import test from "node:test";
import { filtrarPresentacionesOferta, type PresentacionOfertaBuscable } from "./offer-presentation-search";

const opciones: PresentacionOfertaBuscable[] = [
  { id: "corona-caja", productoNombre: "Cerveza Corona", presentacionNombre: "Caja x 24", factorUnidadBase: 24 },
  { id: "agua-cielo", productoNombre: "Agua Cielo", presentacionNombre: "Personal x 24 und", factorUnidadBase: 24 },
  { id: "ron", productoNombre: "Ron Tradicional", presentacionNombre: "Unidad individual", factorUnidadBase: 1 },
];

test("filtra ofertas por nombre de producto sin distinguir mayúsculas ni tildes", () => {
  assert.deepEqual(filtrarPresentacionesOferta(opciones, "cerveza corona").map(item => item.id), ["corona-caja"]);
  assert.deepEqual(filtrarPresentacionesOferta(opciones, "agua cielo").map(item => item.id), ["agua-cielo"]);
});

test("filtra por nombre de presentación y factor de empaque", () => {
  assert.deepEqual(filtrarPresentacionesOferta(opciones, "personal 24").map(item => item.id), ["agua-cielo"]);
});

test("muestra todas las opciones con búsqueda vacía y permite términos en producto y presentación", () => {
  assert.equal(filtrarPresentacionesOferta(opciones, "   ").length, 3);
  assert.deepEqual(filtrarPresentacionesOferta(opciones, "ron individual").map(item => item.id), ["ron"]);
});
