import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { autorizarPlataforma } from "./authorization";
import { crearManejadorConsultaOfertaComercial } from "./commercial-callable";

const VALID_CODE = "GATE_I_OFFER_1";

function request(data: unknown, uid = "commercial-contract-test", authenticated = true) {
  return {
    data,
    auth: authenticated
      ? { uid, token: { saas: { operador: true, versionAutorizacion: 1 } } }
      : null,
  } as CallableRequest<unknown>;
}

function handlerWith(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const readCodes: string[] = [];
  const handler = crearManejadorConsultaOfertaComercial({
    getFirestore: () => ({} as never),
    autorizar: async () => { events.push("authorize"); },
    exigirRuntime: () => { events.push("runtime"); },
    consultarOferta: async (_db, code) => {
      events.push("read");
      readCodes.push(code);
      return { code };
    },
    ...overrides,
  } as never);
  return { handler, events, readCodes };
}

test("consulta exige autenticación antes de acceder a dependencias", async () => {
  const state = handlerWith();

  await assert.rejects(
    state.handler(request({ codigoAprobacion: VALID_CODE }, "anonymous", false)),
    (error: unknown) => error instanceof HttpsError
      && error.code === "unauthenticated"
      && error.message === "AUTENTICACION_REQUERIDA",
  );
  assert.deepEqual(state.events, []);
});

test("consulta valida la forma exacta, el ASCII y el límite antes de leer ofertas", async () => {
  const invalidRequests = [
    { codigoAprobacion: VALID_CODE, empresaId: "tenant-ajeno" },
    { codigoAprobacion: VALID_CODE, ofertaId: "oferta-ajena" },
    { codigoAprobacion: "GATE_I_ÓFFER_1" },
    { codigoAprobacion: "A".repeat(65) },
  ];

  for (const data of invalidRequests) {
    const state = handlerWith();
    await assert.rejects(
      state.handler(request(data)),
      (error: unknown) => error instanceof HttpsError
        && error.code === "invalid-argument"
        && error.message === "OFERTA_COMERCIAL_INVALIDA",
    );
    assert.deepEqual(state.events, ["authorize"]);
    assert.deepEqual(state.readCodes, []);
  }
});

test("consulta admite 64 caracteres ASCII y autoriza antes del read de dominio", async () => {
  const code = "A".repeat(64);
  const state = handlerWith();

  assert.deepEqual(await state.handler(request({ codigoAprobacion: code })), { code });
  assert.deepEqual(state.events, ["authorize", "runtime", "read"]);
  assert.deepEqual(state.readCodes, [code]);
});

test("la denegación permanece cerrada si falla la escritura de auditoría", async () => {
  const uid = "commercial-audit-writer-failure";
  const events: string[] = [];
  const database = {
    collection(name: string) {
      assert.equal(name, "saas_operadores");
      return {
        doc(id: string) {
          assert.equal(id, uid);
          return {
            async get() {
              events.push("operator-read");
              return {
                exists: true,
                data: () => ({
                  uid,
                  estado: "ACTIVO",
                  facultades: ["PLATAFORMA_CONSULTAR"],
                  versionAutorizacion: 1,
                }),
              };
            },
          };
        },
      };
    },
    async runTransaction() {
      events.push("audit-write");
      throw new Error("audit store unavailable");
    },
  };
  let readCalled = false;
  const handler = crearManejadorConsultaOfertaComercial({
    getFirestore: () => database as never,
    autorizar: autorizarPlataforma,
    exigirRuntime: () => { events.push("runtime"); },
    consultarOferta: async () => {
      readCalled = true;
      return {};
    },
  } as never);

  await assert.rejects(
    handler(request({ codigoAprobacion: VALID_CODE }, uid)),
    (error: unknown) => error instanceof HttpsError
      && error.code === "permission-denied"
      && error.message === "PLATFORM_ACCESS_DENIED",
  );
  assert.deepEqual(events, ["operator-read", "audit-write"]);
  assert.equal(readCalled, false);
});

test("consulta traduce errores internos a un error estable sin rutas ni detalles", async () => {
  for (const thrown of [
    new Error("Firestore private/tenant/path SECRET_VALUE"),
    new HttpsError("internal", "private/tenant/path SECRET_VALUE", { token: "SECRET_VALUE" }),
  ]) {
    const state = handlerWith({
      consultarOferta: async () => { throw thrown; },
    });

    await assert.rejects(
      state.handler(request({ codigoAprobacion: VALID_CODE })),
      (error: unknown) => error instanceof HttpsError
        && error.code === "internal"
        && error.message === "OFERTA_COMERCIAL_LECTURA_ERROR"
        && error.details === undefined
        && !JSON.stringify(error).includes("SECRET_VALUE")
        && !JSON.stringify(error).includes("private/tenant/path"),
    );
  }
});

test("consulta no publica el error de precio persistido como invalid-argument del cliente", async () => {
  const state = handlerWith({
    consultarOferta: async () => {
      throw new HttpsError("invalid-argument", "OFERTA_COMERCIAL_PRECIO_INVALIDO");
    },
  });

  await assert.rejects(
    state.handler(request({ codigoAprobacion: VALID_CODE })),
    (error: unknown) => error instanceof HttpsError
      && error.code === "internal"
      && error.message === "OFERTA_COMERCIAL_LECTURA_ERROR",
  );
});

test("consulta conserva la precondición para precio persistido inconsistente", async () => {
  const state = handlerWith({
    consultarOferta: async () => {
      throw new HttpsError(
        "failed-precondition",
        "OFERTA_COMERCIAL_PRECIO_INVALIDO",
        { documentPath: "private/tenant/path" },
      );
    },
  });

  await assert.rejects(
    state.handler(request({ codigoAprobacion: VALID_CODE })),
    (error: unknown) => error instanceof HttpsError
      && error.code === "failed-precondition"
      && error.message === "OFERTA_COMERCIAL_PRECIO_INVALIDO"
      && error.details === undefined,
  );
});

test("consulta conserva errores de dominio conocidos sin propagar detalles internos", async () => {
  const state = handlerWith({
    consultarOferta: async () => {
      throw new HttpsError(
        "failed-precondition",
        "OFERTA_COMERCIAL_APROBACION_NOT_FOUND",
        { documentPath: "private/tenant/path" },
      );
    },
  });

  await assert.rejects(
    state.handler(request({ codigoAprobacion: "UNKNOWN_APPROVAL" })),
    (error: unknown) => error instanceof HttpsError
      && error.code === "failed-precondition"
      && error.message === "OFERTA_COMERCIAL_APROBACION_NOT_FOUND"
      && error.details === undefined,
  );
});
