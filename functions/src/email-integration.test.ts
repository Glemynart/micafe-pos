import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { HttpsError } from "firebase-functions/v2/https";
import {
  aceptarIncorporacionEmail,
  cancelarIncorporacionEmail,
  crearIncorporacionDirecta,
  crearIncorporacionEmail,
  activarIncorporacionDirecta,
  idIncorporacionDirecta,
  reenviarIncorporacionEmail,
} from "./incorporaciones-service";
import { actualizarMembresia, autenticarOperativo } from "./operational-auth";
import { emitirCredencialInicial } from "./platform/emitir-credencial-inicial";
import { CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO } from "./platform/reserva-codigo-operativo";

const PEPPER = "email-test-pepper";
const PIN_PEPPER = "directa-test-pepper";
process.env.OPERATIONAL_PIN_PEPPER = PIN_PEPPER;
let contador = 0;

async function preparar(empresaId: string) {
  const db = getFirestore();
  await db.collection("permisos_roles").doc("cajero").set({ permisos: ["sell"] });
  await db.collection("empresas").doc(empresaId).set({ estado: "activa" });
}

async function prepararEmpresaFundacionalUnica(empresaId: string) {
  const db = getFirestore();
  const fundacionalesPrevias = await db.collection("empresas").where("esFundacional", "==", true).get();
  await Promise.all(fundacionalesPrevias.docs.map((doc) => doc.ref.delete()));
  await db.collection("empresas").doc(empresaId).set({ estado: "activa", esFundacional: true });
}

async function emitir(empresaId: string, correo: string) {
  return crearIncorporacionEmail({ empresaId, emisorUid: "admin", data: { email: correo, rol: "cajero" }, tokenSecret: PEPPER });
}

function email() { contador += 1; return `email-${Date.now()}-${contador}@cafe.test`; }

async function prepararMembresiaMultiempresa() {
  const empresaA = `empresa-contexto-a-${Date.now()}`;
  const empresaB = `empresa-contexto-b-${Date.now()}`;
  const auth = getAuth();
  const [adminB, objetivo] = await Promise.all([
    auth.createUser({ email: email(), password: "ClaveSegura123" }),
    auth.createUser({ email: email(), password: "ClaveSegura123" }),
  ]);
  const db = getFirestore();
  await Promise.all([
    db.collection("empresas").doc(empresaA).set({ estado: "activa" }),
    db.collection("empresas").doc(empresaB).set({ estado: "activa" }),
    db.collection("permisos_roles").doc("supervisor").set({ permisos: ["sell", "reportes"] }),
    db.collection("membresias").doc(`${empresaA}_${objetivo.uid}`).set({ empresaId: empresaA, uid: objetivo.uid, rol: "cajero", permisos: ["sell"], estado: "activa", activo: true }),
    db.collection("membresias").doc(`${empresaB}_${objetivo.uid}`).set({ empresaId: empresaB, uid: objetivo.uid, rol: "cajero", permisos: ["sell"], estado: "activa", activo: true }),
    db.collection("membresias").doc(`${empresaB}_${adminB.uid}`).set({ empresaId: empresaB, uid: adminB.uid, rol: "admin", permisos: ["sell"], estado: "activa", activo: true }),
  ]);
  const saas = { operador: true, versionAutorizacion: 3, facultades: ["PLATAFORMA_CONSULTAR"] };
  await auth.setCustomUserClaims(objetivo.uid, { empresaId: empresaA, rol: "cajero", saas });
  return { adminB, empresaA, empresaB, objetivo };
}

test("EMAIL crea nueva generacion tras CANCELLED y EXPIRED", async () => {
  const empresaId = `empresa-email-${Date.now()}`;
  const correo = email();
  await preparar(empresaId);
  const primera = await emitir(empresaId, correo);
  await cancelarIncorporacionEmail({ incorporacionId: primera.incorporacionId, empresaId, emisorUid: "admin" });
  const segunda = await emitir(empresaId, correo);
  assert.notEqual(primera.incorporacionId, segunda.incorporacionId);
  await getFirestore().collection("incorporaciones").doc(segunda.incorporacionId).update({ expiraEn: Timestamp.fromMillis(Date.now() - 1) });
  const tercera = await emitir(empresaId, correo);
  assert.notEqual(segunda.incorporacionId, tercera.incorporacionId);
  assert.equal((await getFirestore().collection("incorporaciones").doc(segunda.incorporacionId).get()).data()?.estado, "EXPIRED");
});

test("EMAIL activa identidad nueva, no crea claims antes de ACTIVE y crea generacion tras ACTIVE", async () => {
  const empresaId = `empresa-email-${Date.now()}`;
  const correo = email();
  await preparar(empresaId);
  const emitida = await emitir(empresaId, correo);
  await assert.rejects(() => getAuth().getUserByEmail(correo), { code: "auth/user-not-found" });
  const activa = await aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: emitida.entrega!.token, password: "ClaveSegura123", tokenSecret: PEPPER });
  assert.equal(activa.estado, "ACTIVE");
  const siguiente = await emitir(empresaId, correo);
  assert.notEqual(siguiente.incorporacionId, emitida.incorporacionId);
});

test("EMAIL acepta identidad existente, rechaza email distinto y serializa aceptaciones concurrentes", async () => {
  const empresaId = `empresa-email-${Date.now()}`;
  const correo = email();
  await preparar(empresaId);
  const principal = await getAuth().createUser({ email: correo, password: "ClaveSegura123" });
  const emitida = await emitir(empresaId, correo);
  const resultados = await Promise.all([
    aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: emitida.entrega!.token, password: undefined, uid: principal.uid, emailSesion: correo, tokenSecret: PEPPER }),
    aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: emitida.entrega!.token, password: undefined, uid: principal.uid, emailSesion: correo, tokenSecret: PEPPER }),
  ]);
  assert.ok(resultados.some((resultado) => resultado.idempotente));
  assert.equal((await getFirestore().collection("membresias").doc(`${empresaId}_${principal.uid}`).get()).exists, true);
  const otra = await getAuth().createUser({ email: email(), password: "ClaveSegura123" });
  await assert.rejects(() => aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: "invalido", password: undefined, uid: otra.uid, emailSesion: otra.email, tokenSecret: PEPPER }), { code: "permission-denied" });
});

test("EMAIL invalida enlace previo, serializa reenvios y aísla tenants", async () => {
  const empresaA = `empresa-email-a-${Date.now()}`;
  const empresaB = `empresa-email-b-${Date.now()}`;
  await Promise.all([preparar(empresaA), preparar(empresaB)]);
  const emitida = await emitir(empresaA, email());
  const resultados = await Promise.allSettled([
    reenviarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, empresaId: empresaA, emisorUid: "admin", tokenSecret: PEPPER }),
    reenviarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, empresaId: empresaA, emisorUid: "admin", tokenSecret: PEPPER }),
  ]);
  assert.equal(resultados.filter((resultado) => resultado.status === "fulfilled").length, 1);
  await assert.rejects(() => aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: emitida.entrega!.token, password: "ClaveSegura123", tokenSecret: PEPPER }));
  await assert.rejects(() => cancelarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, empresaId: empresaB, emisorUid: "admin" }), { code: "not-found" });
});

test("EMAIL compensa Auth si Firestore falla antes de activar", async () => {
  const empresaId = `empresa-email-${Date.now()}`;
  const correo = email();
  await preparar(empresaId);
  const emitida = await emitir(empresaId, correo);
  await getFirestore().collection("incorporaciones").doc(emitida.incorporacionId).update({ rol: "rol-invalido" });
  await assert.rejects(() => aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: emitida.entrega!.token, password: "ClaveSegura123", tokenSecret: PEPPER }));
  await assert.rejects(() => getAuth().getUserByEmail(correo), { code: "auth/user-not-found" });
});

test("EMAIL no activa una invitacion expirada ni una membresia incompatible", async () => {
  const empresaId = `empresa-email-validaciones-${Date.now()}`;
  const db = getFirestore();
  await preparar(empresaId);

  const vencida = await emitir(empresaId, email());
  await db.collection("incorporaciones").doc(vencida.incorporacionId).update({ expiraEn: Timestamp.fromMillis(Date.now() - 1) });
  await assert.rejects(
    () => aceptarIncorporacionEmail({ incorporacionId: vencida.incorporacionId, token: vencida.entrega!.token, password: "ClaveSegura123", tokenSecret: PEPPER }),
    { code: "failed-precondition" },
  );
  assert.equal((await db.collection("incorporaciones").doc(vencida.incorporacionId).get()).data()?.estado, "EXPIRED");

  const correo = email();
  const principal = await getAuth().createUser({ email: correo, password: "ClaveSegura123" });
  const incompatible = await emitir(empresaId, correo);
  await db.collection("membresias").doc(`${empresaId}_${principal.uid}`).set({
    empresaId, uid: principal.uid, rol: "admin", permisos: ["sell"], estado: "activa", activo: true,
  });
  await assert.rejects(
    () => aceptarIncorporacionEmail({ incorporacionId: incompatible.incorporacionId, token: incompatible.entrega!.token, password: undefined, uid: principal.uid, emailSesion: correo, tokenSecret: PEPPER }),
    { code: "already-exists" },
  );
  assert.equal((await db.collection("incorporaciones").doc(incompatible.incorporacionId).get()).data()?.estado, "INVITED");
});

test("DIRECTA rechaza la activacion y el reintento ACTIVE cuando el lifecycle deja de ser operativo", async () => {
  const empresaFundacionalId = `empresa-fundacional-${Date.now()}`;
  const empresaId = `empresa-directa-lifecycle-${Date.now()}`;
  const db = getFirestore();
  await prepararEmpresaFundacionalUnica(empresaFundacionalId);
  await preparar(empresaId);
  for (const estado of ["suspendida", "cancelada", "archivada", "eliminada"]) {
    const incorporacion = await crearIncorporacionDirecta({
      empresaId,
      emisorUid: "admin",
      data: { nombre: "Operadora lifecycle", codigo: `caja-lifecycle-${estado}-${Date.now()}`, pinTemporal: "123456", rol: "cajero" },
      pepper: PIN_PEPPER,
    });
    await db.collection("empresas").doc(empresaId).update({ estado });
    await assert.rejects(
      () => activarIncorporacionDirecta({ incorporacionId: incorporacion.incorporacionId, uid: incorporacion.uid, data: { pinActual: "123456", pinNuevo: "654321" }, pepper: PIN_PEPPER }),
      { code: "failed-precondition" },
    );
    assert.equal((await db.collection("incorporaciones").doc(incorporacion.incorporacionId).get()).data()?.estado, "TEMP_CREDENTIAL");
    assert.equal((await db.collection("membresias").doc(`${empresaId}_${incorporacion.uid}`).get()).exists, false);
    await db.collection("empresas").doc(empresaId).update({ estado: "activa" });
  }

  const reintento = await crearIncorporacionDirecta({ empresaId, emisorUid: "admin", data: { nombre: "Operadora reintento", codigo: `caja-reintento-${Date.now()}`, pinTemporal: "123456", rol: "cajero" }, pepper: PIN_PEPPER });
  await activarIncorporacionDirecta({ incorporacionId: reintento.incorporacionId, uid: reintento.uid, data: { pinActual: "123456", pinNuevo: "654321" }, pepper: PIN_PEPPER });
  await db.collection("empresas").doc(empresaId).update({ estado: "cancelada" });
  await assert.rejects(
    () => activarIncorporacionDirecta({ incorporacionId: reintento.incorporacionId, uid: reintento.uid, data: { pinDefinitivo: "654321" }, pepper: PIN_PEPPER }),
    { code: "failed-precondition" },
  );
});

test("EMAIL rechaza la aceptacion y el reintento ACTIVE cuando el lifecycle deja de ser operativo", async () => {
  const empresaId = `empresa-email-lifecycle-${Date.now()}`;
  const db = getFirestore();
  await preparar(empresaId);
  for (const estado of ["suspendida", "cancelada", "archivada", "eliminada"]) {
    const correo = email();
    const emitida = await emitir(empresaId, correo);
    await db.collection("empresas").doc(empresaId).update({ estado });
    await assert.rejects(
      () => aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: emitida.entrega!.token, password: "ClaveSegura123", tokenSecret: PEPPER }),
      { code: "failed-precondition" },
    );
    assert.equal((await db.collection("incorporaciones").doc(emitida.incorporacionId).get()).data()?.estado, "INVITED");
    await assert.rejects(() => getAuth().getUserByEmail(correo), { code: "auth/user-not-found" });
    await db.collection("empresas").doc(empresaId).update({ estado: "activa" });
  }

  const correo = email();
  const emitida = await emitir(empresaId, correo);
  await db.collection("empresas").doc(empresaId).update({ estado: "trial" });
  const activa = await aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: emitida.entrega!.token, password: "ClaveSegura123", tokenSecret: PEPPER });
  const uid = (await getAuth().getUserByEmail(correo)).uid;
  await db.collection("empresas").doc(empresaId).update({ estado: "eliminada" });
  await assert.rejects(
    () => aceptarIncorporacionEmail({ incorporacionId: activa.incorporacionId, token: "invalido", password: undefined, uid, emailSesion: correo, tokenSecret: PEPPER }),
    { code: "failed-precondition" },
  );
});

test("DIRECTA no materializa activacion cuando la transicion de lifecycle gana antes de la lectura transaccional", async () => {
  const empresaFundacionalId = `empresa-fundacional-carrera-${Date.now()}`;
  const empresaId = `empresa-directa-carrera-${Date.now()}`;
  const codigo = `caja-carrera-${Date.now()}`;
  const db = getFirestore();
  await prepararEmpresaFundacionalUnica(empresaFundacionalId);
  await preparar(empresaId);
  const incorporacion = await crearIncorporacionDirecta({ empresaId, emisorUid: "admin", data: { nombre: "Operadora Carrera", codigo, pinTemporal: "123456", rol: "cajero" }, pepper: PIN_PEPPER });
  const originalRunTransaction = db.runTransaction.bind(db);
  const mutableDb = db as unknown as { runTransaction: (callback: (transaction: { get: (ref: { path: string; get: () => Promise<unknown> }) => Promise<unknown> }) => Promise<unknown>) => Promise<unknown> };
  mutableDb.runTransaction = async (callback) => callback({
    get: async (ref) => ref.path === `empresas/${empresaId}`
      ? { exists: true, id: empresaId, data: () => ({ estado: "suspendida" }) }
      : ref.get(),
  });
  try {
    await assert.rejects(
      () => activarIncorporacionDirecta({ incorporacionId: incorporacion.incorporacionId, uid: incorporacion.uid, data: { pinActual: "123456", pinNuevo: "654321" }, pepper: PIN_PEPPER }),
      { code: "failed-precondition" },
    );
  } finally {
    mutableDb.runTransaction = originalRunTransaction as never;
  }
  assert.equal((await db.collection("incorporaciones").doc(incorporacion.incorporacionId).get()).data()?.estado, "TEMP_CREDENTIAL");
  assert.equal((await db.collection("membresias").doc(`${empresaId}_${incorporacion.uid}`).get()).exists, false);
  assert.deepEqual((await getAuth().getUser(incorporacion.uid)).customClaims ?? {}, {});
});

test("EMAIL no materializa aceptacion cuando la transicion de lifecycle gana antes de la lectura transaccional", async () => {
  const empresaId = `empresa-email-carrera-${Date.now()}`;
  const correo = email();
  const db = getFirestore();
  await preparar(empresaId);
  const invitacion = await emitir(empresaId, correo);
  const originalRunTransaction = db.runTransaction.bind(db);
  const mutableDb = db as unknown as { runTransaction: (callback: (transaction: { get: (ref: { path: string; get: () => Promise<unknown> }) => Promise<unknown> }) => Promise<unknown>) => Promise<unknown> };
  mutableDb.runTransaction = async (callback) => callback({
    get: async (ref) => ref.path === `empresas/${empresaId}`
      ? { exists: true, id: empresaId, data: () => ({ estado: "cancelada" }) }
      : ref.get(),
  });
  try {
    await assert.rejects(
      () => aceptarIncorporacionEmail({ incorporacionId: invitacion.incorporacionId, token: invitacion.entrega!.token, password: "ClaveSegura123", tokenSecret: PEPPER }),
      { code: "failed-precondition" },
    );
  } finally {
    mutableDb.runTransaction = originalRunTransaction as never;
  }
  assert.equal((await db.collection("incorporaciones").doc(invitacion.incorporacionId).get()).data()?.estado, "INVITED");
  assert.equal((await db.collection("membresias").where("empresaId", "==", empresaId).get()).empty, true);
  await assert.rejects(() => getAuth().getUserByEmail(correo), { code: "auth/user-not-found" });
});

test("EMAIL recupera sincronizacion de claims tras un fallo posterior a ACTIVE", async () => {
  const empresaId = `empresa-email-${Date.now()}`;
  const correo = email();
  await preparar(empresaId);
  const principal = await getAuth().createUser({ email: correo, password: "ClaveSegura123" });
  const emitida = await emitir(empresaId, correo);
  const auth = getAuth();
  const mutableAuth = auth as unknown as { setCustomUserClaims: (uid: string, claims: Record<string, unknown> | null) => Promise<void> };
  const original = mutableAuth.setCustomUserClaims.bind(auth);
  mutableAuth.setCustomUserClaims = async () => { throw new Error("fallo inducido de claims"); };
  try {
    await assert.rejects(() => aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: emitida.entrega!.token, password: undefined, uid: principal.uid, emailSesion: correo, tokenSecret: PEPPER }));
  } finally {
    mutableAuth.setCustomUserClaims = original;
  }
  assert.equal((await getFirestore().collection("incorporaciones").doc(emitida.incorporacionId).get()).data()?.estado, "ACTIVE");
  const reintento = await aceptarIncorporacionEmail({ incorporacionId: emitida.incorporacionId, token: "invalido", password: undefined, uid: principal.uid, emailSesion: correo, tokenSecret: PEPPER });
  assert.equal(reintento.idempotente, true);
  assert.equal((await getAuth().getUser(principal.uid)).customClaims?.empresaId, empresaId);
});

test("MEMBRESIA actualizar en B preserva el contexto activo A del usuario", async () => {
  const { adminB, empresaA, empresaB, objetivo } = await prepararMembresiaMultiempresa();

  await actualizarMembresia.run({
    auth: { uid: adminB.uid, token: { empresaId: empresaB, rol: "admin" } },
    data: { uid: objetivo.uid, rol: "supervisor" },
  } as never);

  assert.equal((await getFirestore().collection("membresias").doc(`${empresaB}_${objetivo.uid}`).get()).data()?.rol, "supervisor");
  assert.deepEqual((await getAuth().getUser(objetivo.uid)).customClaims, {
    empresaId: empresaA,
    rol: "cajero",
    saas: { operador: true, versionAutorizacion: 3, facultades: ["PLATAFORMA_CONSULTAR"] },
  });
});

test("MEMBRESIA desactivar en B preserva el contexto activo A del usuario", async () => {
  const { adminB, empresaA, empresaB, objetivo } = await prepararMembresiaMultiempresa();

  await actualizarMembresia.run({
    auth: { uid: adminB.uid, token: { empresaId: empresaB, rol: "admin" } },
    data: { uid: objetivo.uid, estado: "inactiva" },
  } as never);

  const membresia = (await getFirestore().collection("membresias").doc(`${empresaB}_${objetivo.uid}`).get()).data();
  assert.equal(membresia?.estado, "inactiva");
  assert.equal(membresia?.activo, false);
  assert.deepEqual((await getAuth().getUser(objetivo.uid)).customClaims, {
    empresaId: empresaA,
    rol: "cajero",
    saas: { operador: true, versionAutorizacion: 3, facultades: ["PLATAFORMA_CONSULTAR"] },
  });
});

test("DIRECTA permite reingresar con PIN definitivo en un tenant no fundacional", async () => {
  const empresaFundacionalId = `empresa-fundacional-${Date.now()}`;
  const empresaId = `empresa-directa-${Date.now()}`;
  const codigo = `caja-${Date.now()}`;
  const db = getFirestore();
  await prepararEmpresaFundacionalUnica(empresaFundacionalId);
  await preparar(empresaId);

  const incorporacion = await crearIncorporacionDirecta({
    empresaId,
    emisorUid: "admin",
    data: { nombre: "Operadora Directa", codigo, pinTemporal: "123456", rol: "cajero" },
    pepper: PIN_PEPPER,
  });
  const temporal = await autenticarOperativo.run({ data: { codigo, pin: "123456" } } as never);
  assert.equal(temporal.requiereCambio, true);
  assert.equal(temporal.incorporacionId, incorporacion.incorporacionId);

  await activarIncorporacionDirecta({
    incorporacionId: incorporacion.incorporacionId,
    uid: incorporacion.uid,
    data: { pinActual: "123456", pinNuevo: "654321" },
    pepper: PIN_PEPPER,
  });

  const definitiva = await autenticarOperativo.run({ data: { codigo, pin: "654321" } } as never);
  assert.equal(definitiva.requiereCambio, undefined);
  assert.equal(typeof definitiva.customToken, "string");
});

test("DIRECTA activa y emite sesion tenant cuando la empresa esta en trial", async () => {
  const empresaFundacionalId = `empresa-fundacional-trial-${Date.now()}`;
  const empresaId = `empresa-directa-trial-${Date.now()}`;
  const codigo = `caja-trial-${Date.now()}`;
  const db = getFirestore();
  await prepararEmpresaFundacionalUnica(empresaFundacionalId);
  await preparar(empresaId);
  await db.collection("empresas").doc(empresaId).update({ estado: "trial" });
  const incorporacion = await crearIncorporacionDirecta({
    empresaId,
    emisorUid: "admin",
    data: { nombre: "Operadora Trial", codigo, pinTemporal: "123456", rol: "cajero" },
    pepper: PIN_PEPPER,
  });

  const activacion = await activarIncorporacionDirecta({
    incorporacionId: incorporacion.incorporacionId,
    uid: incorporacion.uid,
    data: { pinActual: "123456", pinNuevo: "654321" },
    pepper: PIN_PEPPER,
  });

  assert.equal(activacion.estado, "ACTIVE");
  assert.equal(typeof activacion.customToken, "string");
  assert.equal((await db.collection("membresias").doc(`${empresaId}_${incorporacion.uid}`).get()).data()?.estado, "activa");
});

test("DIRECTA legacy conserva el codigo explicito cuando la reserva global colisiona", async () => {
  const empresaOrigen = `empresa-directa-origen-${Date.now()}`;
  const empresaDestino = `empresa-directa-destino-${Date.now()}`;
  const codigo = `caja-legacy-${Date.now()}`;
  await Promise.all([preparar(empresaOrigen), preparar(empresaDestino)]);

  await crearIncorporacionDirecta({
    empresaId: empresaOrigen,
    emisorUid: "admin",
    data: { nombre: "Operadora Origen", codigo, pinTemporal: "123456", rol: "cajero" },
    pepper: PIN_PEPPER,
  });

  await assert.rejects(
    () => crearIncorporacionDirecta({
      empresaId: empresaDestino,
      emisorUid: "admin",
      data: { nombre: "Operadora Destino", codigo, pinTemporal: "654321", rol: "cajero" },
      pepper: PIN_PEPPER,
    }),
    { code: "already-exists", message: CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO },
  );
  await assert.rejects(
    () => getAuth().getUser(idIncorporacionDirecta(empresaDestino, codigo)),
    { code: "auth/user-not-found" },
  );
});

test("DIRECTA limpia el principal del intento descartado antes de reintentar una colision generada", async () => {
  const empresaId = `empresa-directa-reintento-${Date.now()}`;
  await preparar(empresaId);
  const db = getFirestore();
  const originalRunTransaction = db.runTransaction.bind(db);
  const dbMutable = db as unknown as {
    runTransaction: (callback: (transaction: {
      get: (referencia: { path: string; id: string }) => Promise<never>;
    }) => Promise<unknown>) => Promise<unknown>;
  };
  let primerIntento = true;
  let uidDescartado: string | undefined;
  dbMutable.runTransaction = async (callback) => {
    if (!primerIntento) return originalRunTransaction(callback as never);
    primerIntento = false;
    return callback({
      get: async (referencia) => {
        if (referencia.path.startsWith("usuarios/")) uidDescartado = referencia.id;
        throw new HttpsError("already-exists", CODIGO_OPERATIVO_GLOBAL_YA_ASIGNADO);
      },
    });
  };

  let creada: Awaited<ReturnType<typeof crearIncorporacionDirecta>>;
  try {
    creada = await crearIncorporacionDirecta({
      empresaId,
      emisorUid: "admin",
      data: { nombre: "Operadora Reintento", rol: "cajero" },
      pepper: PIN_PEPPER,
    });
  } finally {
    dbMutable.runTransaction = originalRunTransaction as never;
  }

  assert.ok(uidDescartado);
  await assert.rejects(() => getAuth().getUser(uidDescartado), { code: "auth/user-not-found" });
  assert.equal((await getAuth().getUser(creada!.uid)).uid, creada!.uid);
});

test("la credencial inicial de plataforma vencida no emite DIRECTA_TEMP ni puede activarse", async () => {
  const empresaFundacionalId = `empresa-fundacional-ttl-${Date.now()}`;
  const empresaId = `empresa-inicial-ttl-${Date.now()}`;
  const db = getFirestore();
  await prepararEmpresaFundacionalUnica(empresaFundacionalId);
  await preparar(empresaId);

  const principal = await getAuth().createUser({ displayName: "Admin Inicial TTL" });
  const emitida = await emitirCredencialInicial(db, {
    empresaId,
    uid: principal.uid,
    rol: "admin",
    permisos: ["sell"],
    origen: "PLATAFORMA",
    emisorUid: "operador-plataforma",
    nombreComercial: "Café TTL",
    pepper: PIN_PEPPER,
  });
  const vencida = Timestamp.fromMillis(Date.now() - 1);
  await Promise.all([
    db.collection("incorporaciones").doc(emitida.incorporacionId).update({ expiraEn: vencida }),
    db.collection("credenciales_operativas").doc(`${empresaId}_${emitida.codigo}`).update({ expiraEn: vencida }),
  ]);

  await assert.rejects(
    () => autenticarOperativo.run({ data: { codigo: emitida.codigo, pin: emitida.pinTemporal } } as never),
    { code: "unauthenticated" },
  );
  await assert.rejects(
    () => activarIncorporacionDirecta({
      incorporacionId: emitida.incorporacionId,
      uid: principal.uid,
      data: { pinActual: emitida.pinTemporal, pinNuevo: "654321" },
      pepper: PIN_PEPPER,
    }),
    { code: "failed-precondition" },
  );

  const [incorporacion, credencial, membresia, usuarioAuth] = await Promise.all([
    db.collection("incorporaciones").doc(emitida.incorporacionId).get(),
    db.collection("credenciales_operativas").doc(`${empresaId}_${emitida.codigo}`).get(),
    db.collection("membresias").doc(`${empresaId}_${principal.uid}`).get(),
    getAuth().getUser(principal.uid),
  ]);
  assert.equal(incorporacion.data()?.estado, "TEMP_CREDENTIAL");
  assert.equal(credencial.data()?.requiereCambio, true);
  assert.equal(membresia.exists, false);
  assert.deepEqual(usuarioAuth.customClaims ?? {}, {});
});
