import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { tramitarReclamoPrivacidad } from "../../functions/src/legal/privacy-claims";
import { fechaBogota, sumarHabiles } from "../../functions/src/legal/privacy-calendar";

const host = process.env.FIRESTORE_EMULATOR_HOST;
test("Reclamos: autoridad, concurrencia, cierre parcial y aislamiento", { skip: !host }, async () => {
  assert.match(host ?? "", /^127\.0\.0\.1:\d+$/);
  const suffix = randomUUID();
  const app = initializeApp({ projectId: "demo-legal-acceptance" }, suffix);
  const db = getFirestore(app);
  const uid = `operador-${suffix}`;
  const operator = db.collection("saas_operadores").doc(uid);
  const ficha = db.collection("clientes").doc(`cliente-${suffix}`);
  const actor = { uid, token: { saas: { operador: true, versionAutorizacion: 1 } } };
  const created = Timestamp.fromMillis(Date.now() - 60_000);
  const base = {
    operadorUid: uid, identidadVerificada: true, empresaId: "empresa-a",
    clienteId: ficha.id, fichaCreadaEn: created, motivo: "Rectificación sintética",
    instruccionRef: "instruccion", estado: "VERIFICADO", recibidoEn: created, completoEn: created,
    respuestaVerificadaRef: "respuesta", resultadoVerificado: "Rectificado",
  };
  const casos = ["a", "b", "ajeno", "sin-instruccion", "sin-respuesta"].map(
    id => db.collection("privacidad_reclamos").doc(`${id}-${suffix}`),
  );
  const [a, b, ajeno, sinInstruccion, sinRespuesta] = casos;
  const run = (casoId: string, accion: string, respuestaRef?: string) => tramitarReclamoPrivacidad(
    db, actor, { casoId, accion, ...(respuestaRef ? { respuestaRef } : {}) },
  );
  try {
    await Promise.all([
      operator.set({ uid, estado: "ACTIVO", versionAutorizacion: 1, facultades: ["CONSERVACION_GOBERNAR"] }),
      db.collection("empresas").doc("empresa-a").set({ estado: "activa" }),
      ficha.set({ empresaId: "empresa-a", creadoEn: created }),
      a.set(base), b.set(base), ajeno.set({ ...base, empresaId: "empresa-b" }),
      sinInstruccion.set({ ...base, instruccionRef: null }),
      sinRespuesta.set({ ...base, respuestaVerificadaRef: null }),
    ]);
    await assert.rejects(run(a.id, "ABRIR"), /PLATFORM_ACCESS_DENIED/);
    await operator.update({ facultades: ["PRIVACIDAD_RECLAMOS_TRAMITAR"] });
    await assert.rejects(run(ajeno.id, "ABRIR"), /RECLAMO_NO_AUTORIZADO/);
    await assert.rejects(run(sinInstruccion.id, "ABRIR"), /RECLAMO_NO_AUTORIZADO/);
    await Promise.all([run(a.id, "ABRIR"), run(a.id, "ABRIR"), run(b.id, "ABRIR")]);
    assert.equal((await ficha.get()).get("reclamosPrivacidadAbiertos"), 2);
    assert.equal((await run(a.id, "CONSULTAR")).motivo, base.motivo);
    assert.equal((await ficha.get()).get("motivo"), undefined);
    await assert.rejects(run(a.id, "CERRAR", "distinta"), /RECLAMO_NO_AUTORIZADO/);
    await run(a.id, "CERRAR", "respuesta");
    await run(a.id, "CERRAR", "respuesta");
    assert.equal((await a.get()).get("resultado"), "Rectificado");
    assert.equal((await run(b.id, "CONSULTAR")).leyenda, "reclamo en trámite");
    assert.equal((await ficha.get()).get("reclamosPrivacidadAbiertos"), 1);
    await run(b.id, "CERRAR", "respuesta");
    assert.equal((await ficha.get()).get("reclamosPrivacidadAbiertos"), 0);
    await run(sinRespuesta.id, "ABRIR");
    await assert.rejects(run(sinRespuesta.id, "CERRAR", "respuesta"), /RECLAMO_NO_AUTORIZADO/);
    const hoy = fechaBogota(Date.now());
    const entrada = {
      accion: "REGISTRAR", consecutivo: `consecutivo-${suffix}`, empresaId: "empresa-a",
      clienteId: ficha.id, motivo: "Solicitud de corrección", recibido: hoy, completo: hoy,
      instruccionRef: "instruccion", identidadRef: "identidad", trasladoRef: "traslado",
      verificacionConfirmada: true,
    };
    const send = (data: unknown) => tramitarReclamoPrivacidad(db, actor, data);
    await assert.rejects(send({ ...entrada, empresaId: "empresa-b" }), /RECLAMO_NO_AUTORIZADO/);
    await assert.rejects(send({ ...entrada, verificacionConfirmada: false }), /RECLAMO_ENTRADA_INVALIDA/);
    const radicado = await send({ accion: "RECIBIR", consecutivo: entrada.consecutivo, empresaId: "empresa-a", recibido: hoy });
    assert.equal(radicado.estado, "RECIBIDO");
    assert.equal((await ficha.get()).get("reclamosPrivacidadAbiertos"), 1);
    assert.equal((await run(radicado.casoId, "CONSULTAR")).vencimientoRequerimiento, sumarHabiles(hoy, 5));
    const [registro, reintento] = await Promise.all([send(entrada), send(entrada)]);
    assert.equal(registro.casoId, radicado.casoId);
    assert.deepEqual(registro, reintento);
    await assert.rejects(send({ ...entrada, motivo: "otro motivo" }), /RECLAMO_REGISTRO_DISTINTO/);
    assert.equal((await ficha.get()).get("reclamosPrivacidadAbiertos"), 2);
    let consulta = await run(registro.casoId, "CONSULTAR");
    assert.equal(consulta.vencimientoAnotacion, sumarHabiles(hoy, 2));
    assert.equal(consulta.vencimientoRespuesta, sumarHabiles(hoy, 15));
    await send({ casoId: registro.casoId, accion: "PRORROGAR", respuestaRef: "aviso-prorroga", resultado: "Falta comprobar un soporte" });
    consulta = await run(registro.casoId, "CONSULTAR");
    assert.equal(consulta.vencimientoRespuesta, sumarHabiles(sumarHabiles(hoy, 15), 8));
    await assert.rejects(send({ casoId: registro.casoId, accion: "PRORROGAR", respuestaRef: "otra-prorroga", resultado: "Otro motivo" }), /RECLAMO_PRORROGA_NO_DISPONIBLE/);
    await send({ casoId: registro.casoId, accion: "DOCUMENTAR_RESPUESTA", respuestaRef: "respuesta-final", resultado: "Corrección comunicada" });
    assert.equal((await run(registro.casoId, "CONSULTAR")).respuestaRef, "respuesta-final");
    await run(registro.casoId, "CERRAR", "respuesta-final");
    assert.equal((await ficha.get()).get("reclamosPrivacidadAbiertos"), 1);
    await operator.update({ estado: "REVOCADO", versionAutorizacion: 2 });
    await assert.rejects(run(sinRespuesta.id, "CONSULTAR"), /PLATFORM_ACCESS_DENIED/);
  } finally {
    await deleteApp(app);
  }
});
