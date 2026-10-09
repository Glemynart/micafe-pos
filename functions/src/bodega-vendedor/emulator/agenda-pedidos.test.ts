import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  ejecutarCancelarProgramacionPedidoBodegaV1,
  ejecutarConsultarAgendaPedidosBodegaV1,
  ejecutarConvertirProgramacionPedidoBodegaV1,
  ejecutarCrearProgramacionPedidoBodegaV1,
  ejecutarResolverProgramacionPedidoBodegaV1,
} from "../agenda-pedidos";
import { ejecutarResolverSolicitudVentaBodegaV1 } from "../solicitudes-venta";
import { ejecutarConfirmarVentaBodegaV1 } from "../ventas-confirmation";
import { crearIdentificadorInterno } from "../../turnos/identificadores";
import { exigirTenantActivo } from "../../tenant-configuration/authority";
import type { ContextoFinancieroOperativo } from "../../bodega/operational-core";

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!emulatorHost?.startsWith("127.0.0.1:")) {
  throw new Error("Agenda Bodega Emulator tests require Firestore Emulator on 127.0.0.1.");
}
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  throw new Error("Agenda Bodega Emulator tests reject application credentials.");
}

const projectId = process.env.GCLOUD_PROJECT ?? "demo-bodega-agenda";
const runId = process.env.E2E_BODEGA_AGENDA_RUN_ID ?? randomUUID();
const app = initializeApp({ projectId }, `bodega-agenda-${runId}`);
const db = getFirestore(app);

type Data = Record<string, any>;
const envelope = (id: string, payload: Data) => ({
  commandId: id,
  idempotencyKey: id,
  correlationId: `corr-${id}`,
  causationId: null,
  payload,
});

function domain(error: unknown): string | undefined {
  const failure = error as { details?: { code?: unknown }; message?: unknown };
  const code = failure?.details?.code ?? failure?.message;
  return typeof code === "string" ? code : undefined;
}

function localDateToday() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addLocalDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function context(empresaId: string, actorUid: string, rol: string): ContextoFinancieroOperativo {
  return { empresaId, actorUid, rol };
}

async function seedTenant(empresaId: string, stock = 20) {
  const sellerUid = `seller-${empresaId}`;
  const adminUid = `admin-${empresaId}`;
  await db.collection("empresas").doc(empresaId).set({ empresaId, estado: "trial", esFundacional: false });
  await db.collection("configuraciones").doc(empresaId).set({
    empresaId,
    vertical: "BODEGA_MVP1",
    localizacion: { zonaHoraria: "America/Bogota" },
    modulos: { habilitados: ["sell", "inventory"] },
  });
  for (const [uid, rol, permisos] of [
    [sellerUid, "vendedor", ["sell", "shifts"]],
    [adminUid, "admin", ["sell", "inventory"]],
  ] as const) {
    await db.collection("membresias").doc(`${empresaId}_${uid}`).set({
      empresaId, uid, rol, permisos, estado: "activa", activo: true,
    });
  }
  await db.collection("clientes").doc(`client-${empresaId}`).set({
    empresaId, nombre: "Cliente de prueba", cedula: "900", activo: true,
  });
  await db.collection("productos").doc(`product-${empresaId}`).set({
    empresaId, nombre: "Producto de prueba", unidadMedida: "unidad", espacioId: "espacio-emulator",
    activo: true, stock, stockReservado: 0, secuenciaLedger: 1, costo: 100,
  });
  await db.collection("presentaciones_producto").doc(`presentation-${empresaId}`).set({
    empresaId, productoId: `product-${empresaId}`, nombre: "Unidad", factorUnidadBase: 1, precioCOP: 500, activo: true,
  });
  return {
    seller: context(empresaId, sellerUid, "vendedor"),
    admin: context(empresaId, adminUid, "admin"),
    clientId: `client-${empresaId}`,
    productId: `product-${empresaId}`,
    presentationId: `presentation-${empresaId}`,
  };
}

async function createAgenda(empresaId: string, seller: ContextoFinancieroOperativo, clientId: string, presentationId: string, cantidad: number, id: string, fechaLocal = addLocalDays(localDateToday(), 1)) {
  return ejecutarCrearProgramacionPedidoBodegaV1(db, seller, envelope(id, {
    clienteId: clientId,
    fechaLocal,
    franja: null,
    lineas: [{ productoId: `product-${empresaId}`, presentacionId: presentationId, cantidad }],
  })) as Promise<Data>;
}

async function approve(admin: ContextoFinancieroOperativo, programacionId: string, id: string) {
  return ejecutarResolverProgramacionPedidoBodegaV1(db, admin, envelope(id, {
    programacionId, revision: 1, decision: "aceptar",
  })) as Promise<Data>;
}

async function confirmAsCallable(seller: ContextoFinancieroOperativo, command: unknown) {
  const tenant = await exigirTenantActivo({
    auth: { uid: seller.actorUid, token: { empresaId: seller.empresaId, rol: seller.rol } },
  }, db);
  return ejecutarConfirmarVentaBodegaV1(db, {
    empresaId: tenant.id, actorUid: seller.actorUid, rol: tenant.rol,
  }, command);
}

test.after(async () => { await deleteApp(app); });

test("Emulator: dos agendas concurrentes no pueden reservar más stock del disponible", async () => {
  const empresaId = `agenda-concurrency-${runId}`;
  const fixture = await seedTenant(empresaId, 10);
  const [first, second] = await Promise.all([
    createAgenda(empresaId, fixture.seller, fixture.clientId, fixture.presentationId, 6, `create-a-${runId}`),
    createAgenda(empresaId, fixture.seller, fixture.clientId, fixture.presentationId, 6, `create-b-${runId}`),
  ]);

  const outcomes = await Promise.allSettled([
    approve(fixture.admin, first.programacionId, `approve-a-${runId}`),
    approve(fixture.admin, second.programacionId, `approve-b-${runId}`),
  ]);
  const accepted = outcomes.filter(result => result.status === "fulfilled");
  const rejected = outcomes.filter(result => result.status === "rejected");
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(domain((rejected[0] as PromiseRejectedResult).reason), "AGENDA_STOCK_INSUFICIENTE");

  const product = (await db.collection("productos").doc(fixture.productId).get()).data();
  const agendas = await db.collection("empresas").doc(empresaId).collection("agenda_pedidos_bodega").get();
  const holds = await db.collection("empresas").doc(empresaId).collection("reservas_stock_bodega").get();
  assert.equal(product?.stock, 10);
  assert.equal(product?.stockReservado, 6);
  assert.equal(agendas.docs.filter(doc => doc.data().estado === "RESERVADA").length, 1);
  assert.equal(agendas.docs.filter(doc => doc.data().estado === "PENDIENTE_REVISION").length, 1);
  assert.equal(holds.docs.filter(doc => doc.data().estado === "ACTIVA").length, 1);
});

test("Emulator: conversiones concurrentes crean una sola solicitud y conservan el hold", async () => {
  const empresaId = `agenda-convert-${runId}`;
  const fixture = await seedTenant(empresaId, 10);
  const agenda = await createAgenda(empresaId, fixture.seller, fixture.clientId, fixture.presentationId, 2, `create-convert-${runId}`, localDateToday());
  await approve(fixture.admin, agenda.programacionId, `approve-convert-${runId}`);

  const convert = (id: string) => ejecutarConvertirProgramacionPedidoBodegaV1(db, fixture.seller, envelope(id, {
    programacionId: agenda.programacionId,
  })) as Promise<Data>;
  const results = await Promise.all([
    convert(`convert-a-${runId}`),
    convert(`convert-b-${runId}`),
  ]);
  const requests = await db.collection("empresas").doc(empresaId).collection("solicitudes_venta_bodega").get();
  const schedule = (await db.collection("empresas").doc(empresaId).collection("agenda_pedidos_bodega").doc(agenda.programacionId).get()).data();
  const product = (await db.collection("productos").doc(fixture.productId).get()).data();

  assert.equal(results[0].solicitudId, results[1].solicitudId);
  assert.equal(requests.size, 1);
  assert.equal(schedule?.estado, "CONVERTIDA_A_SOLICITUD");
  assert.equal(schedule?.solicitudId, results[0].solicitudId);
  assert.equal(product?.stock, 10);
  assert.equal(product?.stockReservado, 2);
});

test("Emulator: agenda reservada llega a venta canónica, replay revocado falla y restaurado no duplica", async () => {
  const empresaId = `agenda-sale-lifecycle-${runId}`;
  const fixture = await seedTenant(empresaId, 10);
  const accountId = crearIdentificadorInterno(empresaId, "cuenta:bancolombia");
  await db.collection("cuentas_bancarias").doc(accountId).set({
    id: accountId, empresaId, claveOperativa: "bancolombia", nombre: "Banco de prueba", saldo: 0,
  });

  const agenda = await createAgenda(
    empresaId, fixture.seller, fixture.clientId, fixture.presentationId, 2,
    `create-sale-lifecycle-${runId}`, localDateToday(),
  );
  const productRef = db.collection("productos").doc(fixture.productId);
  const agendaRef = db.collection("empresas").doc(empresaId)
    .collection("agenda_pedidos_bodega").doc(agenda.programacionId);
  const holds = db.collection("empresas").doc(empresaId).collection("reservas_stock_bodega");
  const requests = db.collection("empresas").doc(empresaId).collection("solicitudes_venta_bodega");

  assert.equal((await productRef.get()).data()?.stock, 10);
  assert.equal((await productRef.get()).data()?.stockReservado, 0);
  assert.equal((await db.collection("ventas").where("empresaId", "==", empresaId).get()).size, 0);

  await approve(fixture.admin, agenda.programacionId, `approve-sale-lifecycle-${runId}`);
  assert.equal((await productRef.get()).data()?.stock, 10);
  assert.equal((await productRef.get()).data()?.stockReservado, 2);
  assert.equal((await holds.where("estado", "==", "ACTIVA").get()).size, 1);

  const converted = await ejecutarConvertirProgramacionPedidoBodegaV1(db, fixture.seller, envelope(
    `convert-sale-lifecycle-${runId}`, { programacionId: agenda.programacionId },
  )) as Data;
  const pendingRequest = (await requests.doc(converted.solicitudId).get()).data();
  assert.equal(pendingRequest?.estado, "PENDIENTE_APROBACION");
  assert.equal(pendingRequest?.programacionId, agenda.programacionId);
  assert.equal((await agendaRef.get()).data()?.estado, "CONVERTIDA_A_SOLICITUD");
  assert.equal((await productRef.get()).data()?.stock, 10);
  assert.equal((await productRef.get()).data()?.stockReservado, 2);
  assert.equal((await db.collection("ventas").where("empresaId", "==", empresaId).get()).size, 0);

  await ejecutarResolverSolicitudVentaBodegaV1(db, fixture.admin, envelope(
    `resolve-sale-lifecycle-${runId}`, {
      solicitudId: converted.solicitudId, revision: 1, decision: "aprobar",
    },
  ));
  assert.equal((await requests.doc(converted.solicitudId).get()).data()?.estado, "APROBADA");
  assert.equal((await productRef.get()).data()?.stock, 10);
  assert.equal((await productRef.get()).data()?.stockReservado, 2);

  const saleCommand = envelope(`confirm-sale-lifecycle-${runId}`, {
    clienteId: fixture.clientId,
    lineas: [{ productoId: fixture.productId, presentacionId: fixture.presentationId, cantidad: 2 }],
    metodoPago: "transferencia",
    solicitudId: converted.solicitudId,
  });
  const sale = await confirmAsCallable(fixture.seller, saleCommand) as Data;
  assert.equal(sale.estadoOperativo, "COMPLETO");
  assert.equal(sale.total, 1_000);
  assert.equal(sale.programacionId, agenda.programacionId);
  assert.equal((await productRef.get()).data()?.stock, 8);
  assert.equal((await productRef.get()).data()?.stockReservado, 0);
  assert.equal((await requests.doc(converted.solicitudId).get()).data()?.estado, "EJECUTADA");
  assert.equal((await agendaRef.get()).data()?.estado, "CUMPLIDA");
  assert.equal((await holds.where("estado", "==", "CONSUMIDA").get()).size, 1);
  assert.equal((await db.collection("ventas").where("empresaId", "==", empresaId).get()).size, 1);
  const inventory = await db.collection("movimientos_inventario").where("empresaId", "==", empresaId).get();
  assert.equal(inventory.size, 1);
  assert.equal(inventory.docs[0]?.data().cantidad, -2);
  assert.equal((await db.collection("transacciones_financieras").where("empresaId", "==", empresaId).get()).size, 1);

  const replay = await confirmAsCallable(fixture.seller, saleCommand) as Data;
  assert.equal(replay.ventaId, sale.ventaId);
  assert.equal((await productRef.get()).data()?.stock, 8);
  assert.equal((await db.collection("movimientos_inventario").where("empresaId", "==", empresaId).get()).size, 1);
  assert.equal((await db.collection("ventas").where("empresaId", "==", empresaId).get()).size, 1);

  const sellerMembershipRef = db.collection("membresias").doc(`${empresaId}_${fixture.seller.actorUid}`);
  const sellerMembership = (await sellerMembershipRef.get()).data();
  await sellerMembershipRef.update({ estado: "inactiva", activo: false });
  await assert.rejects(
    confirmAsCallable(fixture.seller, saleCommand),
    error => error instanceof Error && error.message === "Credenciales operativas inválidas.",
  );
  assert.equal((await productRef.get()).data()?.stock, 8);
  assert.equal((await db.collection("transacciones_financieras").where("empresaId", "==", empresaId).get()).size, 1);

  await sellerMembershipRef.set({ ...sellerMembership, estado: "activa", activo: true });
  const restoredReplay = await confirmAsCallable(fixture.seller, saleCommand) as Data;
  assert.equal(restoredReplay.ventaId, sale.ventaId);
  assert.equal((await productRef.get()).data()?.stock, 8);
  assert.equal((await db.collection("movimientos_inventario").where("empresaId", "==", empresaId).get()).size, 1);
  assert.equal((await db.collection("transacciones_financieras").where("empresaId", "==", empresaId).get()).size, 1);
});

test("Emulator: tenant/actor ajeno y payload con empresa impuesta no cruzan la autoridad", async () => {
  const tenantA = `agenda-tenant-a-${runId}`;
  const tenantB = `agenda-tenant-b-${runId}`;
  const [a, b] = await Promise.all([seedTenant(tenantA), seedTenant(tenantB)]);

  await assert.rejects(
    createAgenda(tenantA, a.seller, b.clientId, a.presentationId, 1, `cross-client-${runId}`),
    error => domain(error) === "CLIENTE_NO_ENCONTRADO",
  );
  await assert.rejects(
    ejecutarCrearProgramacionPedidoBodegaV1(db, a.seller, envelope(`forged-tenant-${runId}`, {
      clienteId: a.clientId, fechaLocal: addLocalDays(localDateToday(), 1), franja: null,
      lineas: [{ productoId: a.productId, presentacionId: a.presentationId, cantidad: 1 }], empresaId: tenantB,
    })),
    error => domain(error) === "AGENDA_COMANDO_INVALIDO",
  );

  const own = await createAgenda(tenantA, a.seller, a.clientId, a.presentationId, 1, `own-agenda-${runId}`);
  const foreign = await createAgenda(tenantB, b.seller, b.clientId, b.presentationId, 1, `foreign-agenda-${runId}`);
  const otherSellerUid = `other-seller-${tenantA}`;
  await db.collection("membresias").doc(`${tenantA}_${otherSellerUid}`).set({
    empresaId: tenantA, uid: otherSellerUid, rol: "vendedor", permisos: ["sell"], estado: "activa", activo: true,
  });
  await assert.rejects(
    ejecutarCancelarProgramacionPedidoBodegaV1(db, context(tenantA, otherSellerUid, "vendedor"), envelope(`foreign-actor-${runId}`, {
      programacionId: own.programacionId, revision: 1,
    })),
    error => domain(error) === "AGENDA_CANCELACION_NO_AUTORIZADA",
  );
  await assert.rejects(
    ejecutarConsultarAgendaPedidosBodegaV1(db, a.seller, { cursor: foreign.programacionId }),
    error => domain(error) === "AGENDA_CURSOR_INVALIDO",
  );
  const otherSellerAgenda = await createAgenda(tenantA, context(tenantA, otherSellerUid, "vendedor"), a.clientId, a.presentationId, 1, `other-seller-agenda-${runId}`);
  await assert.rejects(
    ejecutarConsultarAgendaPedidosBodegaV1(db, a.seller, { cursor: otherSellerAgenda.programacionId }),
    error => domain(error) === "AGENDA_CURSOR_INVALIDO",
  );

  const visibleA = await ejecutarConsultarAgendaPedidosBodegaV1(db, a.seller) as { programaciones: Data[] };
  const visibleB = await ejecutarConsultarAgendaPedidosBodegaV1(db, b.seller) as { programaciones: Data[] };
  assert.deepEqual(visibleA.programaciones.map(item => item.programacionId), [own.programacionId]);
  assert.deepEqual(visibleB.programaciones.map(item => item.programacionId), [foreign.programacionId]);
});

test("Emulator: cliente y presentación inactivos y vendedor sin sell no crean agenda", async () => {
  const empresaId = `agenda-negative-${runId}`;
  const fixture = await seedTenant(empresaId);
  const clientRef = db.collection("clientes").doc(fixture.clientId);
  const presentationRef = db.collection("presentaciones_producto").doc(fixture.presentationId);

  await clientRef.update({ activo: false });
  await assert.rejects(
    createAgenda(empresaId, fixture.seller, fixture.clientId, fixture.presentationId, 1, `inactive-client-${runId}`),
    error => domain(error) === "CLIENTE_INACTIVO",
  );
  await clientRef.update({ activo: true });

  await presentationRef.update({ activo: false });
  await assert.rejects(
    createAgenda(empresaId, fixture.seller, fixture.clientId, fixture.presentationId, 1, `inactive-presentation-${runId}`),
    error => domain(error) === "PRESENTACION_INACTIVA",
  );

  const unauthorizedUid = `no-sell-${empresaId}`;
  await db.collection("membresias").doc(`${empresaId}_${unauthorizedUid}`).set({
    empresaId, uid: unauthorizedUid, rol: "vendedor", permisos: ["inventory"], estado: "activa", activo: true,
  });
  await presentationRef.update({ activo: true });
  await assert.rejects(
    createAgenda(empresaId, context(empresaId, unauthorizedUid, "vendedor"), fixture.clientId, fixture.presentationId, 1, `missing-sell-${runId}`),
    error => domain(error) === "ROLE_FORBIDDEN",
  );

  const agendas = await db.collection("empresas").doc(empresaId).collection("agenda_pedidos_bodega").get();
  assert.equal(agendas.size, 0);
});

test("Emulator: desactivar cliente pendiente impide aprobar y reservar stock", async () => {
  const empresaId = `agenda-client-deactivated-${runId}`;
  const fixture = await seedTenant(empresaId, 10);
  const agenda = await createAgenda(empresaId, fixture.seller, fixture.clientId, fixture.presentationId, 2, `create-inactive-client-${runId}`);

  await db.collection("clientes").doc(fixture.clientId).update({ activo: false });
  await assert.rejects(
    approve(fixture.admin, agenda.programacionId, `approve-inactive-client-${runId}`),
    error => domain(error) === "AGENDA_CLIENTE_NO_DISPONIBLE",
  );

  const product = (await db.collection("productos").doc(fixture.productId).get()).data();
  const schedule = (await db.collection("empresas").doc(empresaId).collection("agenda_pedidos_bodega").doc(agenda.programacionId).get()).data();
  const holds = await db.collection("empresas").doc(empresaId).collection("reservas_stock_bodega").get();
  assert.equal(product?.stock, 10);
  assert.equal(product?.stockReservado, 0);
  assert.equal(schedule?.estado, "PENDIENTE_REVISION");
  assert.equal(holds.size, 0);
});

test("Emulator: la agenda pagina más de 100 registros sin perder ni repetir entradas", async () => {
  const empresaId = `agenda-pagination-${runId}`;
  const fixture = await seedTenant(empresaId);
  const collection = db.collection("empresas").doc(empresaId).collection("agenda_pedidos_bodega");
  const fechaLocal = addLocalDays(localDateToday(), 1);
  const batch = db.batch();
  for (let index = 0; index < 101; index += 1) {
    const programacionId = `agenda-page-${String(index).padStart(3, "0")}`;
    batch.set(collection.doc(programacionId), {
      programacionId, empresaId, solicitanteUid: fixture.seller.actorUid,
      clienteId: fixture.clientId, fechaLocal, franja: null, zonaHoraria: "America/Bogota",
      lineas: [], estado: "PENDIENTE_REVISION", revision: 1,
      stockReservadoUnidadBase: 0, creadaEn: new Date(), actualizadaEn: new Date(),
    });
  }
  await batch.commit();

  const first = await ejecutarConsultarAgendaPedidosBodegaV1(db, fixture.admin) as { programaciones: Data[]; nextCursor: string | null };
  assert.equal(first.programaciones.length, 100);
  assert.ok(first.nextCursor);
  const second = await ejecutarConsultarAgendaPedidosBodegaV1(db, fixture.admin, { cursor: first.nextCursor }) as { programaciones: Data[]; nextCursor: string | null };

  assert.equal(second.programaciones.length, 1);
  assert.equal(second.nextCursor, null);
  const ids = [...first.programaciones, ...second.programaciones].map(item => item.programacionId);
  assert.equal(new Set(ids).size, 101);
});
