import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { tramitarReclamoPrivacidad } from "../../functions/src/legal/privacy-claims";
import {
  fechaBogota, PRIVACY_CALENDAR_V1, PRIVACY_CALENDAR_V2, sumarHabiles, vencimientoDosMeses,
} from "../../functions/src/legal/privacy-calendar";

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
    const requerimiento = { accion: "REQUERIR_SUBSANACION", casoId: radicado.casoId, fechaEnvio: hoy, referencia: "requerimiento-1" };
    const [reqPrimero, reqReintento] = await Promise.all([send(requerimiento), send(requerimiento)]);
    assert.deepEqual([reqPrimero.idempotente, reqReintento.idempotente].sort(), [false, true]);
    await assert.rejects(send({ ...requerimiento, referencia: "requerimiento-distinto" }), /RECLAMO_REQUERIMIENTO_DISTINTO/);
    const pendiente = await run(radicado.casoId, "CONSULTAR");
    assert.equal(pendiente.vencimientoSubsanacion, vencimientoDosMeses(hoy, PRIVACY_CALENDAR_V2));
    await assert.rejects(send({ accion: "DESISTIR_POR_FALTA_DE_SUBSANACION", casoId: radicado.casoId,
      referenciaVerificacion: "buzon-revisado", verificacionConfirmada: true }), /RECLAMO_PLAZO_SUBSANACION_VIGENTE/);
    await assert.rejects(send(entrada), /RECLAMO_SUBSANACION_SIN_CONSTANCIA/);
    const completa = { ...entrada, subsanacionRecibida: hoy, subsanacionRef: "subsanacion-1" };
    const [registro, reintento] = await Promise.all([send(completa), send(completa)]);
    assert.equal(registro.casoId, radicado.casoId);
    assert.deepEqual(registro, reintento);
    assert.deepEqual(await send(requerimiento), {
      casoId: radicado.casoId, estado: "ABIERTO", idempotente: true,
    });
    await assert.rejects(send({ ...requerimiento, referencia: "requerimiento-cambiado" }), /RECLAMO_REQUERIMIENTO_DISTINTO/);
    await assert.rejects(send({ ...completa, motivo: "otro motivo" }), /RECLAMO_REGISTRO_DISTINTO/);
    const expedienteCompleto = (await db.collection("privacidad_reclamos").doc(radicado.casoId).get()).data();
    assert.equal(expedienteCompleto!.calendarioVersion, PRIVACY_CALENDAR_V2);
    assert.equal(expedienteCompleto!.subsanacionRecibidaRef, "subsanacion-1");
    assert.ok(expedienteCompleto!.subsanacionRegistradaEn instanceof Timestamp);
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

    const fechaAtras = (days: number) => fechaBogota(Date.now() - days * 86_400_000);
    const receivedOld = fechaAtras(130), requestOld = fechaAtras(129);
    const oldCase = await send({ accion: "RECIBIR", consecutivo: `legacy-${suffix}`, empresaId: "empresa-a", recibido: receivedOld });
    const oldRequestTs = Timestamp.fromMillis(Date.parse(`${requestOld}T00:00:00-05:00`));
    await db.collection("privacidad_reclamos").doc(oldCase.casoId).update({
      calendarioVersion: FieldValue.delete(),
      vencimientoRequerimiento: sumarHabiles(receivedOld, 5, PRIVACY_CALENDAR_V1),
      fechaRequerimiento: requestOld, requerimientoRef: "requerimiento-legacy",
      requerimientoOperadorUid: uid, requerimientoRegistradoEn: oldRequestTs,
      vencimientoSubsanacion: vencimientoDosMeses(requestOld, PRIVACY_CALENDAR_V1),
    });
    assert.equal((await run(oldCase.casoId, "CONSULTAR")).vencimientoSubsanacion,
      vencimientoDosMeses(requestOld, PRIVACY_CALENDAR_V1));
    const desistimiento = { accion: "DESISTIR_POR_FALTA_DE_SUBSANACION", casoId: oldCase.casoId,
      referenciaVerificacion: "revision-buzon-legacy", verificacionConfirmada: true };
    const firstDesist = await send(desistimiento);
    assert.equal(firstDesist.idempotente, false);
    assert.equal((await send(desistimiento)).idempotente, true);
    assert.deepEqual(await send({ accion: "REQUERIR_SUBSANACION", casoId: oldCase.casoId,
      fechaEnvio: requestOld, referencia: "requerimiento-legacy" }), {
      casoId: oldCase.casoId, estado: "DESISTIDO", idempotente: true,
    });
    assert.equal((await run(oldCase.casoId, "CONSULTAR")).estado, "DESISTIDO");
    await assert.rejects(send({ ...desistimiento, referenciaVerificacion: "otra-revision" }), /RECLAMO_DESISTIMIENTO_DISTINTO/);
    await assert.rejects(send({ ...entrada, consecutivo: `legacy-${suffix}`, recibido: receivedOld,
      completo: fechaAtras(128) }), /RECLAMO_REGISTRO_DISTINTO/);

    const receivedV1 = fechaAtras(1);
    const legacyOpen = await send({ ...entrada, consecutivo: `legacy-open-${suffix}`, recibido: receivedV1, completo: receivedV1 });
    const legacyOpenRef = db.collection("privacidad_reclamos").doc(legacyOpen.casoId);
    const v1ResponseDeadline = sumarHabiles(receivedV1, 15, PRIVACY_CALENDAR_V1);
    await legacyOpenRef.update({
      calendarioVersion: FieldValue.delete(),
      vencimientoAnotacion: FieldValue.delete(),
      vencimientoRespuesta: v1ResponseDeadline,
    });
    const legacyDetail = await run(legacyOpen.casoId, "CONSULTAR");
    assert.equal(legacyDetail.vencimientoAnotacion, sumarHabiles(receivedV1, 2, PRIVACY_CALENDAR_V1));
    await legacyOpenRef.update({ vencimientoRespuesta: "2099-12-31" });
    await assert.rejects(run(legacyOpen.casoId, "CONSULTAR"), /RECLAMO_PLAZO_INCONSISTENTE/);
    await legacyOpenRef.update({ vencimientoRespuesta: v1ResponseDeadline });
    await send({ casoId: legacyOpen.casoId, accion: "PRORROGAR", respuestaRef: "aviso-v1", resultado: "Prórroga histórica" });
    assert.equal((await run(legacyOpen.casoId, "CONSULTAR")).vencimientoRespuesta,
      sumarHabiles(v1ResponseDeadline, 8, PRIVACY_CALENDAR_V1));

    await operator.update({ estado: "REVOCADO", versionAutorizacion: 2 });
    await assert.rejects(run(sinRespuesta.id, "CONSULTAR"), /PLATFORM_ACCESS_DENIED/);
  } finally {
    await deleteApp(app);
  }
});
