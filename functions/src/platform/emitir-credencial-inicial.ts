import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { idCredencialOperativa, type OrigenIncorporacion, type RolTenant } from "../contracts";
import { consultarIncorporacionDirectaMasReciente, idIncorporacionDirecta, INCORPORACIONES_COLLECTION } from "../incorporaciones-service";
import { hashearPin } from "../pin-security";
import { derivarSlugParaCodigo, generarCodigoOperativoUnico, generarPinTemporal } from "./credencial-inicial";

/**
 * emitir-credencial-inicial.ts — servicio único de emisión de la credencial
 * operativa inicial de un tenant (ADR-SAAS-013).
 *
 * Único punto que escribe `credenciales_operativas` + `incorporaciones` (y
 * `usuarios` si falta) para este caso de uso. Tanto el paso H de
 * `ejecutarBootstrapEmpresarial` (Capa 2, tenant nuevo) como el comando
 * `ProvisionarCredencialInicialTenant` (Capa 3, tenant existente) consumen
 * esta función sin duplicar ninguna de sus reglas — ambos entry points
 * quedan reducidos a resolver SUS precondiciones propias (estado del
 * tenant, identidad del owner, membresía) e invocarla.
 *
 * Precondiciones que este servicio NO verifica (responsabilidad del
 * llamador, distinta en cada capa que lo consume): que la empresa esté en
 * un estado que permita provisionar, que `uid` sea el owner/admin correcto
 * de `empresaId`, que su membresía esté activa. Este servicio asume que ya
 * se verificó y se limita a la emisión idempotente para un (empresaId, uid)
 * ya autorizado.
 *
 * DECISIÓN DE ALCANCE (Capa 2): `uid` debe existir YA en Firebase Auth. Este
 * servicio nunca crea principals. La pregunta de si el bootstrap debe poder
 * crear la identidad del owner desde solo un nombre (para que el operador
 * del Backoffice no necesite obtener un UID de Firebase por su cuenta) es
 * una decisión explícita, todavía pendiente, que se registra en el cierre
 * de esta capa — no se decide implícitamente aquí.
 *
 * EXTENSIÓN (Capa 3, ADR-SAAS-013 §4.4 y §4.6): dos parámetros opcionales,
 * sin efecto sobre el llamador de Capa 2 (paso H del bootstrap), que nunca
 * los pasa:
 *   - `reemplazarIncorporacionId`: habilita el ÚNICO caso de reemisión
 *     admitido por el ADR — una incorporación anterior `TEMP_CREDENTIAL`
 *     nunca activada, o `EXPIRED`. El llamador (el comando
 *     `ProvisionarCredencialInicialTenant`, nunca el bootstrap) ya validó
 *     esa condición antes de invocar; este servicio revalida dentro de la
 *     transacción que el id coincide con la incorporación que encuentra,
 *     para no confiar ciegamente en una decisión tomada fuera de ella.
 *   - `auditObserver`: mismo patrón que `coreCommitObserver` en
 *     `ejecutarBootstrapEmpresarial` — registra una obligación de auditoría
 *     de plataforma en la MISMA transacción que el hecho durable, y solo se
 *     invoca cuando la transacción realmente crea o reemplaza una
 *     credencial (nunca en el camino idempotente `YA_EXISTENTE`, que no es
 *     un hecho nuevo).
 */

const CREDENCIALES_COLLECTION = "credenciales_operativas";
const USUARIOS_COLLECTION = "usuarios";

/** ADR-SAAS-013 D-3. */
export const TTL_CREDENCIAL_INICIAL_MS = 72 * 60 * 60 * 1000;

export type ResolverPrincipal = (uid: string) => Promise<{ displayName?: string | null }>;

export type AuditObserverCredencialInicial = (
  tx: Transaction,
  contexto: { empresaId: string; uid: string; incorporacionId: string; codigo: string; reemplazo: boolean },
) => { obligacionId: string } | void;

export interface ParametrosEmitirCredencialInicial {
  empresaId: string;
  uid: string;
  rol: RolTenant;
  permisos: string[];
  origen: OrigenIncorporacion;
  emisorUid: string;
  nombreComercial: string;
  pepper: string;
  ttlMs?: number;
  /** Inyectable para pruebas — por defecto, `getAuth().getUser(uid)`. */
  resolverPrincipal?: ResolverPrincipal;
  /**
   * Capa 3 (ADR-SAAS-013 §4.4). Cuando se provee y coincide, dentro de la
   * transacción, con la incorporación DIRECTA existente de (empresaId, uid),
   * esa incorporación pasa a `EXPIRED` y su credencial a `activo:false` en
   * la MISMA transacción que crea la nueva. Si no coincide (la incorporación
   * cambió entre la validación del llamador y esta transacción), se trata
   * como cualquier otra emisión existente: `YA_EXISTENTE`, sin reemplazar
   * nada — nunca se reemplaza a ciegas. Ausente en Capa 2 (paso H).
   */
  reemplazarIncorporacionId?: string;
  /** Ver documentación del módulo. */
  auditObserver?: AuditObserverCredencialInicial;
}

export interface CredencialInicialEmitida {
  incorporacionId: string;
  codigo: string;
  /** `null` cuando la emisión es idempotente sobre una credencial ya existente: nunca se reexpone un PIN ya entregado. */
  pinTemporal: string | null;
  estado: "EMITIDA" | "REEMITIDA" | "YA_EXISTENTE";
  /** Ver `AuditObserverCredencialInicial`. `null` si no se proveyó observador, o en el camino `YA_EXISTENTE`. */
  obligacionId: string | null;
}

export async function emitirCredencialInicial(
  db: Firestore,
  params: ParametrosEmitirCredencialInicial,
): Promise<CredencialInicialEmitida> {
  const { empresaId, uid, rol, permisos, origen, emisorUid, nombreComercial, pepper, reemplazarIncorporacionId, auditObserver } = params;
  const ttlMs = params.ttlMs ?? TTL_CREDENCIAL_INICIAL_MS;
  const resolverPrincipal = params.resolverPrincipal ?? ((u: string) => getAuth().getUser(u));

  // Idempotencia (verificación previa, optimización): la incorporación
  // DIRECTA más reciente de este uid en este tenant ya resuelve el caso, sea
  // de un reintento de este mismo paso o de una emisión anterior. No genera
  // ni hashea un PIN que se va a descartar. La corrección final no depende
  // de esta verificación —la garantiza la transacción de abajo— pero evita
  // trabajo (y una llamada a Auth) en el camino común de reintento.
  //
  // Excepción: si la incorporación encontrada es EXACTAMENTE la que el
  // llamador pidió reemplazar (Capa 3, §4.4), no se corta aquí — esa es
  // precisamente la que se espera encontrar antes de reemplazarla.
  const previa = await consultarIncorporacionDirectaMasReciente(db, empresaId, uid).get();
  if (previa.size === 1 && previa.docs[0].id !== reemplazarIncorporacionId) {
    const doc = previa.docs[0];
    const codigo = doc.get("codigo");
    if (typeof codigo !== "string") {
      throw new HttpsError("internal", "CREDENCIAL_INICIAL_ESTADO_INCONSISTENTE");
    }
    return { incorporacionId: doc.id, codigo, pinTemporal: null, estado: "YA_EXISTENTE", obligacionId: null };
  }

  // El principal debe existir ya (ver documentación del módulo). Lanza si no.
  const principal = await resolverPrincipal(uid);
  const nombre = principal.displayName?.trim() || "Administrador";

  const slug = derivarSlugParaCodigo(nombreComercial);
  const codigo = await generarCodigoOperativoUnico(db, slug);
  const pinTemporal = generarPinTemporal();
  const pinHash = await hashearPin(pinTemporal, pepper);
  const expiraEn = Timestamp.fromMillis(Date.now() + ttlMs);

  const incorporacionRef = db.collection(INCORPORACIONES_COLLECTION).doc(idIncorporacionDirecta(empresaId, codigo));
  const credencialRef = db.collection(CREDENCIALES_COLLECTION).doc(idCredencialOperativa(empresaId, codigo));
  const usuarioRef = db.collection(USUARIOS_COLLECTION).doc(uid);

  // La transacción es la única fuente de verdad de si esta llamada CREÓ la
  // credencial o encontró una ya creada por una escritura concurrente entre
  // la verificación previa y este punto. El `pinTemporal` devuelto al
  // llamador solo puede ser el que de verdad se persistió — nunca uno
  // generado en esta invocación y luego descartado por la transacción.
  //
  // El re-chequeo de idempotencia usa la MISMA consulta (empresaId, uid, más
  // reciente) que la verificación previa — no `tx.get(incorporacionRef)` por
  // el código recién generado. `incorporacionRef`/`credencialRef` dependen
  // de un código aleatorio distinto en cada invocación: dos llamadas
  // concurrentes para el mismo uid casi nunca generan el mismo código, así
  // que una comprobación indexada por código no detectaría la carrera entre
  // ellas. Indexar por (empresaId, uid) sí la detecta, porque ambas
  // invocaciones consultan exactamente el mismo conjunto de documentos
  // dentro de sus respectivas transacciones.
  const resultado = await db.runTransaction(async (tx) => {
    const [porUidSnap, credencialSnap, usuarioSnap] = await Promise.all([
      tx.get(consultarIncorporacionDirectaMasReciente(db, empresaId, uid)),
      tx.get(credencialRef),
      tx.get(usuarioRef),
    ]);
    let reemplazo = false;
    if (porUidSnap.size === 1) {
      const doc = porUidSnap.docs[0];
      // Solo se procede a reemplazar si la incorporación encontrada AHORA,
      // dentro de la transacción, sigue siendo exactamente la que el
      // llamador validó y pidió reemplazar. Si cambió (activación
      // concurrente, otro reemplazo que ya ganó), se trata como cualquier
      // otra emisión existente: se devuelve tal cual, sin tocar nada.
      const estadoActual = doc.get("estado");
      if (doc.id !== reemplazarIncorporacionId
        || (estadoActual !== "TEMP_CREDENTIAL" && estadoActual !== "EXPIRED")) {
        const codigoExistente = doc.get("codigo");
        if (typeof codigoExistente !== "string") {
          throw new HttpsError("internal", "CREDENCIAL_INICIAL_ESTADO_INCONSISTENTE");
        }
        return { creada: false as const, incorporacionId: doc.id, codigo: codigoExistente };
      }
      reemplazo = true;
    }
    if (credencialSnap.exists) {
      // El código, verificado único momentos antes, colisionó con una
      // escritura concurrente entre esa verificación y esta transacción.
      // Estadísticamente insignificante (ver credencial-inicial.ts) — se
      // falla explícito para que el llamador reintente con un código nuevo,
      // en vez de encubrirlo con un reintento silencioso aquí.
      throw new HttpsError("aborted", "CODIGO_OPERATIVO_COLISION_CONCURRENTE");
    }

    if (reemplazo) {
      const anterior = porUidSnap.docs[0];
      const codigoAnterior = anterior.get("codigo");
      if (typeof codigoAnterior !== "string") {
        throw new HttpsError("internal", "CREDENCIAL_INICIAL_ESTADO_INCONSISTENTE");
      }
      tx.update(db.collection(INCORPORACIONES_COLLECTION).doc(anterior.id), {
        estado: "EXPIRED",
        actualizadaEn: FieldValue.serverTimestamp(),
      });
      tx.update(db.collection(CREDENCIALES_COLLECTION).doc(idCredencialOperativa(empresaId, codigoAnterior)), {
        activo: false,
        actualizadaEn: FieldValue.serverTimestamp(),
      });
    }

    if (!usuarioSnap.exists) {
      tx.create(usuarioRef, {
        uid,
        nombre,
        creadoEn: FieldValue.serverTimestamp(),
      });
    }
    tx.create(credencialRef, {
      empresaId,
      uid,
      codigo,
      incorporacionId: incorporacionRef.id,
      pinHash,
      activo: true,
      requiereCambio: true,
      origen,
      expiraEn,
      fallosConsecutivos: 0,
      bloqueadoHasta: null,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
      pinActualizadoEn: FieldValue.serverTimestamp(),
    });
    tx.create(incorporacionRef, {
      empresaId,
      mecanismo: "DIRECTA",
      estado: "TEMP_CREDENTIAL",
      rol,
      permisosEfectivos: permisos,
      emitidaPorUid: emisorUid,
      uid,
      nombre,
      codigo,
      origen,
      expiraEn,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    const observado = auditObserver?.(tx, { empresaId, uid, incorporacionId: incorporacionRef.id, codigo, reemplazo });
    return {
      creada: true as const,
      incorporacionId: incorporacionRef.id,
      codigo,
      reemplazo,
      obligacionId: observado?.obligacionId ?? null,
    };
  });

  if (!resultado.creada) {
    return { incorporacionId: resultado.incorporacionId, codigo: resultado.codigo, pinTemporal: null, estado: "YA_EXISTENTE", obligacionId: null };
  }
  return {
    incorporacionId: resultado.incorporacionId,
    codigo: resultado.codigo,
    pinTemporal,
    estado: resultado.reemplazo ? "REEMITIDA" : "EMITIDA",
    obligacionId: resultado.obligacionId,
  };
}
