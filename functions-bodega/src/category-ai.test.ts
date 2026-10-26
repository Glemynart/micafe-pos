import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import {
  exigirAutoridadSugerenciaCategoria,
  parsearSolicitudCategorias,
  sugerirCategoriasBodega,
  sugerirCategoriasBodegaParaTenant,
  validarRespuestaCategorias,
} from "./category-ai";

const tenant = { id: "tenant-a", rol: "admin", permisos: ["inventory"] };
const configuracion = { empresaId: "tenant-a", vertical: "BODEGA_MVP1", modulos: { habilitados: ["inventory"] } };

function debeFallarCon(code: string) {
  return (error: unknown) => error instanceof HttpsError && error.code === code;
}

test("acepta un lote limitado y normaliza nombres sin admitir campos ajenos", () => {
  assert.deepEqual(parsearSolicitudCategorias({ items: [
    { itemId: "fila-1", nombre: "  Vive   100 " },
    { itemId: "fila-2", nombre: "Aguardiente Antioqueño" },
  ] }), [
    { itemId: "fila-1", nombre: "Vive 100" },
    { itemId: "fila-2", nombre: "Aguardiente Antioqueño" },
  ]);
  assert.throws(() => parsearSolicitudCategorias({ empresaId: "tenant-a", items: [{ itemId: "1", nombre: "Agua" }] }), debeFallarCon("invalid-argument"));
  assert.throws(() => parsearSolicitudCategorias({ items: [{ itemId: "1", nombre: "Agua", costo: 500 }] }), debeFallarCon("invalid-argument"));
  assert.throws(() => parsearSolicitudCategorias({ items: [] }), debeFallarCon("invalid-argument"));
  assert.throws(() => parsearSolicitudCategorias({ items: Array.from({ length: 26 }, (_, index) => ({ itemId: `i-${index}`, nombre: "Agua" })) }), debeFallarCon("invalid-argument"));
  assert.throws(() => parsearSolicitudCategorias({ items: [{ itemId: "1", nombre: "A".repeat(121) }] }), debeFallarCon("invalid-argument"));
  assert.throws(() => parsearSolicitudCategorias({ items: [{ itemId: "1", nombre: "Agua" }, { itemId: "1", nombre: "Soda" }] }), debeFallarCon("invalid-argument"));
});

test("solo permite admin con permiso inventory y configuración del mismo tenant Bodega", () => {
  assert.doesNotThrow(() => exigirAutoridadSugerenciaCategoria(tenant, configuracion));
  assert.throws(() => exigirAutoridadSugerenciaCategoria({ ...tenant, rol: "vendedor" }, configuracion), debeFallarCon("permission-denied"));
  assert.throws(() => exigirAutoridadSugerenciaCategoria({ ...tenant, permisos: [] }, configuracion), debeFallarCon("permission-denied"));
  assert.throws(() => exigirAutoridadSugerenciaCategoria(tenant, { ...configuracion, empresaId: "tenant-b" }), debeFallarCon("permission-denied"));
  assert.throws(() => exigirAutoridadSugerenciaCategoria(tenant, { ...configuracion, vertical: "GENERAL" }), debeFallarCon("permission-denied"));
  assert.throws(() => exigirAutoridadSugerenciaCategoria(tenant, { ...configuracion, modulos: { habilitados: [] } }), debeFallarCon("permission-denied"));
});

test("deniega antes de llamar al modelo y no escribe datos", async () => {
  let llamadasModelo = 0;
  await assert.rejects(
    sugerirCategoriasBodegaParaTenant(
      { items: [{ itemId: "1", nombre: "Vive 100" }] },
      { ...tenant, rol: "vendedor" },
      configuracion,
      async () => { llamadasModelo += 1; return { items: [] }; },
    ),
    debeFallarCon("permission-denied"),
  );
  assert.equal(llamadasModelo, 0);
  const respuesta = await sugerirCategoriasBodega(
    { items: [{ itemId: "1", nombre: "Vive 100" }] },
    async items => {
      llamadasModelo += 1;
      assert.deepEqual(items, [{ itemId: "1", nombre: "Vive 100" }]);
      return { items: [{ itemId: "1", categoriaId: "ENERGIZANTES", confianza: "ALTA", razon: "Bebida energizante." }] };
    },
  );
  assert.equal(llamadasModelo, 1);
  assert.deepEqual(respuesta.items[0], {
    itemId: "1", nombre: "Vive 100", categoriaId: "ENERGIZANTES", categoria: "Energizantes", confianza: "ALTA", razon: "Bebida energizante.",
  });
});

test("rechaza resultados del modelo incompletos, repetidos o fuera de la taxonomía", () => {
  const productos = [{ itemId: "1", nombre: "Light 330" }];
  assert.throws(() => validarRespuestaCategorias(productos, { items: [{ itemId: "1", categoriaId: "NO_AUTORIZADA", confianza: "ALTA", razon: "x" }] }), debeFallarCon("unavailable"));
  assert.throws(() => validarRespuestaCategorias(productos, { items: [] }), debeFallarCon("unavailable"));
  assert.throws(() => validarRespuestaCategorias(productos, { items: [
    { itemId: "1", categoriaId: "OTROS_REVISAR", confianza: "BAJA", razon: "Ambiguo." },
    { itemId: "1", categoriaId: "LICORES", confianza: "ALTA", razon: "Duplicado." },
  ] }), debeFallarCon("unavailable"));
  assert.throws(() => validarRespuestaCategorias(productos, { items: [{ itemId: "1", categoriaId: "OTROS_REVISAR", confianza: "BAJA", razon: "x", precio: 1 }] }), debeFallarCon("unavailable"));
  assert.throws(() => validarRespuestaCategorias(productos, { items: [{ itemId: "1", categoriaId: "OTROS_REVISAR", confianza: "BAJA", razon: "   " }] }), debeFallarCon("unavailable"));
});
