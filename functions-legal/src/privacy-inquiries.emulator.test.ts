import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { tramitarConsultaPrivacidad } from "../../functions/src/legal/privacy-inquiries";
import { fechaBogota, sumarHabiles } from "../../functions/src/legal/privacy-calendar";

const host = process.env.FIRESTORE_EMULATOR_HOST;
test("Consultas: facultad separada, idempotencia, plazos, aislamiento y respuesta", { skip: !host }, async () => {
  assert.match(host ?? "", /^127\.0\.0\.1:\d+$/);
  const suffix = randomUUID(), uid = `operador-${suffix}`, tenant = `empresa-${suffix}`;
  const app = initializeApp({ projectId: "demo-legal-acceptance" }, `inquiries-${suffix}`);
  const db = getFirestore(app), operator = db.collection("saas_operadores").doc(uid), company = db.collection("empresas").doc(tenant);
  const otherUid = `otro-${suffix}`, otherOperator = db.collection("saas_operadores").doc(otherUid);
  const otherActor = { uid: otherUid, token: { saas: { operador: true, versionAutorizacion: 1 } } };
  const actor = { uid, token: { saas: { operador: true, versionAutorizacion: 1 } } };
  const received = fechaBogota(Date.now());
  const input = { accion: "REGISTRAR", empresaId: tenant, consecutivo: `qa-${suffix}`, recibido: received, identidadRef: "verificacion", instruccionRef: "instruccion", verificacionConfirmada: true };
  let caseId: string | undefined;
  try {
    await company.set({ estado: "trial" });
    await operator.set({ uid, estado: "ACTIVO", versionAutorizacion: 1, facultades: ["PRIVACIDAD_RECLAMOS_TRAMITAR"] });
    await assert.rejects(tramitarConsultaPrivacidad(db, actor, input), /PLATFORM_ACCESS_DENIED/);
    await operator.update({ facultades: ["PRIVACIDAD_CONSULTAS_TRAMITAR"] });
    await assert.rejects(tramitarConsultaPrivacidad(db, actor, { ...input, verificacionConfirmada: false }), /CONSULTA_PRIVACIDAD_NO_DISPONIBLE/);
    const receivedCase = await tramitarConsultaPrivacidad(db, actor, { accion: "RECIBIR", empresaId: tenant, consecutivo: input.consecutivo, recibido: received });
    caseId = receivedCase.casoId;
    assert.equal(receivedCase.estado, "RECIBIDA");
    assert.equal((await tramitarConsultaPrivacidad(db, actor, { accion: "CONSULTAR", casoId: caseId })).vencimientoRespuesta, sumarHabiles(received, 10));
    const [first, replay] = await Promise.all([tramitarConsultaPrivacidad(db, actor, input), tramitarConsultaPrivacidad(db, actor, input)]);
    caseId = first.casoId;
    assert.equal(first.casoId, receivedCase.casoId);
    assert.deepEqual(first, replay);
    await otherOperator.set({ uid: otherUid, estado: "ACTIVO", versionAutorizacion: 1, facultades: ["PRIVACIDAD_CONSULTAS_TRAMITAR"] });
    await assert.rejects(tramitarConsultaPrivacidad(db, otherActor, { accion: "CONSULTAR", casoId: caseId }), /CONSULTA_PRIVACIDAD_NO_DISPONIBLE/);
    await assert.rejects(tramitarConsultaPrivacidad(db, actor, { ...input, identidadRef: "otra" }), /CONSULTA_PRIVACIDAD_NO_DISPONIBLE/);
    let detail = await tramitarConsultaPrivacidad(db, actor, { accion: "CONSULTAR", casoId: caseId });
    assert.equal(detail.vencimientoRespuesta, sumarHabiles(received, 10));
    await tramitarConsultaPrivacidad(db, actor, { accion: "PRORROGAR", casoId: caseId, referencia: "aviso", resultado: "Revisión en curso" });
    detail = await tramitarConsultaPrivacidad(db, actor, { accion: "CONSULTAR", casoId: caseId });
    assert.equal(detail.vencimientoRespuesta, sumarHabiles(sumarHabiles(received, 10), 5));
    await assert.rejects(tramitarConsultaPrivacidad(db, actor, { accion: "PRORROGAR", casoId: caseId, referencia: "otro", resultado: "otro" }), /CONSULTA_PRIVACIDAD_NO_DISPONIBLE/);
    const response = { accion: "RESPONDER", casoId: caseId, referencia: "respuesta", resultado: "Comunicada" };
    await tramitarConsultaPrivacidad(db, actor, response);
    await tramitarConsultaPrivacidad(db, actor, response);
    assert.equal((await tramitarConsultaPrivacidad(db, actor, { accion: "CONSULTAR", casoId: caseId })).estado, "RESPONDIDA");
    await operator.update({ estado: "REVOCADO", versionAutorizacion: 2 });
    await assert.rejects(tramitarConsultaPrivacidad(db, actor, { accion: "CONSULTAR", casoId: caseId }), /PLATFORM_ACCESS_DENIED/);
  } finally {
    if (caseId) await db.collection("privacidad_consultas").doc(caseId).delete();
    await Promise.all([operator.delete(), otherOperator.delete(), company.delete()]);
    await deleteApp(app);
  }
});
