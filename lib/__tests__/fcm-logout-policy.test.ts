import assert from "node:assert/strict";
import test from "node:test";
import { debeRetirarTokenFcmAlCerrarSesion } from "../fcm-logout-policy";

test("logout manual siempre retira token y solo el timeout del admin lo conserva", () => {
  assert.equal(debeRetirarTokenFcmAlCerrarSesion("MANUAL", true), true);
  assert.equal(debeRetirarTokenFcmAlCerrarSesion("MANUAL"), true);
  assert.equal(debeRetirarTokenFcmAlCerrarSesion("INACTIVIDAD", true), false);
  assert.equal(debeRetirarTokenFcmAlCerrarSesion("INACTIVIDAD"), true);
});
