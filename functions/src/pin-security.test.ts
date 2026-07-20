import assert from "node:assert/strict";
import test from "node:test";
import { hashearPin, verificarPin } from "./pin-security";

test("el hash del PIN exige el mismo pepper y PIN", async () => {
  const hash = await hashearPin("123456", "pepper-de-prueba");
  assert.equal(await verificarPin("123456", hash, "pepper-de-prueba"), true);
  assert.equal(await verificarPin("654321", hash, "pepper-de-prueba"), false);
  assert.equal(await verificarPin("123456", hash, "otro-pepper"), false);
});
