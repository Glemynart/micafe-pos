import { Timestamp, type Firestore, type Query } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { consultarIncorporacionDirectaMasReciente } from "../incorporaciones-service";

// ADR-SAAS-012 §3.1: familias Seguridad y Soporte B4. Consultarlas por `tipo` sin acotar
// a una Empresa o actor específico exige la ventana temporal obligatoria de §7.
const TIPOS_SEGURIDAD_O_SOPORTE = new Set([
  "AUTORIZACION_DENEGADA", "FACULTAD_AUSENTE", "OPERADOR_INACTIVO", "AUTOESCALAMIENTO_DENEGADO",
  "ALCANCE_DENEGADO", "CONTEXTO_PLATAFORMA_OBSOLETO", "CONFLICTO_IDEMPOTENCIA", "CONFLICTO_REVISION",
  "SOPORTE_SOLICITADO", "SOPORTE_RECHAZADO", "SOPORTE_AUTORIZADO", "SOPORTE_REVOCADO", "SOPORTE_EXPIRADO",
  "SOPORTE_INICIADO", "SOPORTE_FINALIZADO", "SOPORTE_ALCANCE_RECHAZADO",
  "SOPORTE_ACCESO_FUERA_DE_ALCANCE_DENEGADO", "SOPORTE_DIAGNOSTICO_ALTO_RIESGO",
]);

// ADR-SAAS-012 §7: límite máximo por patrón de consulta.
const LIMITE_MAXIMO_POR_FILTRO: Record<FiltroAuditoria["por"], number> = {
  comando: 20,
  agregado: 100,
  empresa: 100,
  actor: 100,
  tipo: 100,
  correlacion: 100,
};

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

// El campo de ordenación se declara por recurso porque el modelo de datos no usa
// un nombre único: los agregados femeninos (Empresa, Suscripción, Plan,
// autorización de soporte) persisten `creadaEn`/`actualizadaEn` y los masculinos
// (Operador, provisionamiento) `creadoEn`/`actualizadoEn`. Un `orderBy` sobre un
// campo que el documento no tiene no falla: Firestore excluye esos documentos y
// la consulta devuelve cero resultados en silencio, así que el nombre debe
// declararse junto a la colección y no derivarse de una condición.
const CAMPO_ORDEN: Record<RecursoPlataforma, string> = {
  empresas: "actualizadaEn",
  planes: "creadaEn",
  suscripciones: "creadaEn",
  operadores: "actualizadoEn",
  soporte: "actualizadaEn",
  provisionamientos: "actualizadoEn",
};

function sanitizar(data: Record<string, any>) {
  const permitido = [
    "id", "empresaId", "nombre", "nombreComercial", "estado", "paisFiscal",
    "ownerUid", "revision", "planId", "planVersion", "trialInicio", "trialFin",
    "periodoInicio", "periodoFin", "graceFin", "uid", "facultades",
    "cancelacionProgramadaPara", "capacidades", "limites", "periodicidad", "grandfathered",
    "versionAutorizacion", "actualizadoEn", "creadoEn", "actualizadaEn", "creadaEn",
    "tipo", "resultado",
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
  q = q.orderBy(CAMPO_ORDEN[recurso], "desc").limit(limite);
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

export type EstadoCredencialInicialProyectado = "SIN_PROVISIONAR" | "PENDIENTE_ACTIVACION" | "EXPIRADA" | "ACTIVA";

/**
 * ADR-SAAS-013 §5.3 — proyección derivada para la ficha de empresa del
 * Backoffice, SIN campo nuevo: se lee de `incorporaciones` (nunca de
 * `credenciales_operativas`, que es la única colección con `pinHash` — así
 * es estructuralmente imposible que esta consulta lo exponga).
 */
function proyectarEstadoCredencial(data: FirebaseFirestore.DocumentData | undefined): EstadoCredencialInicialProyectado {
  if (!data) return "SIN_PROVISIONAR";
  if (data.estado === "ACTIVE") return "ACTIVA";
  if (data.estado === "EXPIRED") return "EXPIRADA";
  if (data.estado === "TEMP_CREDENTIAL") {
    const expiraEn = data.expiraEn as { toMillis?: () => number } | undefined;
    const vencida = typeof expiraEn?.toMillis === "function" && expiraEn.toMillis() <= Date.now();
    return vencida ? "EXPIRADA" : "PENDIENTE_ACTIVACION";
  }
  return "SIN_PROVISIONAR";
}

export async function obtenerDetalleEmpresaPlataforma(db: Firestore, empresaId: string) {
  const [empresaSnap, suscripcion, provisionamientos] = await Promise.all([
    db.collection("empresas").doc(empresaId).get(),
    db.collection("suscripciones").doc(empresaId).get(),
    db.collection("provisionamientos_empresariales").where("empresaId", "==", empresaId).limit(1).get(),
  ]);
  if (!empresaSnap.exists) throw new HttpsError("not-found", "EMPRESA_NOT_FOUND");
  const empresaData = empresaSnap.data()!;
  const ownerUid = typeof empresaData.ownerUid === "string" ? empresaData.ownerUid : null;

  let adminInicial: { uid: string; rol: string | null; estado: string | null; activo: boolean | null } | null = null;
  let credencialInicial: { estado: EstadoCredencialInicialProyectado; codigo: string | null; incorporacionId: string | null; puedeReemitir: boolean } = {
    estado: "SIN_PROVISIONAR", codigo: null, incorporacionId: null, puedeReemitir: false,
  };

  if (ownerUid) {
    const [membresiaSnap, incorporacionesSnap] = await Promise.all([
      db.collection("membresias").doc(`${empresaId}_${ownerUid}`).get(),
      // Misma consulta compartida que gobierna emisión/reemisión — así la
      // ficha nunca muestra una credencial superada por una reemisión.
      consultarIncorporacionDirectaMasReciente(db, empresaId, ownerUid).get(),
    ]);
    const membresiaData = membresiaSnap.data();
    adminInicial = {
      uid: ownerUid,
      rol: typeof membresiaData?.rol === "string" ? membresiaData.rol : null,
      estado: typeof membresiaData?.estado === "string" ? membresiaData.estado : null,
      activo: typeof membresiaData?.activo === "boolean" ? membresiaData.activo : null,
    };
    const incorporacionData = incorporacionesSnap.empty ? undefined : incorporacionesSnap.docs[0].data();
    const estado = proyectarEstadoCredencial(incorporacionData);
    const expiraEn = incorporacionData?.expiraEn as { toMillis?: () => number } | undefined;
    const puedeReemitir = estado === "PENDIENTE_ACTIVACION"
      && incorporacionData?.origen === "PLATAFORMA"
      && typeof expiraEn?.toMillis === "function"
      && expiraEn.toMillis() > Date.now();
    credencialInicial = {
      estado,
      codigo: typeof incorporacionData?.codigo === "string" ? incorporacionData.codigo : null,
      incorporacionId: incorporacionesSnap.empty ? null : incorporacionesSnap.docs[0].id,
      puedeReemitir,
    };
  }

  return {
    empresa: { id: empresaSnap.id, ...sanitizar(empresaData) },
    suscripcion: suscripcion.exists ? sanitizar(suscripcion.data()!) : null,
    provisionamiento: provisionamientos.empty ? null : sanitizar(provisionamientos.docs[0].data()),
    adminInicial,
    credencialInicial,
  };
}

export type FiltroAuditoria =
  | { por: "comando"; valor: string }
  | { por: "agregado"; tipoAgregado: string; valor: string }
  | { por: "empresa"; valor: string; tipo: string }
  | { por: "actor"; valor: string; tipo: string }
  | { por: "tipo"; valor: string; ventana?: { desde: number; hasta: number } }
  | { por: "correlacion"; valor: string };

function textoFiltro(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function ventanaValida(value: unknown): value is { desde: number; hasta: number } {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return Number.isFinite(v.desde) && Number.isFinite(v.hasta) && (v.desde as number) < (v.hasta as number);
}

export function validarFiltroAuditoria(value: unknown): FiltroAuditoria {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "FILTRO_AUDITORIA_INVALIDO");
  }
  const filtro = value as Record<string, unknown>;
  if (!textoFiltro(filtro.valor)) throw new HttpsError("invalid-argument", "FILTRO_AUDITORIA_INVALIDO");
  if (filtro.por === "comando" || filtro.por === "correlacion") {
    return { por: filtro.por, valor: filtro.valor };
  }
  if (filtro.por === "tipo") {
    // ADR-SAAS-012 §7: consultar globalmente por un tipo de Seguridad/Soporte exige
    // ventana temporal obligatoria; los demás tipos conservan el comportamiento previo.
    if (TIPOS_SEGURIDAD_O_SOPORTE.has(filtro.valor)) {
      if (!ventanaValida(filtro.ventana)) {
        throw new HttpsError("invalid-argument", "VENTANA_TEMPORAL_REQUERIDA");
      }
      return { por: "tipo", valor: filtro.valor, ventana: filtro.ventana };
    }
    return { por: "tipo", valor: filtro.valor };
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
  const tope = LIMITE_MAXIMO_POR_FILTRO[filtro.por];
  const limite = Math.min(Math.max(Number(limiteSolicitado) || tope, 1), tope);
  let q: Query = db.collection("saas_auditoria");
  if (filtro.por === "comando") q = q.where("comando.id", "==", filtro.valor).orderBy("registradoEn", "desc");
  else if (filtro.por === "agregado") q = q.where("agregado.tipo", "==", filtro.tipoAgregado).where("agregado.id", "==", filtro.valor).orderBy("registradoEn", "desc");
  else if (filtro.por === "empresa") q = q.where("empresaObjetivoId", "==", filtro.valor).where("tipo", "==", filtro.tipo).orderBy("registradoEn", "desc");
  else if (filtro.por === "actor") q = q.where("actor.uid", "==", filtro.valor).where("tipo", "==", filtro.tipo).orderBy("registradoEn", "desc");
  else if (filtro.por === "tipo") {
    q = q.where("tipo", "==", filtro.valor);
    if (filtro.ventana) {
      q = q.where("registradoEn", ">=", Timestamp.fromMillis(filtro.ventana.desde))
        .where("registradoEn", "<=", Timestamp.fromMillis(filtro.ventana.hasta));
    }
    q = q.orderBy("registradoEn", "desc");
  } else q = q.where("correlacionId", "==", filtro.valor).orderBy("registradoEn", "asc");
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
