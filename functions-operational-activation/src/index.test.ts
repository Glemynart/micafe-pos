import assert from "node:assert/strict";
import { test } from "node:test";
import { activarIncorporacionDirecta } from "./index";

test("rechaza ausencia de Auth sin consultar dominio", async () => {
  await assert.rejects(
    () => activarIncorporacionDirecta.run({ auth: null, data: { pinActual: "123456", pinNuevo: "654321" } } as never),
    { code: "permission-denied" },
  );
});

test("rechaza un authStage que no sea DIRECTA_TEMP sin consultar dominio", async () => {
  await assert.rejects(
    () => activarIncorporacionDirecta.run({ auth: { uid: "uid", token: { authStage: "OPERATIVO", incorporacionId: "inc-1" } }, data: { pinActual: "123456", pinNuevo: "654321" } } as never),
    { code: "permission-denied" },
  );
});
