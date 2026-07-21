import assert from "node:assert/strict";
import test from "node:test";
import { Timestamp, getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import {
  aceptarIncorporacionEmail,
  cancelarIncorporacionEmail,
  crearIncorporacionEmail,
  reenviarIncorporacionEmail,
} from "./incorporaciones-service";

const PEPPER = "email-test-pepper";
let contador = 0;

async function preparar(empresaId: string) {
  const db = getFirestore();
  await db.collection("permisos_roles").doc("cajero").set({ permisos: ["sell"] });
  await db.collection("empresas").doc(empresaId).set({ estado: "activa" });
}

async function emitir(empresaId: string, correo: string) {
  return crearIncorporacionEmail({ empresaId, emisorUid: "admin", data: { email: correo, rol: "cajero" }, tokenSecret: PEPPER });
}

function email() { contador += 1; return `email-${Date.now()}-${contador}@cafe.test`; }

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
