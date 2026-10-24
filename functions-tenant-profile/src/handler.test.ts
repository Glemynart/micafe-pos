import assert from "node:assert/strict";
import test from "node:test";
import { HttpsError } from "firebase-functions/v2/https";
import { crearPlantillaConfiguracionRevision1, evaluarReadinessConfiguracion, perfilComercialCompleto, requierePasoPerfilComercialBodega } from "../../lib/configuracion";
import { ejecutarRegistrarPerfilComercialBodegaV1 } from "../../functions/src/tenant-profile/handler";

type Doc = Record<string, any>;

function harness(options: { rol?: string; vertical?: string; estado?: string } = {}) {
  const docs = new Map<string, Doc>();
  const writes: Array<{ method: string; path: string; data: Doc }> = [];
  const empresaId = "tenant-bodega";
  const config = crearPlantillaConfiguracionRevision1({
    empresaId,
    nombreComercial: "Bodega Demo",
    creadaEn: new Date("2026-01-01T00:00:00.000Z"),
    actualizadaEn: new Date("2026-01-01T00:00:00.000Z"),
    ultimaMutacion: { actorTipo: "SYSTEM", actorId: "bootstrap", origen: "BOOTSTRAP", commandId: "bootstrap-01", correlationId: "bootstrap-correlation" },
    vertical: (options.vertical ?? "BODEGA_MVP1") as "BODEGA_MVP1",
  });
  docs.set(`empresas/${empresaId}`, { id: empresaId, empresaId, estado: options.estado ?? "trial", paisFiscal: "CO", revision: 1, nombre: "Bodega Demo", nombreComercial: "Bodega Demo" });
  docs.set(`configuraciones/${empresaId}`, config as unknown as Doc);

  const docRef = (collection: string, id: string) => ({ collection, id, path: `${collection}/${id}` });
  const db = {
    collection: (collection: string) => ({
      doc: (id: string) => docRef(collection, id),
      where: () => ({ where: () => ({ limit: () => ({ collection, query: true }) }) }),
    }),
    runTransaction: async (operation: (tx: any) => Promise<unknown>) => {
      const pending: Array<{ method: string; path: string; data: Doc }> = [];
      const tx = {
        get: async (ref: { path?: string; query?: boolean }) => {
          if (ref.query) return { empty: true, docs: [] };
          const data = docs.get(ref.path!);
          return { exists: data !== undefined, data: () => data };
        },
        set: (ref: { path: string }, data: Doc) => pending.push({ method: "set", path: ref.path, data }),
        update: (ref: { path: string }, data: Doc) => pending.push({ method: "update", path: ref.path, data }),
        create: (ref: { path: string }, data: Doc) => pending.push({ method: "create", path: ref.path, data }),
      };
      const result = await operation(tx);
      for (const write of pending) {
        const actual = docs.get(write.path) ?? {};
        docs.set(write.path, write.method === "set" || write.method === "create" ? write.data : { ...actual, ...write.data });
        writes.push(write);
      }
      return result;
    },
  };

  return {
    empresaId,
    config,
    docs,
    writes,
    dependencies: {
      db,
      exigirTenant: async () => {
        if (options.estado && options.estado !== "trial" && options.estado !== "activa") throw new HttpsError("permission-denied", "Acceso denegado.");
        return { id: empresaId, rol: options.rol ?? "admin" };
      },
      leerConfiguracion: async () => ({ ...config, vertical: options.vertical ?? "BODEGA_MVP1" }),
    } as any,
  };
}

const request = (data: Doc = {}, tokenEmpresaId = "tenant-bodega") => ({
  auth: { uid: "admin-diana", token: { empresaId: tokenEmpresaId, rol: "admin" } },
  data: {
    nombreComercial: "Distribuidora Las Jiménez",
    razonSocial: "Distribuidora Las Jiménez S.A.S.",
    tipoPersona: "JURIDICA",
    nit: "900373913",
    digitoVerificacion: "4",
    email: "contacto@example.com",
    telefono: "+573001234567",
    direccion: "Calle 1 # 2-3",
    departamentoCodigo: "11",
    departamentoNombre: "Bogotá D.C.",
    municipioCodigo: "11001",
    municipioNombre: "Bogotá",
    expectedRevision: 1,
    commandId: "profile-command-01",
    idempotencyKey: "profile-idempotency-01",
    correlationId: "profile-correlation-01",
    ...data,
  },
});

const requestParcial = (campos: Doc, data: Doc = {}) => ({
  auth: { uid: "admin-diana", token: { empresaId: "tenant-bodega", rol: "admin" } },
  data: {
    ...campos,
    expectedRevision: 1,
    commandId: "profile-draft-command-01",
    idempotencyKey: "profile-draft-idempotency-01",
    correlationId: "profile-draft-correlation-01",
    ...data,
  },
});

test("guarda el perfil comercial en la configuración canónica y sincroniza Empresa en una transacción", async () => {
  const h = harness();
  const resultado = await ejecutarRegistrarPerfilComercialBodegaV1(request(), h.dependencies);

  assert.deepEqual(resultado, { revision: 2, idempotente: false });
  const actual = h.docs.get("configuraciones/tenant-bodega")! as ReturnType<typeof crearPlantillaConfiguracionRevision1>;
  assert.equal(actual.identidadFiscal.nombreComercial, "Distribuidora Las Jiménez");
  assert.equal(actual.identidadFiscal.razonSocial, "Distribuidora Las Jiménez S.A.S.");
  assert.equal(actual.identidadFiscal.tipoDocumento, "NIT");
  assert.equal(actual.identidadFiscal.numeroDocumento, "900373913");
  assert.equal(actual.identidadFiscal.digitoVerificacion, "4");
  assert.equal(actual.identidadFiscal.regimenTributario, undefined);
  assert.equal(actual.identidadFiscal.actividadEconomicaPrincipal, undefined);
  assert.equal(actual.localizacion.direccion.municipioCodigo, "11001");
  assert.equal(perfilComercialCompleto(actual), true);
  assert.equal(h.docs.get("empresas/tenant-bodega")!.nombre, "Distribuidora Las Jiménez");
  assert.equal(h.docs.get("empresas/tenant-bodega")!.nombreComercial, "Distribuidora Las Jiménez");
  assert.equal(h.docs.get("empresas/tenant-bodega")!.revision, 2);
  assert.equal(h.docs.get("empresas/tenant-bodega")!.estado, "trial");
  assert.equal(evaluarReadinessConfiguracion(actual).fiscal.lista, false);
  assert.equal(h.writes.some(({ path }) => path.startsWith("suscripciones/") || path.startsWith("ventas/")), false);
  const audit = h.docs.get(h.writes.find(({ path }) => path.startsWith("auditoria_logs/"))!.path)!;
  assert.equal(JSON.stringify(audit).includes("900373913"), false);
  assert.equal(JSON.stringify(audit).includes("contacto@example.com"), false);
  assert.equal(JSON.stringify(audit).includes("Calle 1"), false);
});

test("guarda un avance parcial y permite completar el perfil en una sesión posterior", async () => {
  const h = harness();
  const avance = await ejecutarRegistrarPerfilComercialBodegaV1(
    requestParcial({ nombreComercial: "Distribuidora Las Jiménez" }),
    h.dependencies,
  );

  assert.deepEqual(avance, { revision: 2, idempotente: false });
  const configParcial = h.docs.get("configuraciones/tenant-bodega")! as ReturnType<typeof crearPlantillaConfiguracionRevision1>;
  assert.equal(configParcial.identidadFiscal.nombreComercial, "Distribuidora Las Jiménez");
  assert.equal(configParcial.identidadFiscal.razonSocial, undefined);
  assert.equal(perfilComercialCompleto(configParcial), false);
  assert.equal(h.docs.get("empresas/tenant-bodega")!.nombre, "Distribuidora Las Jiménez");
  assert.equal(h.docs.get("empresas/tenant-bodega")!.revision, 2);
  assert.equal(h.docs.get("empresas/tenant-bodega")!.estado, "trial");

  const reanudado = await ejecutarRegistrarPerfilComercialBodegaV1(request({
    expectedRevision: 2,
    commandId: "profile-resume-command-01",
    idempotencyKey: "profile-resume-idempotency-01",
    correlationId: "profile-resume-correlation-01",
  }), h.dependencies);

  assert.deepEqual(reanudado, { revision: 3, idempotente: false });
  const configCompleta = h.docs.get("configuraciones/tenant-bodega")! as ReturnType<typeof crearPlantillaConfiguracionRevision1>;
  assert.equal(perfilComercialCompleto(configCompleta), true);
  assert.equal(configCompleta.identidadFiscal.razonSocial, "Distribuidora Las Jiménez S.A.S.");
  assert.equal(h.docs.get("empresas/tenant-bodega")!.revision, 2);
  assert.equal(h.writes.filter(({ path }) => path === "empresas/tenant-bodega").length, 1);
  assert.equal(h.writes.some(({ path }) => path.startsWith("suscripciones/") || path.startsWith("ventas/")), false);
});

test("rechaza un avance vacío o un NIT sin dígito de verificación", async () => {
  const vacio = harness();
  await assert.rejects(
    () => ejecutarRegistrarPerfilComercialBodegaV1(requestParcial({}), vacio.dependencies),
    (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument",
  );
  assert.equal(vacio.writes.length, 0);

  const nitIncompleto = harness();
  await assert.rejects(
    () => ejecutarRegistrarPerfilComercialBodegaV1(requestParcial({ nit: "900373913" }), nitIncompleto.dependencies),
    (error: unknown) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "invalid-argument");
      assert.deepEqual(error.details, { campos: ["nit", "digitoVerificacion"] });
      return true;
    },
  );
  assert.equal(nitIncompleto.writes.length, 0);
});

test("el paso inicial solo intercepta admins activos del tenant Bodega incompleto", () => {
  const config = harness().config;
  const entrada = { vertical: "BODEGA_MVP1" as const, usuarioRol: "admin", membresiaRol: "admin", membresiaActiva: true, empresaCoincide: true, configuracion: config };
  assert.equal(requierePasoPerfilComercialBodega(entrada), true);
  assert.equal(requierePasoPerfilComercialBodega({ ...entrada, usuarioRol: "vendedor" }), false);
  assert.equal(requierePasoPerfilComercialBodega({ ...entrada, membresiaRol: "vendedor" }), false);
  assert.equal(requierePasoPerfilComercialBodega({ ...entrada, vertical: "GENERAL" }), false);
  assert.equal(requierePasoPerfilComercialBodega({ ...entrada, membresiaActiva: false }), false);
  const completo = { ...config, identidadFiscal: { ...config.identidadFiscal, razonSocial: "Bodega Demo SAS", tipoPersona: "JURIDICA" as const, tipoDocumento: "NIT", numeroDocumento: "900373913", digitoVerificacion: "4", contacto: { email: "contacto@example.com", telefono: "+573001234567" } }, localizacion: { ...config.localizacion, direccion: { linea1: "Calle 1 # 2-3", departamentoCodigo: "11", departamentoNombre: "Bogotá D.C.", municipioCodigo: "11001", municipioNombre: "Bogotá" } } };
  assert.equal(requierePasoPerfilComercialBodega({ ...entrada, configuracion: completo }), false);
});

test("usa el tenant autenticado e ignora empresaId controlado por el cliente", async () => {
  const h = harness();
  const result = await ejecutarRegistrarPerfilComercialBodegaV1(request({ empresaId: "otro-tenant" }, "tenant-bodega"), h.dependencies);

  assert.equal(result.revision, 2);
  assert.equal(h.docs.get("configuraciones/tenant-bodega")!.identidadFiscal.razonSocial, "Distribuidora Las Jiménez S.A.S.");
  assert.equal(h.docs.has("configuraciones/otro-tenant"), false);
});

test("solo permite admin Bodega en empresa trial/activa", async () => {
  await assert.rejects(() => ejecutarRegistrarPerfilComercialBodegaV1(request(), harness({ rol: "vendedor" }).dependencies), (error: unknown) => error instanceof HttpsError && error.code === "permission-denied");
  await assert.rejects(() => ejecutarRegistrarPerfilComercialBodegaV1(request(), harness({ vertical: "RESTAURANTE" }).dependencies), (error: unknown) => error instanceof HttpsError && error.code === "permission-denied");
  await assert.rejects(() => ejecutarRegistrarPerfilComercialBodegaV1(request(), harness({ estado: "suspendida" }).dependencies), (error: unknown) => error instanceof HttpsError && error.code === "permission-denied");
});

test("rechaza solicitudes no autenticadas, payloads desconocidos y envelopes inválidos", async () => {
  const h = harness();
  const validData = request().data;
  await assert.rejects(
    () => ejecutarRegistrarPerfilComercialBodegaV1({ data: validData } as any, h.dependencies),
    (error: unknown) => error instanceof HttpsError && error.code === "unauthenticated",
  );

  const invalidPayloads = [
    null,
    [],
    { ...validData, extra: "no permitido" },
    { ...validData, tipoPersona: "EMPRESA" },
    { ...validData, expectedRevision: 1.5 },
    { ...validData, expectedRevision: 0 },
    { ...validData, commandId: "corto" },
    { ...validData, idempotencyKey: "con espacios" },
    { ...validData, correlationId: "x".repeat(129) },
  ];
  for (const data of invalidPayloads) {
    await assert.rejects(
      () => ejecutarRegistrarPerfilComercialBodegaV1({ ...request(), data } as any, h.dependencies),
      (error: unknown) => error instanceof HttpsError && error.code === "invalid-argument",
    );
  }
  assert.equal(h.writes.length, 0);
});

test("rechaza configuración o empresa ausentes, revisión de Empresa inválida y vertical divergente", async () => {
  const sinConfiguracion = harness();
  sinConfiguracion.docs.delete("configuraciones/tenant-bodega");
  await assert.rejects(() => ejecutarRegistrarPerfilComercialBodegaV1(request(), sinConfiguracion.dependencies), /PERFIL_COMERCIAL_NO_DISPONIBLE/);

  const sinEmpresa = harness();
  sinEmpresa.docs.delete("empresas/tenant-bodega");
  await assert.rejects(() => ejecutarRegistrarPerfilComercialBodegaV1(request(), sinEmpresa.dependencies), /PERFIL_COMERCIAL_NO_DISPONIBLE/);

  const revisionInvalida = harness();
  revisionInvalida.docs.get("empresas/tenant-bodega")!.revision = 0;
  await assert.rejects(() => ejecutarRegistrarPerfilComercialBodegaV1(request(), revisionInvalida.dependencies), /EMPRESA_REVISION_INVALIDA/);

  const verticalDivergente = harness();
  verticalDivergente.docs.get("configuraciones/tenant-bodega")!.vertical = "GENERAL";
  await assert.rejects(() => ejecutarRegistrarPerfilComercialBodegaV1(request(), verticalDivergente.dependencies), (error: unknown) => error instanceof HttpsError && error.code === "permission-denied");
});

test("rechaza identidad incompleta y NIT/DV no canónicos sin escribir", async () => {
  const casos = [
    { data: { razonSocial: "" }, campos: ["razonSocial"] },
    { data: { nit: "900373913", digitoVerificacion: "9" }, campos: ["nit", "digitoVerificacion"] },
    { data: { email: "EMAIL-INVALIDO" }, campos: ["email"] },
    { data: { telefono: "3001234567" }, campos: ["telefono"] },
    { data: { municipioCodigo: "12001" }, campos: ["departamentoCodigo", "municipioCodigo"] },
    { data: { direccion: "x".repeat(121) }, campos: ["direccion"] },
    { data: { departamentoNombre: " " }, campos: ["departamentoNombre"] },
    { data: { municipioNombre: "x".repeat(101) }, campos: ["municipioNombre"] },
  ];
  for (const caso of casos) {
    const h = harness();
    await assert.rejects(() => ejecutarRegistrarPerfilComercialBodegaV1(request(caso.data), h.dependencies), (error: unknown) => {
      assert.ok(error instanceof HttpsError);
      assert.equal(error.code, "invalid-argument");
      assert.deepEqual((error as HttpsError).details, { campos: caso.campos });
      assert.equal(JSON.stringify((error as HttpsError).details).includes("900373913"), false);
      assert.equal(JSON.stringify((error as HttpsError).details).includes("EMAIL-INVALIDO"), false);
      return true;
    });
    assert.equal(h.writes.length, 0);
  }
});

test("no vuelve a solicitar un perfil comercial ya completo con un comando nuevo", async () => {
  const h = harness();
  const config = h.docs.get("configuraciones/tenant-bodega")!;
  Object.assign(config.identidadFiscal, {
    razonSocial: "Bodega Demo S.A.S.",
    tipoPersona: "JURIDICA",
    tipoDocumento: "NIT",
    numeroDocumento: "900373913",
    digitoVerificacion: "4",
    contacto: { email: "contacto@example.com", telefono: "+573001234567" },
  });
  Object.assign(config.localizacion.direccion, {
    linea1: "Calle 1 # 2-3",
    departamentoCodigo: "11",
    departamentoNombre: "Bogotá D.C.",
    municipioCodigo: "11001",
    municipioNombre: "Bogotá",
  });

  await assert.rejects(
    () => ejecutarRegistrarPerfilComercialBodegaV1(request({ commandId: "profile-command-02", idempotencyKey: "profile-idempotency-02", correlationId: "profile-correlation-02" }), h.dependencies),
    /PERFIL_COMERCIAL_YA_COMPLETO/,
  );
  assert.equal(h.writes.length, 0);
});

test("usa revisión e idempotencia canónicas y no duplica la revisión de Empresa al repetir", async () => {
  const h = harness();
  const input = request();
  const first = await ejecutarRegistrarPerfilComercialBodegaV1(input, h.dependencies);
  const replay = await ejecutarRegistrarPerfilComercialBodegaV1(input, h.dependencies);

  assert.deepEqual(first, { revision: 2, idempotente: false });
  assert.deepEqual(replay, { revision: 2, idempotente: true });
  assert.equal(h.docs.get("empresas/tenant-bodega")!.revision, 2);
  assert.equal(h.writes.filter(({ path }) => path === "empresas/tenant-bodega").length, 1);
  await assert.rejects(() => ejecutarRegistrarPerfilComercialBodegaV1(request({ expectedRevision: 1, commandId: "profile-command-02", idempotencyKey: "profile-idempotency-02", correlationId: "profile-correlation-02" }), h.dependencies), /CONFIG_REVISION_CONFLICT/);
});
