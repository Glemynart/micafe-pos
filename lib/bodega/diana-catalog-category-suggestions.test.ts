import assert from "node:assert/strict";
import test from "node:test";
import {
  CATEGORIAS_CATALOGO_DIANA,
  sugerirCategoriaCatalogoDiana,
} from "./diana-catalog-category-suggestions";

test("covers the 17 categories and the examples Diana supplied", () => {
  const examples: Array<[string, string]> = [
    ["Agua Pool", "AGUA_EMBOTELLADA"],
    ["Cielo", "AGUA_EMBOTELLADA"],
    ["Cristal", "AGUA_EMBOTELLADA"],
    ["Agua de coco 400 ml", "AGUA_DE_COCO"],
    ["Aguardiente Amarillo de Manzanares", "AGUARDIENTES"],
    ["Antioqueño", "AGUARDIENTES"],
    ["Águila", "CERVEZAS_NACIONALES"],
    ["Póker", "CERVEZAS_NACIONALES"],
    ["Club Colombia", "CERVEZAS_NACIONALES"],
    ["Corona", "CERVEZAS_IMPORTADAS"],
    ["Corona tradicional", "CERVEZAS_IMPORTADAS"],
    ["Coronita", "CERVEZAS_IMPORTADAS"],
    ["Budweiser", "CERVEZAS_IMPORTADAS"],
    ["Corona Cero", "CERVEZAS_SIN_ALCOHOL"],
    ["Bretaña", "SODAS_Y_AGUA_TONICA"],
    ["Canada Dry", "SODAS_Y_AGUA_TONICA"],
    ["Coca-Cola", "GASEOSAS"],
    ["Big Cola", "GASEOSAS"],
    ["Postobón", "GASEOSAS"],
    ["Quatro", "GASEOSAS"],
    ["Hit", "JUGOS_Y_NECTARES"],
    ["Del Valle", "JUGOS_Y_NECTARES"],
    ["Cifrut", "JUGOS_Y_NECTARES"],
    ["Nutiva", "JUGOS_Y_NECTARES"],
    ["Gatorade", "HIDRATANTES_Y_ELECTROLITOS"],
    ["Sporade", "HIDRATANTES_Y_ELECTROLITOS"],
    ["Electrolit", "HIDRATANTES_Y_ELECTROLITOS"],
    ["Hidralyte", "HIDRATANTES_Y_ELECTROLITOS"],
    ["Vive 100", "BEBIDAS_ENERGIZANTES"],
    ["Speed Max", "BEBIDAS_ENERGIZANTES"],
    ["Malta", "BEBIDAS_DE_MALTA"],
    ["Cola y Pola", "BEBIDAS_BASE_CERVEZA_MALTA"],
    ["Ron Caldas", "RON"],
    ["Smirnoff Vodka", "VODKA"],
    ["Smirnoff Vodka tradicional", "VODKA"],
    ["Reeds", "COCTELES_PREPARADOS"],
    ["Saviloe", "BEBIDAS_DE_ALOE_VERA"],
  ];

  assert.equal(Object.keys(CATEGORIAS_CATALOGO_DIANA).length, 17);
  for (const [name, expected] of examples) {
    const suggestion = sugerirCategoriaCatalogoDiana(name);
    assert.equal(suggestion.estado, "SUGERIDA", name);
    assert.equal(suggestion.categoriaId, expected, name);
  }
});

test("prefers the most specific Colombian product rule", () => {
  assert.equal(sugerirCategoriaCatalogoDiana("Cerveza Corona Cero lata").categoriaId, "CERVEZAS_SIN_ALCOHOL");
  assert.equal(sugerirCategoriaCatalogoDiana("Smirnoff Vodka tradicional").categoriaId, "VODKA");
  assert.equal(sugerirCategoriaCatalogoDiana("Corona tradicional").categoriaId, "CERVEZAS_IMPORTADAS");
});

test("classifies Smirnoff Tamarindo as vodka after the explicit category decision", () => {
  assert.equal(sugerirCategoriaCatalogoDiana("Smirnoff Tamarindo Picante").categoriaId, "VODKA");
  assert.equal(sugerirCategoriaCatalogoDiana("Smirnoff Tamarindo saborizado").categoriaId, "VODKA");
});

test("normalizes accents and punctuation and leaves unknown names for review", () => {
  assert.equal(sugerirCategoriaCatalogoDiana("AGUILA 330-ML").categoriaId, "CERVEZAS_NACIONALES");
  assert.equal(sugerirCategoriaCatalogoDiana("Bebida nueva importada").estado, "REVISAR");
  assert.equal(sugerirCategoriaCatalogoDiana(" ").estado, "REVISAR");
});

test("does not classify on a partial brand substring", () => {
  const suggestion = sugerirCategoriaCatalogoDiana("Cristalino de coco");
  assert.equal(suggestion.estado, "REVISAR");
});
