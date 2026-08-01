import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { esIdComercial } from "../../../lib/suscripciones/contrato";
import { consultarIncorporacionDirectaMasReciente } from "../incorporaciones-service";
import { idCredencialOperativa } from "../contracts";
import { crearObligacionAuditoria, emitirObligacionAuditoria } from "./audit";
import { autorizarPlataforma, type TokenPlataforma } from "./authorization";
import type { EnvelopePlataforma } from "./contracts";
import { revalidarDestinoAdministrableEnTransaccion } from "./provisionar-credencial-inicial-tenant";
import { validarEnvelope } from "./validation";

const huella = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function desbloquearAdministradorInicialTenant(
  db: Firestore, actorUid: string, entrada: EnvelopePlataforma & { empresaId: string }, token: TokenPlataforma,
) {
  validarEnvelope(entrada);
  if (!esIdComercial(entrada.empresaId)) throw new HttpsError("invalid-argument", "EMPRESA_ID_INVALIDO");
  const fingerprint = huella({ tipo: "DesbloquearAdministradorInicialTenant", ...entrada });
  const comandoRef = db.collection("saas_comandos").doc(`admin_initial_unlock_${entrada.idempotencyKey}`);
  const resultado = await db.runTransaction(async (tx) => {
    const previo = await tx.get(comandoRef);
    if (previo.exists) {
      if (previo.data()!.fingerprint !== fingerprint) throw new HttpsError("already-exists", "IDEMPOTENCY_CONFLICT");
      return { ...previo.data()!.resultado, obligacionId: previo.data()!.obligacionId, idempotente: true };
    }
    await autorizarPlataforma(db, actorUid, token, "LIFECYCLE_GOBERNAR", tx);
    const empresaSnap = await tx.get(db.collection("empresas").doc(entrada.empresaId));
    if (!empresaSnap.exists || typeof empresaSnap.data()?.ownerUid !== "string") {
      throw new HttpsError(empresaSnap.exists ? "failed-precondition" : "not-found", empresaSnap.exists ? "EMPRESA_SIN_OWNER" : "EMPRESA_NOT_FOUND");
    }
    const ownerUid = empresaSnap.data()!.ownerUid as string;
    await revalidarDestinoAdministrableEnTransaccion(db, tx, entrada.empresaId, ownerUid);
    const incorporaciones = await tx.get(consultarIncorporacionDirectaMasReciente(db, entrada.empresaId, ownerUid));
    if (incorporaciones.size !== 1) throw new HttpsError("failed-precondition", "CREDENCIAL_INICIAL_NO_DISPONIBLE");
    const incorporacion = incorporaciones.docs[0];
    const data = incorporacion.data() as Record<string, unknown>;
    const expiraEn = data.expiraEn as { toMillis?: () => number } | undefined;
    const temporalVigente = data.estado === "TEMP_CREDENTIAL" && typeof expiraEn?.toMillis === "function" && expiraEn.toMillis() > Date.now();
    if (data.mecanismo !== "DIRECTA" || data.uid !== ownerUid || typeof data.codigo !== "string"
      || (data.estado !== "ACTIVE" && !temporalVigente)) {
      throw new HttpsError("failed-precondition", "CREDENCIAL_INICIAL_NO_DISPONIBLE");
    }
    const credencialRef = db.collection("credenciales_operativas").doc(idCredencialOperativa(entrada.empresaId, data.codigo));
    const credencialSnap = await tx.get(credencialRef);
    const credencial = credencialSnap.data() as Record<string, unknown> | undefined;
    const asociada = credencialSnap.exists && credencial?.empresaId === entrada.empresaId && credencial.uid === ownerUid
      && credencial.codigo === data.codigo && credencial.incorporacionId === incorporacion.id && credencial.activo === true
      && (data.estado === "ACTIVE" ? credencial.requiereCambio !== true : credencial.requiereCambio === true);
    if (!asociada) throw new HttpsError("failed-precondition", "CREDENCIAL_INICIAL_NO_DISPONIBLE");
    const bloqueadoHasta = credencial!.bloqueadoHasta as { toMillis?: () => number } | null | undefined;
    if (typeof bloqueadoHasta?.toMillis !== "function" || bloqueadoHasta.toMillis() <= Date.now()) {
      throw new HttpsError("failed-precondition", "CREDENCIAL_INICIAL_NO_BLOQUEADA");
    }
    tx.update(credencialRef, { fallosConsecutivos: 0, bloqueadoHasta: null, actualizadaEn: FieldValue.serverTimestamp() });
    const durable = { empresaId: entrada.empresaId, estado: "DESBLOQUEADA" as const };
    const { obligacionId } = crearObligacionAuditoria(db, tx, {
      tipo: "CREDENCIAL_INICIAL_DESBLOQUEADA", resultado: "CONFIRMADO",
      actor: { tipo: "OPERADOR", uid: actorUid }, facultad: "LIFECYCLE_GOBERNAR",
      comando: { id: entrada.commandId, tipo: "DesbloquearAdministradorInicialTenant" },
      agregado: { tipo: "EMPRESA", id: entrada.empresaId }, empresaObjetivoId: entrada.empresaId,
      revision: { esperada: null, resultante: null }, correlacionId: entrada.correlationId,
      causacionId: entrada.causationId, motivo: { codigo: entrada.motivoCodigo, resumen: null },
      detalle: { camposLimpiados: ["fallosConsecutivos", "bloqueadoHasta"], idempotente: false },
    });
    tx.create(comandoRef, { commandId: entrada.commandId, idempotencyKey: entrada.idempotencyKey, fingerprint, resultado: durable, obligacionId, creadaEn: FieldValue.serverTimestamp() });
    return { ...durable, obligacionId, idempotente: false };
  });
  await emitirObligacionAuditoria(db, resultado.obligacionId);
  return resultado;
}
