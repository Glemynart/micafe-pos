import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { Messaging } from "firebase-admin/messaging";
import { randomUUID } from "node:crypto";

const AGENDA = "agenda_pedidos_bodega";
const RESERVAS = "reservas_stock_bodega";
const EVENTOS = "eventos_operativos";
const TIPOS_EVENTO_DESPACHABLES = ["RECORDATORIO_AGENDA_PEDIDO", "SOLICITUD_VENTA_BODEGA_PENDIENTE"] as const;
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const BATCH_LIMIT = 100;

function timestampMillis(value: unknown): number | null {
  return value && typeof (value as { toMillis?: unknown }).toMillis === "function"
    ? (value as { toMillis(): number }).toMillis()
    : null;
}

function requiredText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function internalCode(error: unknown): string {
  const value = error as { code?: unknown; errorInfo?: { code?: unknown } };
  const code = value?.code ?? value?.errorInfo?.code;
  return (typeof code === "string" ? code : "AGENDA_PUSH_ERROR").slice(0, 128);
}

async function expirarUnaReserva(db: any, candidate: any, now: number): Promise<boolean> {
  const parts = String(candidate.ref.path).split("/");
  if (parts.length !== 4 || parts[0] !== "empresas" || parts[2] !== RESERVAS) return false;
  const [, empresaId, , reservaId] = parts;
  const reservaRef = candidate.ref;
  const scheduleRef = db.collection("empresas").doc(empresaId).collection(AGENDA).doc(String(candidate.data()?.programacionId ?? ""));
  const productRef = db.collection("productos").doc(String(candidate.data()?.productoId ?? ""));
  return db.runTransaction(async (tx: any) => {
    const [reservaSnap, scheduleSnap, productSnap] = await Promise.all([
      tx.get(reservaRef), tx.get(scheduleRef), tx.get(productRef),
    ]);
    const reserva = reservaSnap.data() as Record<string, any> | undefined;
    const schedule = scheduleSnap.data() as Record<string, any> | undefined;
    const product = productSnap.data() as Record<string, any> | undefined;
    if (!reservaSnap.exists || reserva?.estado !== "ACTIVA" || reserva.empresaId !== empresaId) return false;
    const expires = timestampMillis(reserva.expiraEn);
    if (expires === null || expires > now) return false;
    const quantity = reserva.cantidadUnidadBase;
    if (!scheduleSnap.exists || schedule?.empresaId !== empresaId || schedule.programacionId !== reserva.programacionId
      // A schedule may have multiple product holds. The first due hold marks
      // the parent expired; subsequent worker passes must still release its
      // remaining due holds instead of leaving stock reserved forever.
      || !["RESERVADA", "CONVERTIDA_A_SOLICITUD", "VENCIDA"].includes(schedule.estado)
      || !Array.isArray(schedule.reservaIds) || !schedule.reservaIds.includes(reservaId)
      || !productSnap.exists || product?.empresaId !== empresaId
      || !Number.isSafeInteger(quantity) || quantity <= 0) throw new Error("AGENDA_RESERVA_EXPIRY_INCONSISTENTE");
    const stock = product.stock;
    const stockReservado = product.stockReservado ?? 0;
    if (!Number.isSafeInteger(stock) || stock < 0 || !Number.isSafeInteger(stockReservado)
      || stockReservado < quantity || stockReservado > stock) throw new Error("AGENDA_STOCK_RESERVADO_INCONSISTENTE");
    tx.update(productRef, { stockReservado: stockReservado - quantity });
    tx.update(reservaRef, { estado: "VENCIDA", vencidaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() });
    tx.update(scheduleRef, { estado: "VENCIDA", revision: schedule.revision + 1, vencidaEn: FieldValue.serverTimestamp(), actualizadaEn: FieldValue.serverTimestamp() });
    return true;
  });
}

export async function expirarReservasAgendaBodega(db: any, now = Date.now(), limit = BATCH_LIMIT): Promise<number> {
  let vencidas = 0;
  const vistos = new Set<string>();
  while (vistos.size < limit) {
    const candidates = await db.collectionGroup(RESERVAS)
      .where("estado", "==", "ACTIVA")
      .where("expiraEn", "<=", Timestamp.fromMillis(now))
      .limit(Math.min(50, limit - vistos.size))
      .get();
    const nuevos = candidates.docs.filter((doc: any) => !vistos.has(doc.ref.path));
    if (nuevos.length === 0) break;
    for (const doc of nuevos) {
      vistos.add(doc.ref.path);
      try { if (await expirarUnaReserva(db, doc, now)) vencidas += 1; }
      catch (error) { console.error("[agenda-bodega] No se liberó una reserva inconsistente.", internalCode(error)); }
    }
  }
  return vencidas;
}

interface Claim {
  ref: any;
  claimId: string;
  intentos: number;
  data: Record<string, any>;
}

async function reclamarEvento(db: any, ref: any, now: number): Promise<Claim | null> {
  const claimId = randomUUID();
  return db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const data = snap.data() as Record<string, any> | undefined;
    if (!snap.exists || !data || !TIPOS_EVENTO_DESPACHABLES.includes(data.tipo)) return null;
    const state = data.estadoDespacho;
    const due = timestampMillis(data.fechaDisponible);
    if (due === null || due > now) return null;
    if (!["PENDIENTE", "REINTENTAR", "ENVIANDO"].includes(state)) return null;
    if (state === "ENVIANDO") {
      const lockedAt = timestampMillis(data.reclamadoEn);
      if (lockedAt !== null && lockedAt > now - CLAIM_TIMEOUT_MS) return null;
    }
    const intentos = Number.isSafeInteger(data.intentos) && data.intentos >= 0 ? data.intentos + 1 : 1;
    if (intentos > MAX_ATTEMPTS) {
      const code = data.tipo === "SOLICITUD_VENTA_BODEGA_PENDIENTE" ? "SOLICITUD_PUSH_MAX_REINTENTOS" : "AGENDA_PUSH_MAX_REINTENTOS";
      tx.update(ref, { estadoDespacho: "FALLIDO", ultimoErrorCodigo: code, actualizadoEn: FieldValue.serverTimestamp() });
      return null;
    }
    tx.update(ref, {
      estadoDespacho: "ENVIANDO", intentos, claimId, reclamadoEn: Timestamp.fromMillis(now),
      ultimoIntentoEn: FieldValue.serverTimestamp(), actualizadoEn: FieldValue.serverTimestamp(),
    });
    return { ref, claimId, intentos, data };
  });
}

async function marcarEvento(db: any, claim: Claim, state: string, now: number, errorCode: string | null = null): Promise<void> {
  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(claim.ref);
    const data = snap.data() as Record<string, any> | undefined;
    if (!snap.exists || data?.estadoDespacho !== "ENVIANDO" || data?.claimId !== claim.claimId) return;
    if (state === "REINTENTAR") {
      const backoff = Math.min(6 * 60 * 60 * 1000, 60_000 * (2 ** Math.min(claim.intentos - 1, 8)));
      tx.update(claim.ref, {
        estadoDespacho: state, fechaDisponible: Timestamp.fromMillis(now + backoff), claimId: null,
        reclamadoEn: null, ultimoErrorCodigo: errorCode, actualizadoEn: FieldValue.serverTimestamp(),
      });
      return;
    }
    tx.update(claim.ref, {
      estadoDespacho: state, claimId: null, reclamadoEn: null, ultimoErrorCodigo: errorCode,
      ...(state === "ENVIADO" ? { despachadoEn: FieldValue.serverTimestamp() } : {}),
      actualizadoEn: FieldValue.serverTimestamp(),
    });
  });
}

function mensaje(etapa: string) {
  switch (etapa) {
    case "creada": return { title: "Pedido agendado", body: "Hay un pedido Bodega pendiente de revisión." };
    case "reservada": return { title: "Pedido reservado", body: "La administración reservó stock para un pedido agendado." };
    case "dia_anterior": return { title: "Recordatorio de pedido", body: "Mañana está programado un pedido para atender." };
    case "fecha_programada": return { title: "Pedido para hoy", body: "Llegó la fecha programada para atender un pedido." };
    default: throw new Error("AGENDA_ETAPA_INVALIDA");
  }
}

async function despacharSolicitudPendiente(db: any, messaging: Messaging, claim: Claim, now: number): Promise<void> {
  const event = claim.data;
  const empresaId = event.empresaId;
  const solicitudId = event.agregado?.id;
  if (!requiredText(empresaId) || event.agregado?.tipo !== "SOLICITUD_VENTA_BODEGA"
    || !requiredText(solicitudId) || event.payloadOperativo?.solicitudId !== solicitudId) {
    throw new Error("SOLICITUD_PUSH_EVENTO_INVALIDO");
  }

  const solicitudRef = db.collection("empresas").doc(empresaId).collection("solicitudes_venta_bodega").doc(solicitudId);
  const solicitudSnap = await solicitudRef.get();
  const solicitud = solicitudSnap.data() as Record<string, any> | undefined;
  if (!solicitudSnap.exists || solicitud?.empresaId !== empresaId || solicitud?.solicitudId !== solicitudId
    || solicitud.estado !== "PENDIENTE_APROBACION") {
    await marcarEvento(db, claim, "OMITIDO", now, "SOLICITUD_NO_PENDIENTE");
    return;
  }

  const memberships = await db.collection("membresias").where("empresaId", "==", empresaId).get();
  const admins = new Set<string>();
  for (const membership of memberships.docs) {
    const value = membership.data() as Record<string, any>;
    if (value.empresaId === empresaId && value.estado === "activa" && value.activo === true
      && value.rol === "admin" && requiredText(value.uid)) admins.add(value.uid);
  }
  if (admins.size === 0) {
    await marcarEvento(db, claim, "SIN_DESTINATARIO", now);
    return;
  }

  const profiles = await db.getAll(...[...admins].map(uid => db.collection("usuarios").doc(uid)));
  const tokens = new Map<string, Set<string>>();
  const tokenOwners = new Map<string, Set<string>>();
  for (const profile of profiles) {
    if (!admins.has(profile.id) || !profile.exists) continue;
    const values = profile.data()?.fcmTokens;
    if (!Array.isArray(values)) continue;
    for (const token of values) {
      if (typeof token !== "string" || token.length === 0) continue;
      const owners = tokenOwners.get(token) ?? new Set<string>();
      owners.add(profile.id);
      tokenOwners.set(token, owners);
      tokens.set(token, owners);
    }
  }
  if (tokens.size === 0) {
    await marcarEvento(db, claim, "SIN_DESTINATARIO", now);
    return;
  }

  const invalidByUid = new Map<string, Set<string>>();
  let failed = false;
  let permanentErrorCode: string | null = null;
  let invalidRegistrationSeen = false;
  let delivered = 0;
  const targetTokens = [...tokens.keys()];
  for (let offset = 0; offset < targetTokens.length; offset += 500) {
    const chunk = targetTokens.slice(offset, offset + 500);
    const result = await messaging.sendEachForMulticast({
      tokens: chunk,
      data: {
        title: "Nueva solicitud de venta",
        body: "Hay una solicitud pendiente de revisión.",
        url: "/admin/solicitudes",
      },
    });
    result.responses.forEach((response, index) => {
      if (response.success) { delivered += 1; return; }
      const code = response.error?.code ?? "";
      if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code)) {
        invalidRegistrationSeen = true;
        const token = chunk[index];
        for (const uid of tokenOwners.get(token) ?? []) {
          const invalid = invalidByUid.get(uid) ?? new Set<string>(); invalid.add(token); invalidByUid.set(uid, invalid);
        }
        return;
      }
      if (code === "messaging/invalid-argument") { permanentErrorCode = code; return; }
      failed = true;
    });
  }
  for (const [uid, invalid] of invalidByUid) {
    await db.collection("usuarios").doc(uid).update({ fcmTokens: FieldValue.arrayRemove(...invalid) });
  }
  if (permanentErrorCode) await marcarEvento(db, claim, "FALLIDO", now, permanentErrorCode);
  else if (failed) {
    if (claim.intentos >= MAX_ATTEMPTS) await marcarEvento(db, claim, "FALLIDO", now, "SOLICITUD_PUSH_MAX_REINTENTOS");
    else await marcarEvento(db, claim, "REINTENTAR", now, "SOLICITUD_PUSH_TRANSITORIO");
  } else if (delivered === 0 && invalidRegistrationSeen) {
    await marcarEvento(db, claim, "SIN_DESTINATARIO", now, "SOLICITUD_PUSH_SIN_TOKENS_VALIDOS");
  } else await marcarEvento(db, claim, "ENVIADO", now);
}

async function despacharEvento(db: any, messaging: Messaging, claim: Claim, now: number): Promise<void> {
  const event = claim.data;
  if (event.tipo === "SOLICITUD_VENTA_BODEGA_PENDIENTE") {
    await despacharSolicitudPendiente(db, messaging, claim, now);
    return;
  }
  const empresaId = event.empresaId;
  const programacionId = event.agregado?.id;
  const etapa = event.payloadOperativo?.etapa;
  if (!requiredText(empresaId) || !requiredText(programacionId) || !requiredText(etapa)) throw new Error("AGENDA_EVENTO_INVALIDO");
  const scheduleRef = db.collection("empresas").doc(empresaId).collection(AGENDA).doc(programacionId);
  const scheduleSnap = await scheduleRef.get();
  const schedule = scheduleSnap.data() as Record<string, any> | undefined;
  if (!scheduleSnap.exists || schedule?.empresaId !== empresaId || schedule.programacionId !== programacionId) {
    await marcarEvento(db, claim, "OMITIDO", now, "AGENDA_NO_DISPONIBLE"); return;
  }
  const estadosVigentes = ["RESERVADA", "CONVERTIDA_A_SOLICITUD"];
  if ((etapa === "dia_anterior" || etapa === "fecha_programada" || etapa === "reservada")
    && !estadosVigentes.includes(schedule.estado)) {
    await marcarEvento(db, claim, "OMITIDO", now, "AGENDA_NO_VIGENTE"); return;
  }
  if (etapa === "creada" && ["CANCELADA", "VENCIDA", "CUMPLIDA"].includes(schedule.estado)) {
    await marcarEvento(db, claim, "OMITIDO", now, "AGENDA_NO_VIGENTE"); return;
  }
  const notification = mensaje(etapa);
  const memberships = await db.collection("membresias").where("empresaId", "==", empresaId).get();
  const recipients = new Map<string, "admin" | "vendedor">();
  for (const membership of memberships.docs) {
    const value = membership.data() as Record<string, any>;
    if (value.empresaId !== empresaId || value.estado !== "activa" || value.activo !== true || !requiredText(value.uid)) continue;
    if (value.uid === schedule.solicitanteUid && value.rol === "vendedor") recipients.set(value.uid, "vendedor");
    if (value.rol === "admin") recipients.set(value.uid, "admin");
  }
  if (recipients.size === 0) {
    await marcarEvento(db, claim, "SIN_DESTINATARIO", now); return;
  }
  const profiles = await db.getAll(...[...recipients.keys()].map(uid => db.collection("usuarios").doc(uid)));
  const tokens = new Map<string, Set<string>>();
  const tokenOwners = new Map<string, Set<string>>();
  for (const profile of profiles) {
    const recipientRole = recipients.get(profile.id);
    if (!recipientRole || !profile.exists) continue;
    const values = profile.data()?.fcmTokens;
    if (!Array.isArray(values)) continue;
    for (const token of values) {
      if (typeof token !== "string" || token.length === 0) continue;
      const roles = tokens.get(token) ?? new Set<string>();
      roles.add(recipientRole);
      tokens.set(token, roles);
      const owners = tokenOwners.get(token) ?? new Set<string>();
      owners.add(profile.id);
      tokenOwners.set(token, owners);
    }
  }
  if (tokens.size === 0) {
    await marcarEvento(db, claim, "SIN_DESTINATARIO", now); return;
  }
  const invalidByUid = new Map<string, Set<string>>();
  let failed = false;
  let permanentErrorCode: string | null = null;
  let invalidRegistrationSeen = false;
  let delivered = 0;
  const adminTokens = [...tokens].filter(([, roles]) => roles.has("admin")).map(([token]) => token);
  const sellerTokens = [...tokens].filter(([, roles]) => !roles.has("admin")).map(([token]) => token);
  for (const [targetTokens, url] of [[adminTokens, "/admin/agenda"], [sellerTokens, "/pos"]] as const) {
    for (let offset = 0; offset < targetTokens.length; offset += 500) {
      const chunk = targetTokens.slice(offset, offset + 500);
      const result = await messaging.sendEachForMulticast({
        tokens: chunk, data: {
          title: notification.title,
          body: notification.body,
          url,
          eventId: String(event.eventoId),
        },
      });
      result.responses.forEach((response, index) => {
        if (response.success) { delivered += 1; return; }
        const code = response.error?.code ?? "";
        if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(code)) {
          invalidRegistrationSeen = true;
          const token = chunk[index];
          for (const uid of tokenOwners.get(token) ?? []) {
            const invalid = invalidByUid.get(uid) ?? new Set<string>(); invalid.add(token); invalidByUid.set(uid, invalid);
          }
          return;
        }
        if (code === "messaging/invalid-argument") {
          permanentErrorCode = code;
          return;
        }
        failed = true;
      });
    }
  }
  for (const [uid, invalid] of invalidByUid) {
    await db.collection("usuarios").doc(uid).update({ fcmTokens: FieldValue.arrayRemove(...invalid) });
  }
  if (permanentErrorCode) {
    await marcarEvento(db, claim, "FALLIDO", now, permanentErrorCode);
  } else if (failed) {
    if (claim.intentos >= MAX_ATTEMPTS) await marcarEvento(db, claim, "FALLIDO", now, "AGENDA_PUSH_MAX_REINTENTOS");
    else await marcarEvento(db, claim, "REINTENTAR", now, "AGENDA_PUSH_TRANSITORIO");
  } else if (delivered === 0 && invalidRegistrationSeen) {
    await marcarEvento(db, claim, "SIN_DESTINATARIO", now, "AGENDA_PUSH_SIN_TOKENS_VALIDOS");
  } else {
    await marcarEvento(db, claim, "ENVIADO", now);
  }
}

async function despacharEventoPorId(db: any, messaging: Messaging, eventId: string, now: number): Promise<boolean> {
  const ref = db.collection(EVENTOS).doc(eventId);
  const claim = await reclamarEvento(db, ref, now);
  if (!claim) return false;
  try {
    await despacharEvento(db, messaging, claim, now);
  } catch (error) {
    const code = internalCode(error);
    if (claim.intentos >= MAX_ATTEMPTS) await marcarEvento(db, claim, "FALLIDO", now, code);
    else await marcarEvento(db, claim, "REINTENTAR", now, code);
  }
  return true;
}

export async function despacharNotificacionSolicitudVentaBodegaPendiente(db: any, messaging: Messaging, eventId: string, now = Date.now()): Promise<boolean> {
  const snap = await db.collection(EVENTOS).doc(eventId).get();
  if (!snap.exists || snap.data()?.tipo !== "SOLICITUD_VENTA_BODEGA_PENDIENTE") return false;
  return despacharEventoPorId(db, messaging, eventId, now);
}

export async function despacharEventosOperativosBodega(db: any, messaging: Messaging, now = Date.now(), limit = BATCH_LIMIT): Promise<number> {
  const vistos = new Set<string>();
  let enviados = 0;
  for (const tipo of TIPOS_EVENTO_DESPACHABLES) {
    while (vistos.size < limit) {
      const candidates = await db.collection(EVENTOS)
        .where("tipo", "==", tipo)
        .where("estadoDespacho", "in", ["PENDIENTE", "REINTENTAR", "ENVIANDO"])
        .where("fechaDisponible", "<=", Timestamp.fromMillis(now))
        .limit(Math.min(50, limit - vistos.size))
        .get();
      const nuevos = candidates.docs.filter((doc: any) => !vistos.has(doc.ref.path));
      if (nuevos.length === 0) break;
      for (const candidate of nuevos) {
        vistos.add(candidate.ref.path);
        if (await despacharEventoPorId(db, messaging, candidate.id, now)) enviados += 1;
      }
    }
  }
  return enviados;
}

export async function reconciliarAgendaPedidosBodega(db: any, messaging: Messaging, now = Date.now()) {
  const vencidas = await expirarReservasAgendaBodega(db, now);
  const procesadas = await despacharEventosOperativosBodega(db, messaging, now);
  return { vencidas, procesadas };
}
