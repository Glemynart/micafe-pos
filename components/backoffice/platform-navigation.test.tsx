import assert from "node:assert/strict";
import test from "node:test";
import { obtenerNavegacionVisible, navegacionPlataforma } from "./platform-navigation";

test("ofrece la ruta de ofertas en cualquier entorno al operador comercial autorizado", () => {
  const items = obtenerNavegacionVisible((facultad) => facultad === "COMERCIAL_GOBERNAR");
  const ofertas = items.find((item) => item.href === "/backoffice/ofertas");

  assert.equal(ofertas?.label, "Ofertas comerciales");
});

test("oculta ofertas comerciales cuando el operador carece de COMERCIAL_GOBERNAR", () => {
  const items = obtenerNavegacionVisible(() => false);

  assert.equal(items.some((item) => item.href === "/backoffice/ofertas"), false);
});

test("la navegación no condiciona ofertas al proyecto de Firebase", () => {
  const ofertas = navegacionPlataforma.find((item) => item.href === "/backoffice/ofertas");

  assert.equal(ofertas?.facultad, "COMERCIAL_GOBERNAR");
  assert.equal("stagingOnly" in (ofertas ?? {}), false);
});
