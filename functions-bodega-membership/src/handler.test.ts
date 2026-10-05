import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { ejecutarActualizarMembresiaBodegaV1 } from "../../functions/src/bodega-membership/handler";

const command = (overrides: Record<string, unknown> = {}) => ({
  objetivoUid: "vendedor-01",
  estado: "inactiva",
  commandId: "command-0001",
  idempotencyKey: "idempotency-0001",
  correlationId: "correlation-0001",
  causationId: null,
  motivoCodigo: "TENANT_ADMIN_ACTUALIZAR_MEMBRESIA_BODEGA",
  ...overrides,
});

function request(data: unknown, uid = "admin-0001") { return { auth: { uid, token: { empresaId: "empresa", rol: "admin" } }, data }; }

function dependencies(
  member: Record<string, unknown> = { empresaId: "empresa", uid: "vendedor-01", rol: "vendedor", estado: "activa", activo: true },
  initialClaims: Record<string, unknown> = { empresaId: "empresa" },
) {
  const updates: unknown[] = [];
  const obligations = new Map<string, Record<string, any>>();
  const audits: unknown[] = [];
  const claims: unknown[] = [];
  let authClaims = initialClaims;
  const ref = (collection: string, id: string) => ({ collection, id });
  const db = {
    collection: (collection: string) => ({ doc: (id: string) => ref(collection, id) }),
    runTransaction: async (operation: (tx: any) => unknown) => operation({
      get: async (target: { collection: string; id: string }) => {
        const data = target.collection === "membresias" ? member : obligations.get(target.id);
        return { exists: !!data, data: () => data };
      },
      update: (target: { collection: string }, data: Record<string, unknown>) => {
        if (target.collection === "membresias") { Object.assign(member, data); updates.push(data); }
        else obligations.set(target.id, { ...(obligations.get(target.id) ?? {}), ...data });
      },
      create: (target: { id: string }, data: Record<string, unknown>) => obligations.set(target.id, data),
    }),
  };
  return {
    updates, obligations, audits, claims, db,
    get authClaims() { return authClaims; },
    exigirTenant: async () => ({ id: "empresa", rol: "admin" }),
    leerConfiguracion: async () => ({ vertical: "BODEGA_MVP1" }),
    auth: { getUser: async () => ({ customClaims: authClaims }) },
    actualizarClaims: async (...args: unknown[]) => {
      claims.push(args);
      const [, empresaId, rol, actuales] = args as [string, string, "vendedor" | null, Record<string, unknown>];
      const saas = actuales.saas && typeof actuales.saas === "object" ? { saas: actuales.saas } : {};
      authClaims = rol ? { ...saas, empresaId, rol } : saas;
    },
    crearObligacion: (_db: unknown, tx: any, hecho: Record<string, unknown>, ids: { obligacionId: string; evidenciaId: string }) => {
      tx.create(ref("saas_auditoria_obligaciones", ids.obligacionId), { evidencia: { ...hecho } });
      audits.push({ hecho, ids });
      return ids;
    },
    emitirObligacion: async (_db: unknown, obligacionId: string) => { audits.push({ emitted: obligacionId }); },
  } as any;
}

test("restaura claims ausentes al reactivar y re-sincroniza replay sin duplicar auditoría", async () => {
  const d = dependencies();
  const desactivar = command({
    estado: "inactiva",
    commandId: "command-deactivate",
    idempotencyKey: "idempotency-deactivate",
    correlationId: "correlation-deactivate",
  });
  const activar = command({
    estado: "activa",
    commandId: "command-activate",
    idempotencyKey: "idempotency-activate",
    correlationId: "correlation-activate",
  });

  await ejecutarActualizarMembresiaBodegaV1(request(desactivar), d);
  assert.deepEqual(d.authClaims, {});

  await ejecutarActualizarMembresiaBodegaV1(request(activar), d);
  assert.deepEqual(d.authClaims, { empresaId: "empresa", rol: "vendedor" });

  await ejecutarActualizarMembresiaBodegaV1(request(activar), d);
  assert.deepEqual(d.authClaims, { empresaId: "empresa", rol: "vendedor" });
  assert.equal(d.updates.length, 2);
  assert.equal(d.obligations.size, 2);
  assert.equal(d.audits.filter((entry: Record<string, unknown>) => "emitted" in entry).length, 3);
  assert.equal(d.claims.length, 3);
});

test("no reemplaza claims que apuntan a otro tenant incluso al activar", async () => {
  const claimsOtroTenant = { empresaId: "otro-tenant", rol: "vendedor", saas: { soporte: true } };
  const d = dependencies(undefined, claimsOtroTenant);
  await ejecutarActualizarMembresiaBodegaV1(request(command({ estado: "activa" })), d);
  assert.deepEqual(d.authClaims, claimsOtroTenant);
  assert.equal(d.claims.length, 0);
});

test("rechaza payload con autoridad aportada por cliente", async () => {
  await assert.rejects(
    () => ejecutarActualizarMembresiaBodegaV1(request(command({ empresaId: "otra" })), dependencies()),
    (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument",
  );
});

test("exige autenticación y autoridad administrativa Bodega", async () => {
  await assert.rejects(
    () => ejecutarActualizarMembresiaBodegaV1({ data: command() }, dependencies()),
    (error: unknown) => error instanceof HttpsError && error.code === "unauthenticated",
  );
  const sinAdmin = dependencies();
  sinAdmin.exigirTenant = async () => ({ id: "empresa", rol: "vendedor" });
  await assert.rejects(
    () => ejecutarActualizarMembresiaBodegaV1(request(command()), sinAdmin),
    (error: unknown) => error instanceof HttpsError && error.code === "permission-denied",
  );
  const verticalAjeno = dependencies();
  verticalAjeno.leerConfiguracion = async () => ({ vertical: "RESTAURANTE" });
  await assert.rejects(
    () => ejecutarActualizarMembresiaBodegaV1(request(command()), verticalAjeno),
    (error: unknown) => error instanceof HttpsError && error.code === "permission-denied",
  );
});

test("no permite cambiar una membresía de otro tenant", async () => {
  await assert.rejects(
    () => ejecutarActualizarMembresiaBodegaV1(request(command()), dependencies({ empresaId: "otra-empresa", uid: "vendedor-01", rol: "vendedor", estado: "activa", activo: true })),
    (error: unknown) => error instanceof HttpsError && error.code === "not-found",
  );
});

test("rechaza un objetivo que no es vendedor", async () => {
  await assert.rejects(
    () => ejecutarActualizarMembresiaBodegaV1(request(command()), dependencies({ empresaId: "empresa", uid: "vendedor-01", rol: "admin", estado: "activa", activo: true })),
    (error: unknown) => error instanceof HttpsError && error.code === "permission-denied",
  );
});

test("actualiza, audita y revoca los claims del vendedor del mismo tenant", async () => {
  const d = dependencies();
  await ejecutarActualizarMembresiaBodegaV1(request(command()), d);
  assert.equal(d.updates.length, 1);
  assert.deepEqual((d.updates[0] as Record<string, unknown>).estado, "inactiva");
  assert.equal(d.audits.length, 2);
  assert.equal(d.audits[0].hecho.tipo, "MEMBRESIA_BODEGA_ESTADO_ACTUALIZADO");
  assert.deepEqual(d.claims[0], ["vendedor-01", "empresa", null, { empresaId: "empresa" }]);
});

test("el replay no duplica estado ni evidencia", async () => {
  const d = dependencies();
  const input = command();
  await ejecutarActualizarMembresiaBodegaV1(request(input), d);
  await ejecutarActualizarMembresiaBodegaV1(request(input), d);
  assert.equal(d.updates.length, 1);
  assert.equal([...d.obligations.values()].length, 1);
  assert.equal(d.audits.filter((entry: Record<string, unknown>) => "emitted" in entry).length, 2);
});

test("rechaza reutilizar un commandId con contenido distinto", async () => {
  const d = dependencies();
  await ejecutarActualizarMembresiaBodegaV1(request(command()), d);
  await assert.rejects(
    () => ejecutarActualizarMembresiaBodegaV1(request(command({ estado: "activa" })), d),
    (error: unknown) => error instanceof HttpsError && error.code === "already-exists",
  );
  assert.equal(d.updates.length, 1);
});
