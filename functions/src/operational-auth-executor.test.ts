import assert from "node:assert/strict";
import { test } from "node:test";
import { hashearPin } from "./pin-security";
import { ejecutarAutenticacionOperativa } from "./operational-auth-executor";

type DiagnosticEvent = { message: string; data: Record<string, unknown> };

function createLogger(): { events: DiagnosticEvent[]; error: (message: string, data?: Record<string, unknown>) => void } {
  const events: DiagnosticEvent[] = [];
  return {
    events,
    error: (message, data = {}) => events.push({ message, data }),
  };
}

async function createDependencies(failingOperation: "getUser" | "setCustomUserClaims" | "createCustomToken") {
  const pepper = "diagnostic-pepper";
  const pin = "123456";
  const codigo = "diag-admin";
  const uid = "diag-uid";
  const empresaId = "diag-empresa";
  const incorporacionId = "diag-incorporacion";
  const diagnosticLogger = createLogger();
  const pinHash = await hashearPin(pin, pepper);
  const credentialData = {
    activo: true,
    codigo,
    empresaId,
    uid,
    pinHash,
    requiereCambio: true,
    incorporacionId,
    fallosConsecutivos: 0,
    bloqueadoHasta: null,
  };
  const credentialRef = {
    async get() {
      return { data: () => ({ bloqueadoHasta: null }) };
    },
    async update() {
      return undefined;
    },
  };
  const credentialSnap = {
    ref: credentialRef,
    data: () => credentialData,
  };
  const companySnap = {
    id: empresaId,
    exists: true,
    data: () => ({ estado: "trial" }),
  };
  const incorporationSnap = {
    id: incorporacionId,
    exists: true,
    data: () => ({
      empresaId,
      uid,
      codigo,
      mecanismo: "DIRECTA",
      estado: "TEMP_CREDENTIAL",
    }),
  };
  const db = {
    collection(name: string) {
      if (name === "credenciales_operativas") {
        return { where: () => ({ get: async () => ({ docs: [credentialSnap] }) }) };
      }
      if (name === "empresas") {
        return { doc: () => ({ get: async () => companySnap }) };
      }
      if (name === "incorporaciones") {
        return { doc: () => ({ get: async () => incorporationSnap }) };
      }
      throw new Error(`Unexpected collection ${name}`);
    },
  };
  const auth = {
    async getUser() {
      if (failingOperation === "getUser") throw Object.assign(new Error("token=diagnostic-token pin=123456"), { code: "PERMISSION_DENIED" });
      return { customClaims: { saas: { operador: false } } };
    },
    async setCustomUserClaims() {
      if (failingOperation === "setCustomUserClaims") throw Object.assign(new Error("secret=diagnostic-secret"), { code: "AUTH_FAILURE" });
    },
    async createCustomToken() {
      if (failingOperation === "createCustomToken") throw Object.assign(new Error("Bearer diagnostic-token"), { code: "IAM_FAILURE" });
      return "diagnostic-custom-token";
    },
  };
  return { dependencies: { db, auth, pepper, diagnosticLogger }, diagnosticLogger, request: { codigo, pin } };
}

for (const [failingOperation, expectedOperation] of [
  ["getUser", "auth.getUser"],
  ["setCustomUserClaims", "auth.setCustomUserClaims"],
  ["createCustomToken", "auth.createCustomToken"],
] as const) {
  test(`identifica el fallo de ${expectedOperation} sin cambiar el error público`, async () => {
    const { dependencies, diagnosticLogger, request } = await createDependencies(failingOperation);

    await assert.rejects(
      () => ejecutarAutenticacionOperativa(request, dependencies),
      (error: unknown) => {
        assert.equal((error as { code?: string }).code, "unauthenticated");
        return true;
      },
    );

    const stepFailure = diagnosticLogger.events.find((event) => event.message === "operational_auth_step_failed");
    assert.ok(stepFailure);
    assert.equal(stepFailure.data.operation, expectedOperation);
    assert.equal(typeof stepFailure.data.errorName, "string");
    assert.equal(typeof stepFailure.data.errorCode, "string");
    assert.equal(typeof stepFailure.data.errorMessage, "string");
    const serialized = JSON.stringify(stepFailure.data);
    assert.equal(serialized.includes("diagnostic-token"), false);
    assert.equal(serialized.includes("diagnostic-secret"), false);
    assert.equal(serialized.includes("123456"), false);
  });
}
