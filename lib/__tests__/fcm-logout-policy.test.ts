import assert from "node:assert/strict";
import test from "node:test";
import { debeRetirarTokenFcmAlCerrarSesion } from "../fcm-logout-policy";

test("logout manual retira el token push, logout por inactividad lo conserva", () => {
  assert.equal(debeRetirarTokenFcmAlCerrarSesion("MANUAL"), true);
  assert.equal(debeRetirarTokenFcmAlCerrarSesion("INACTIVIDAD"), false);
});
