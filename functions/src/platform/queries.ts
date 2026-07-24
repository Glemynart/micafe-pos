import type { Firestore, Query } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export type RecursoPlataforma =
  | "empresas"
  | "planes"
  | "suscripciones"
  | "operadores"
  | "soporte"
  | "provisionamientos";

const COLECCIONES: Record<RecursoPlataforma, string> = {
  empresas: "empresas",
  planes: "planes",
  suscripciones: "suscripciones",
  operadores: "saas_operadores",
  soporte: "saas_soporte_autorizaciones",
  provisionamientos: "provisionamientos_empresariales",
};

function sanitizar(data: Record<string, any>) {
  const permitido = [
    "id", "empresaId", "nombre", "nombreComercial", "estado", "paisFiscal",
    "ownerUid", "revision", "planId", "planVersion", "trialInicio", "trialFin",
    "periodoInicio", "periodoFin", "graceFin", "uid", "facultades",
    "cancelacionProgramadaPara", "capacidades", "limites", "periodicidad", "grandfathered",
    "versionAutorizacion", "actualizadoEn", "creadoEn", "tipo", "resultado",
    "origen", "actor", "facultad", "comando", "agregado", "empresaObjetivoId",
    "correlacionId", "motivo", "registradoEn", "autorizacionId", "operadorUid",
    "solicitante", "alcanceCodigo", "expiraEn", "version", "provisionamientoId",
    "ultimoPasoConfirmado", "errorRecuperable", "codigo", "versionActual",
  ];
  return Object.fromEntries(permitido.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
}

export async function listarRecursosPlataforma(
  db: Firestore,
  recurso: RecursoPlataforma,
  opciones: { limite?: number; estado?: string; empresaId?: string; operadorUid?: string; cursor?: string } = {},
) {
  if (!(recurso in COLECCIONES)) throw new HttpsError("invalid-argument", "RECURSO_INVALIDO");
  const limite = Math.min(Math.max(Number(opciones.limite) || 25, 1), 100);
  let q: Query = db.collection(COLECCIONES[recurso]);
  if (opciones.estado) q = q.where("estado", "==", opciones.estado);
  if (opciones.empresaId && ["suscripciones", "soporte", "provisionamientos"].includes(recurso)) {
    const campo = recurso === "soporte" ? "empresaObjetivoId" : "empresaId";
    q = q.where(campo, "==", opciones.empresaId);
  }
  if (recurso === "soporte" && opciones.operadorUid) {
    q = q.where("operadorUid", "==", opciones.operadorUid);
  }
  const orden = recurso === "planes" || recurso === "suscripciones"
      ? "creadaEn"
      : "actualizadoEn";
  q = q.orderBy(orden, "desc").limit(limite);
  if (opciones.cursor) {
    const cursor = await db.collection(COLECCIONES[recurso]).doc(opciones.cursor).get();
    if (!cursor.exists) throw new HttpsError("invalid-argument", "CURSOR_INVALIDO");
    q = q.startAfter(cursor);
  }
  const snap = await q.get();
  const items = recurso === "planes"
    ? await Promise.all(snap.docs.map(async (doc) => {
        const root = doc.data();
        const versionActual = root.versionActual;
        const version = Number.isInteger(versionActual)
          ? await db.collection("planes").doc(doc.id).collection("versiones").doc(String(versionActual)).get()
          : null;
        return { id: doc.id, ...sanitizar(root), ...(version?.exists ? sanitizar(version.data()!) : {}) };
      }))
    : snap.docs.map((doc) => ({ id: doc.id, ...sanitizar(doc.data()) }));
  return {
    items,
    cursor: snap.docs.length === limite ? snap.docs.at(-1)!.id : null,
  };
}

export async function obtenerDetalleEmpresaPlataforma(db: Firestore, empresaId: string) {
  const [empresa, suscripcion, provisionamientos] = await Promise.all([
    db.collection("empresas").doc(empresaId).get(),
    db.collection("suscripciones").doc(empresaId).get(),
    db.collection("provisionamientos_empresariales").where("empresaId", "==", empresaId).limit(1).get(),
  ]);
  if (!empresa.exists) throw new HttpsError("not-found", "EMPRESA_NOT_FOUND");
  return {
    empresa: { id: empresa.id, ...sanitizar(empresa.data()!) },
    suscripcion: suscripcion.exists ? sanitizar(suscripcion.data()!) : null,
    provisionamiento: provisionamientos.empty ? null : sanitizar(provisionamientos.docs[0].data()),
  };
}

export type FiltroAuditoria =
  | { por: "comando"; valor: string }
  | { por: "agregado"; tipoAgregado: string; valor: string }
  | { por: "empresa"; valor: string; tipo: string }
  | { por: "actor"; valor: string; tipo: string }
  | { por: "tipo"; valor: string }
  | { por: "correlacion"; valor: string };

function textoFiltro(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validarFiltroAuditoria(value: unknown): FiltroAuditoria {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "FILTRO_AUDITORIA_INVALIDO");
  }
  const filtro = value as Record<string, unknown>;
  if (!textoFiltro(filtro.valor)) throw new HttpsError("invalid-argument", "FILTRO_AUDITORIA_INVALIDO");
  if (filtro.por === "comando" || filtro.por === "tipo" || filtro.por === "correlacion") {
    return { por: filtro.por, valor: filtro.valor };
  }
  if (filtro.por === "agregado" && textoFiltro(filtro.tipoAgregado)) {
    return { por: "agregado", tipoAgregado: filtro.tipoAgregado, valor: filtro.valor };
  }
  if ((filtro.por === "empresa" || filtro.por === "actor") && textoFiltro(filtro.tipo)) {
    return { por: filtro.por, tipo: filtro.tipo, valor: filtro.valor };
  }
  throw new HttpsError("invalid-argument", "FILTRO_AUDITORIA_INVALIDO");
}

export async function consultarAuditoriaPlataforma(
  db: Firestore,
  filtro: FiltroAuditoria,
  limiteSolicitado = 50,
  cursorId?: string,
) {
  const limite = Math.min(Math.max(Number(limiteSolicitado) || 50, 1), 100);
  let q: Query = db.collection("saas_auditoria");
  if (filtro.por === "comando") q = q.where("comando.id", "==", filtro.valor).orderBy("registradoEn", "desc");
  else if (filtro.por === "agregado") q = q.where("agregado.tipo", "==", filtro.tipoAgregado).where("agregado.id", "==", filtro.valor).orderBy("registradoEn", "desc");
  else if (filtro.por === "empresa") q = q.where("empresaObjetivoId", "==", filtro.valor).where("tipo", "==", filtro.tipo).orderBy("registradoEn", "desc");
  else if (filtro.por === "actor") q = q.where("actor.uid", "==", filtro.valor).where("tipo", "==", filtro.tipo).orderBy("registradoEn", "desc");
  else if (filtro.por === "tipo") q = q.where("tipo", "==", filtro.valor).orderBy("registradoEn", "desc");
  else q = q.where("correlacionId", "==", filtro.valor).orderBy("registradoEn", "asc");
  if (cursorId) {
    const cursor = await db.collection("saas_auditoria").doc(cursorId).get();
    if (!cursor.exists) throw new HttpsError("invalid-argument", "CURSOR_INVALIDO");
    q = q.startAfter(cursor);
  }
  const snap = await q.limit(limite).get();
  return {
    items: snap.docs.map((doc) => ({ id: doc.id, ...sanitizar(doc.data()) })),
    cursor: snap.docs.length === limite ? snap.docs.at(-1)!.id : null,
  };
}
