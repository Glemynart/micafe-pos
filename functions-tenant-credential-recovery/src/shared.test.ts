import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarRestablecimientoOperadorTenant } from "../../functions/src/tenant-credential-recovery/handler";

const command = {
  commandId: "command-1",
  idempotencyKey: "idempotency-1",
  correlationId: "correlation-1",
  causationId: null,
  motivoCodigo: "TENANT_ADMIN_RESTABLECER_CREDENCIAL_OPERADOR",
};

test("rechaza una sesión ausente antes de resolver tenant", async () => {
  await assert.rejects(
    ejecutarRestablecimientoOperadorTenant({ data: { ...command, objetivoUid: "seller-1" } }, "pepper", {
      exigirTenant: async () => { throw new Error("NO_DEBE_EJECUTARSE"); },
    }),
    (error: unknown) => error instanceof HttpsError && error.code === "unauthenticated",
  );
});

test("rechaza actor no administrador sin emitir recuperación", async () => {
  let emitted = false;
  await assert.rejects(
    ejecutarRestablecimientoOperadorTenant({ auth: { uid: "seller-actor", token: {} }, data: { ...command, objetivoUid: "seller-1" } }, "pepper", {
      db: {},
      exigirTenant: async () => ({ id: "tenant-1", rol: "vendedor" }),
      solicitar: async () => { emitted = true; throw new Error("NO_DEBE_EJECUTARSE"); },
    }),
    (error: unknown) => error instanceof HttpsError && error.code === "permission-denied",
  );
  assert.equal(emitted, false);
});

test("deriva tenant y actor del servidor y revoca solo el UID resultante", async () => {
  let invocation: unknown;
  let revoked: string | null = null;
  const result = await ejecutarRestablecimientoOperadorTenant({
    auth: { uid: "admin-1", token: { empresaId: "cliente-no-confiable", rol: "admin" } },
    data: { ...command, objetivoUid: "seller-1", empresaId: "otro-tenant", rol: "admin" },
  }, "pepper", {
    db: { marker: "db" },
    exigirTenant: async () => ({ id: "tenant-canonico", rol: "admin" }),
    solicitar: async (...args: unknown[]) => {
      invocation = args;
      return { restablecimientoId: "reset-1", empresaId: "tenant-canonico", uid: "seller-1", estado: "PENDIENTE_ACTIVACION", codigo: "code", pinTemporal: "pin", idempotente: false };
    },
    revocarTokens: async (uid) => { revoked = uid; },
  });
  assert.equal(result.empresaId, "tenant-canonico");
  assert.equal(revoked, "seller-1");
  assert.deepEqual((invocation as unknown[]).slice(1, 5), [
    { tipo: "ADMIN_TENANT", uid: "admin-1", facultad: null },
    command,
    "tenant-canonico",
    "seller-1",
  ]);
});
