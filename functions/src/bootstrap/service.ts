import { createHash } from "node:crypto";
import { FieldValue, getFirestore, type Firestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { esIdComercial, fechaComercialUtc, type PlanVersion } from "../../../lib/suscripciones/contrato";
import type { EntradaBootstrapEmpresarial, ProvisionamientoEmpresarial, ResultadoBootstrapEmpresarial } from "../../../lib/bootstrap/contrato";
import { inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion } from "../configuracion/service";
import { crearSuscripcionTrialEnTransaccion, referenciasTrial } from "../suscripciones/service";
import { actualizarClaimsTenant, permisosPredeterminados } from "../operational-auth";
import { emitirCredencialInicial } from "../platform/emitir-credencial-inicial";
import { crearIdentificadorInterno } from "../turnos/identificadores";

/**
 * Mismo secreto que declaran `operational-auth.ts`/`incorporaciones.ts` —
 * `defineSecret` se resuelve por nombre en runtime; cada módulo que lo
 * necesita declara su propia referencia (patrón ya establecido en este
 * repo). La función Cloud que envuelva `ejecutarBootstrapEmpresarial` debe
 * declarar `secrets: [PIN_PEPPER]` para que `.value()` resuelva en runtime.
 */
const PIN_PEPPER = defineSecret("OPERATIONAL_PIN_PEPPER");

export const PROVISIONAMIENTOS_COLLECTION = "provisionamientos_empresariales";
/**
 * ADR-SAAS-013 (Capa 4) — ancla de idempotencia para la creación del
 * principal de Auth cuando el llamador no provee `ownerUid` (`resolverIdentidadOwner`).
 * Permanente, no efímera: mismo ciclo de vida que `provisionamientos_empresariales`
 * (tampoco se borra al completar). Responsabilidad única y acotada —
 * proveniencia de una identidad creada por Bootstrap: qué UID, para qué
 * empresa, cuándo. Nunca leída fuera de `resolverIdentidadOwner`; exige
 * regla de acceso denegado a clientes, igual que `credenciales_operativas`/
 * `incorporaciones` (§7.5 del ADR).
 *
 * Clave = `empresaId`, no `provisionamientoId`: el administrador inicial
 * pertenece conceptualmente a la empresa (a lo sumo uno por tenant), no al
 * intento de provisioning que lo originó. Con clave por intento, cada
 * reintento con un envelope nuevo (idempotencyKey distinto — el caso típico
 * cuando el operador reenvía el formulario tras un rechazo) fallaba en
 * encontrar el ancla anterior y creaba un principal de Auth adicional; ese
 * huérfano quedaba contenido (`disabled: true`, sin claims) pero se
 * acumulaba indefinidamente. Con clave por empresa, cualquier reintento
 * sobre la misma empresa — con el envelope que sea — encuentra y reutiliza
 * el mismo ancla.
 */
export const IDENTIDADES_OWNER_COLLECTION = "bootstrap_identidades_owner";
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const id = (prefix: string, key: string) => `${prefix}_${hash(key)}`;
const fail = (code: "invalid-argument" | "already-exists" | "failed-precondition" | "not-found", msg: string): never => { throw new HttpsError(code, msg); };

function validarEntradaBootstrap(e: EntradaBootstrapEmpresarial): void {
  const tieneOwnerUid = e?.ownerUid !== undefined;
  const tieneNombreAdministrador = typeof e?.nombreAdministrador === "string" && e.nombreAdministrador.trim().length > 0;
  if (
    !e ||
    !esIdComercial(e.commandId) ||
    !esIdComercial(e.idempotencyKey) ||
    !esIdComercial(e.correlationId) ||
    !esIdComercial(e.causationId) ||
    // Exactamente uno: ownerUid (reutilizar un principal existente) o
    // nombreAdministrador (que Bootstrap cree el ancla). Ninguno de los dos,
    // o los dos a la vez, es una entrada ambigua — se rechaza (ADR-SAAS-013 Capa 4).
    tieneOwnerUid === tieneNombreAdministrador ||
    (tieneOwnerUid && !esIdComercial(e.ownerUid as string)) ||
    !esIdComercial(e.empresaId) ||
    typeof e.nombreComercial !== "string" ||
    !e.nombreComercial.trim() ||
    typeof e.paisFiscal !== "string" ||
    !e.paisFiscal.trim() ||
    !esIdComercial(e.planId) ||
    !Number.isInteger(e.planVersion) ||
    e.planVersion < 1
  ) {
    fail("invalid-argument", "ENTRADA_BOOTSTRAP_INVALIDA");
  }
}

export type ClaimsEmitter = (uid: string, empresaId: string, rol: "admin") => Promise<void>;
export type OwnerIdentityVerifier = (uid: string) => Promise<void>;
/**
 * ADR-SAAS-013 (Capa 4) — crea el principal de Auth ancla cuando el llamador
 * no provee `ownerUid`. Se crea `disabled: true`: es un ancla de
 * claims/membresía, no un mecanismo de login (el admin siempre entra por
 * código+PIN); `ejecutarBootstrapEmpresarial` lo habilita recién en el paso
 * de claims, para que un intento nunca completado no deje una cuenta viva.
 */
export type OwnerIdentityResolver = (nombreAdministrador: string) => Promise<{ uid: string }>;
export type OwnerIdentityEnabler = (uid: string) => Promise<void>;

/**
 * Resuelve el `ownerUid` cuando el llamador no lo provee, de forma segura
 * ante reintentos: `auth.createUser()` no es transaccional, así que la
 * idempotencia no viene de recalcular el UID (Firebase lo asigna), sino de
 * persistir el UID devuelto en un documento determinístico por `empresaId`
 * ANTES de continuar, y consultarlo primero en cada reintento — con ese
 * mismo `empresaId`, cualquiera que sea el envelope del reintento. Si el
 * proceso se interrumpe entre `resolver()` y ese `create()`, el intento
 * anterior queda huérfano en Auth — pero inerte (sin claims, sin membresía,
 * sin credencial, `disabled: true`), un riesgo acotado y aceptado de la
 * misma clase que otros ya documentados en este flujo. Esa ventana es,
 * deliberadamente, el ÚNICO caso que puede seguir produciendo un huérfano:
 * `create()` es atómico en Firestore, así que dos resoluciones concurrentes
 * para la misma empresa (dos invocaciones simultáneas, no una tras otra)
 * solo pueden dejar como mucho una perdedora — nunca una acumulación sin
 * límite por reintentos ordinarios.
 */
async function resolverIdentidadOwner(
  db: Firestore,
  empresaId: string,
  nombreAdministrador: string,
  resolver: OwnerIdentityResolver,
): Promise<string> {
  const identidadRef = db.collection(IDENTIDADES_OWNER_COLLECTION).doc(empresaId);
  const existente = await identidadRef.get();
  if (existente.exists) return (existente.data() as { ownerUid: string }).ownerUid;
  const { uid } = await resolver(nombreAdministrador);
  try {
    await identidadRef.create({ ownerUid: uid, nombreAdministrador, creadoEn: FieldValue.serverTimestamp() });
  } catch {
    // Perdió la carrera contra una resolución concurrente para la misma
    // empresa: el ancla ganadora ya está persistida. Se adopta esa, no la
    // recién creada — el `uid` de esta invocación queda como el único
    // huérfano posible de esta función, ya inerte por diseño.
    const ganadora = await identidadRef.get();
    if (!ganadora.exists) throw new HttpsError("internal", "IDENTIDAD_OWNER_ESTADO_INCONSISTENTE");
    return (ganadora.data() as { ownerUid: string }).ownerUid;
  }
  return uid;
}
/**
 * Paso H (ADR-SAAS-013): emite la credencial operativa inicial del owner.
 * Único punto de integración con `emitirCredencialInicial` — Capa 3
 * (`ProvisionarCredencialInicialTenant`) invoca esa misma función
 * directamente para tenants preexistentes, sin pasar por este tipo ni por
 * `ejecutarBootstrapEmpresarial`. Inyectable por la misma razón que
 * `ClaimsEmitter`: permite probar la orquestación de estados sin tocar
 * Firestore/Auth reales.
 */
export type CredentialIssuer = (params: {
  empresaId: string;
  uid: string;
  permisos: string[];
  nombreComercial: string;
}) => Promise<{ incorporacionId: string; codigo: string; pinTemporal: string | null; estado: "EMITIDA" | "YA_EXISTENTE" }>;
/**
 * Observador opcional de la capa de plataforma (ADR-SAAS-012 Anexo A). Puede registrar,
 * dentro de la misma transacción del hecho durable, una obligación de auditoría ya
 * identificada y devolver su `obligacionId` para que quede persistido junto al registro
 * de provisionamiento y un reintento idempotente lo recupere en vez de perderlo. No crea
 * Empresa, Membresía, claims ni ningún recurso tenant; ADR-SAAS-007 no se altera.
 */
export type BootstrapCoreCommitObserver = (
  tx: Transaction,
  provisionamiento: Pick<ProvisionamientoEmpresarial, "provisionamientoId" | "empresaId">,
) => { obligacionId: string } | void;

export async function ejecutarBootstrapEmpresarial(
  dbParam?: Firestore,
  entrada?: EntradaBootstrapEmpresarial,
  customClaimsEmitter?: ClaimsEmitter,
  ownerIdentityVerifier?: OwnerIdentityVerifier,
  coreCommitObserver?: BootstrapCoreCommitObserver,
  completionObserver?: BootstrapCoreCommitObserver,
  credentialIssuer?: CredentialIssuer,
  ownerIdentityResolver?: OwnerIdentityResolver,
  ownerIdentityEnabler?: OwnerIdentityEnabler,
): Promise<ResultadoBootstrapEmpresarial> {
  const db = dbParam ?? getFirestore();
  if (!entrada) return fail("invalid-argument", "ENTRADA_REQUERIDA");
  validarEntradaBootstrap(entrada);

  const provisionamientoId = id("prov", entrada.idempotencyKey);
  const provRef = db.collection(PROVISIONAMIENTOS_COLLECTION).doc(provisionamientoId);

  // 1. Verificaciones pre-transaccionales baratas, ANTES de tocar Auth: un
  // rechazo aquí (plan no publicado, plantilla de permisos ausente) no debe
  // crear ni consultar ninguna identidad. Este orden es deliberado — ver
  // nota en `resolverIdentidadOwner` sobre por qué la creación del ancla se
  // pospone hasta el último momento posible antes de la transacción.
  const planVersionRef = db.collection("planes").doc(entrada.planId).collection("versiones").doc(String(entrada.planVersion));
  const planSnap = await planVersionRef.get();
  if (!planSnap.exists || (planSnap.data() as PlanVersion).estado !== "PUBLICADA") {
    fail("failed-precondition", "PLAN_NOT_PUBLISHED");
  }
  const permisos = await permisosPredeterminados("admin", db);

  // 2. Identidad del owner: reutilizar un principal existente (ownerUid) o
  // crear el ancla (nombreAdministrador) — nunca ambos, validado arriba. La
  // creación es idempotente por `empresaId`, no por un UID derivado (ver
  // `resolverIdentidadOwner`).
  const ownerUidFueAportado = entrada.ownerUid !== undefined;
  let ownerUid: string;
  if (ownerUidFueAportado) {
    ownerUid = entrada.ownerUid as string;
    const verificarOwner = ownerIdentityVerifier ?? (async (uid: string) => {
      const { getAuth } = await import("firebase-admin/auth");
      await getAuth().getUser(uid);
    });
    await verificarOwner(ownerUid);
  } else {
    const resolver = ownerIdentityResolver ?? (async (nombreAdministrador: string) => {
      const { getAuth } = await import("firebase-admin/auth");
      const usuario = await getAuth().createUser({ displayName: nombreAdministrador, disabled: true });
      return { uid: usuario.uid };
    });
    ownerUid = await resolverIdentidadOwner(db, entrada.empresaId, entrada.nombreAdministrador as string, resolver);
  }

  // La procedencia se toma del ancla durable, no de la forma de este
  // reintento. Así un bootstrap que creó una identidad conserva sus claims y
  // su habilitación incluso si un reintento posterior aporta el mismo UID.
  const identidadAncla = await db.collection(IDENTIDADES_OWNER_COLLECTION).doc(entrada.empresaId).get();
  const identidadCreadaPorBootstrap = identidadAncla.exists
    && (identidadAncla.data() as { ownerUid?: string }).ownerUid === ownerUid;
  // Un principal aportado por el llamador debe completar la credencial
  // temporal antes de recibir el contexto del tenant. Las identidades que
  // crea Bootstrap conservan la emisión de claims y su habilitación actual.
  const debeEmitirClaims = identidadCreadaPorBootstrap;

  const fingerprint = hash({
    ownerUid,
    empresaId: entrada.empresaId,
    nombreComercial: entrada.nombreComercial.trim(),
    paisFiscal: entrada.paisFiscal.trim(),
    planId: entrada.planId,
    planVersion: entrada.planVersion,
  });

  // 3. Commit atómico del núcleo (Transacción Firestore)
  const trialDias = entrada.trialDias ?? 30;
  const planContratado = planSnap.data() as PlanVersion;
  if (planContratado.periodicidad === "ANUAL" && trialDias !== 30) {
    fail("invalid-argument", "TRIAL_ANUAL_DEBE_SER_30_DIAS");
  }
  const hoyMs = Date.now();
  const trialInicio = fechaComercialUtc(new Date(hoyMs));
  const trialFin = fechaComercialUtc(new Date(hoyMs + trialDias * 86400000));
  const entradaTrial = {
    commandId: entrada.commandId,
    idempotencyKey: `sub_${entrada.idempotencyKey}`,
    correlationId: entrada.correlationId,
    causationId: entrada.causationId,
    expectedRevision: 1,
    motivo: "BOOTSTRAP_TRIAL",
    empresaId: entrada.empresaId,
    planId: entrada.planId,
    planVersion: entrada.planVersion,
    trialInicio,
    trialFin,
  };
  const refsTrial = referenciasTrial(db, entradaTrial);

  const transaccionResultado = await db.runTransaction(async (tx) => {
    const provSnap = await tx.get(provRef);
    if (provSnap.exists) {
      const actual = provSnap.data() as ProvisionamientoEmpresarial;
      if (actual.idempotencyKey !== entrada.idempotencyKey || actual.fingerprint !== fingerprint) {
        fail("already-exists", "IDEMPOTENCY_CONFLICT");
      }
      return { yaCometido: true, prov: actual };
    }

    const empresaRef = db.collection("empresas").doc(entrada.empresaId);
    const subRef = db.collection("suscripciones").doc(entrada.empresaId);
    const configRef = db.collection("configuraciones").doc(entrada.empresaId);
    const cuentaReservadaId = (claveOperativa: "caja-principal" | "caja-fuerte") => crearIdentificadorInterno(
      entrada.empresaId,
      `cuenta:${claveOperativa}`,
    );
    const cuentaReservadaRef = (claveOperativa: "caja-principal" | "caja-fuerte") => db.collection("cuentas_bancarias")
      .doc(cuentaReservadaId(claveOperativa));
    const cajaPrincipalRef = cuentaReservadaRef("caja-principal");
    const cajaFuerteRef = cuentaReservadaRef("caja-fuerte");
    const [empresaSnap, subSnap, configSnap, comandoTrialSnap, commandIdTrialSnap, planTrialSnap, cajaPrincipalSnap, cajaFuerteSnap] = await Promise.all([
      tx.get(empresaRef),
      tx.get(subRef),
      tx.get(configRef),
      tx.get(refsTrial.comando),
      tx.get(refsTrial.commandId),
      tx.get(refsTrial.plan),
      tx.get(cajaPrincipalRef),
      tx.get(cajaFuerteRef),
    ]);

    if (empresaSnap.exists || subSnap.exists) {
      fail("already-exists", "EMPRESA_ALREADY_EXISTS");
    }

    const empresaInicial = {
      id: entrada.empresaId,
      empresaId: entrada.empresaId,
      nombre: entrada.nombreComercial.trim(),
      nombreComercial: entrada.nombreComercial.trim(),
      ownerUid,
      paisFiscal: entrada.paisFiscal.trim(),
      estado: "trial",
      esFundacional: false,
      revision: 1,
      schemaVersion: 1,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    };
    tx.create(empresaRef, empresaInicial);

    // R1-B §5.1: el bootstrap de un tenant no fundacional materializa las
    // dos claves reservadas con IDs internos tenant-scoped, sin ledger ni
    // réplica de los IDs legacy de la empresa fundacional.
    if (cajaPrincipalSnap.exists || cajaFuerteSnap.exists) fail("already-exists", "CUENTAS_RESERVADAS_INCONSISTENTES");
    for (const [claveOperativa, ref] of [["caja-principal", cajaPrincipalRef], ["caja-fuerte", cajaFuerteRef]] as const) {
      tx.create(ref, {
        id: cuentaReservadaId(claveOperativa),
        empresaId: entrada.empresaId,
        claveOperativa,
        nombre: claveOperativa === "caja-principal" ? "Caja principal" : "Caja fuerte",
        tipo: "efectivo",
        saldo: 0,
        estado: "activa",
        creadaEn: FieldValue.serverTimestamp(),
        actualizadaEn: FieldValue.serverTimestamp(),
      });
    }

    // B. Configuración inicial (B1)
    inicializarConfiguracionEmpresaConEstadoPreleidoEnTransaccion(db, tx, {
      empresaId: entrada.empresaId,
      nombreComercial: entrada.nombreComercial.trim(),
      paisFiscal: entrada.paisFiscal.trim(),
      commandId: entrada.commandId,
      correlationId: entrada.correlationId,
      origen: "BOOTSTRAP",
    }, empresaInicial, configSnap);

    // C. Espacio inicial
    const espacioId = `esp_${entrada.empresaId}_1`;
    tx.create(db.collection("espacios").doc(espacioId), {
      id: espacioId,
      empresaId: entrada.empresaId,
      nombre: "Espacio Principal",
      activo: true,
      creadoEn: FieldValue.serverTimestamp(),
    });

    // D. Numeración inicial en BORRADOR (B2)
    const numeracionId = `num_${entrada.empresaId}_1`;
    tx.create(db.collection("numeraciones").doc(`${entrada.empresaId}_${numeracionId}`), {
      empresaId: entrada.empresaId,
      numeracionId,
      paisFiscal: entrada.paisFiscal.trim(),
      tipoDocumento: "pos",
      scope: "EMPRESA",
      prefijo: "POS",
      resolucion: "BORRADOR_INICIAL",
      rangoInicio: 1,
      rangoFin: 1000,
      ultimoAsignado: 0,
      vigenciaDesde: trialInicio,
      vigenciaHasta: "2099-12-31",
      estado: "BORRADOR",
      revision: 1,
      schemaVersion: 1,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    });

    // E. Membresía ADMIN del owner
    tx.create(db.collection("membresias").doc(`${entrada.empresaId}_${ownerUid}`), {
      empresaId: entrada.empresaId,
      uid: ownerUid,
      rol: "admin",
      permisos,
      estado: "activa",
      activo: true,
      creadaEn: FieldValue.serverTimestamp(),
      actualizadaEn: FieldValue.serverTimestamp(),
    });

    // F. Suscripción Trial (B3)
    await crearSuscripcionTrialEnTransaccion(
      db,
      tx,
      entradaTrial,
      { actorId: ownerUid, origen: "SYSTEM" },
      {
        comando: comandoTrialSnap,
        commandId: commandIdTrialSnap,
        plan: planTrialSnap,
        suscripcion: subSnap,
      },
    );

    // G. Registro de Provisionamiento (CORE_COMMITTED)
    const observadoCore = coreCommitObserver?.(tx, {
      provisionamientoId,
      empresaId: entrada.empresaId,
    });
    const prov: ProvisionamientoEmpresarial = {
      provisionamientoId,
      idempotencyKey: entrada.idempotencyKey,
      fingerprint,
      ownerUid,
      empresaId: entrada.empresaId,
      nombreComercial: entrada.nombreComercial.trim(),
      paisFiscal: entrada.paisFiscal.trim(),
      planId: entrada.planId,
      planVersion: entrada.planVersion,
      estado: "CORE_COMMITTED",
      ultimoPasoConfirmado: "CORE_COMMITTED",
      obligacionId: observadoCore?.obligacionId ?? null,
      schemaVersion: 1,
      creadoEn: FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    };
    tx.create(provRef, prov);

    return { yaCometido: false, prov };
  });

  if (transaccionResultado.prov.estado === "COMPLETED") {
    return {
      provisionamientoId,
      empresaId: entrada.empresaId,
      estado: "COMPLETED",
      claimsEmitidos: debeEmitirClaims,
      obligacionId: transaccionResultado.prov.obligacionId ?? null,
      obligacionCompletadoId: transaccionResultado.prov.obligacionCompletadoId ?? null,
      idempotente: true,
      credencialInicial: transaccionResultado.prov.credencialInicial
        ? { codigo: transaccionResultado.prov.credencialInicial.codigo, pinTemporal: null }
        : null,
    };
  }

  // 4. Paso recuperable de emisión de la credencial operativa inicial
  // (ADR-SAAS-013, paso H — entre CORE_COMMITTED y CLAIMS_ISSUED). Único
  // consumidor de `emitirCredencialInicial` en este flujo: no reimplementa
  // generación de código/PIN, verificación de identidad ni la transacción
  // de escritura — todo eso vive exclusivamente en ese servicio, que
  // Capa 3 (`ProvisionarCredencialInicialTenant`) reutilizará sin cambios.
  const issuer = credentialIssuer ?? (async (p) => emitirCredencialInicial(db, {
    empresaId: p.empresaId,
    uid: p.uid,
    rol: "admin",
    permisos: p.permisos,
    origen: "PLATAFORMA",
    // El bootstrap no tiene, en Capa 2, un "operador" distinto del propio
    // owner que lo solicita (self-service) o del sistema que lo ejecuta en
    // nombre del operador de plataforma (Backoffice) — en ambos casos, a
    // nivel del tenant recién creado, no hay todavía un admin distinto que
    // pudiera figurar como emisor. El actor real de la solicitud (el
    // operador de plataforma, cuando aplica) ya queda registrado en la
    // auditoría de plataforma de BOOTSTRAP_EMPRESARIAL_SOLICITADO.
    emisorUid: p.uid,
    nombreComercial: p.nombreComercial,
    pepper: PIN_PEPPER.value(),
  }));
  // Defensivo, igual que `claimsYaEmitidos` más abajo comprueba también su
  // propio estado directo: un provisionamiento leído ya en CLAIMS_ISSUED es
  // evidencia de que el paso H, anterior en la secuencia, tuvo que
  // completarse. (No se comprueba "COMPLETED": el chequeo de arriba ya
  // retorna en ese caso, así que aquí es inalcanzable — TS lo marca como
  // comparación imposible si se deja.)
  const credencialYaEmitida = transaccionResultado.prov.estado === "CREDENTIAL_ISSUED"
    || transaccionResultado.prov.estado === "CLAIMS_ISSUED"
    || (transaccionResultado.prov.estado === "RETRYABLE_FAILURE"
      && transaccionResultado.prov.ultimoPasoConfirmado !== undefined
      && transaccionResultado.prov.ultimoPasoConfirmado !== "CORE_COMMITTED");

  let credencialInicialResultado: { codigo: string; pinTemporal: string | null } | null = null;

  if (!credencialYaEmitida) {
    try {
      const emitida = await issuer({
        empresaId: entrada.empresaId,
        uid: ownerUid,
        permisos,
        nombreComercial: entrada.nombreComercial.trim(),
      });
      credencialInicialResultado = { codigo: emitida.codigo, pinTemporal: emitida.pinTemporal };
      await provRef.update({
        estado: "CREDENTIAL_ISSUED",
        ultimoPasoConfirmado: "CREDENTIAL_ISSUED",
        errorRecuperable: null,
        credencialInicial: {
          codigo: emitida.codigo,
          incorporacionId: emitida.incorporacionId,
          entregadaEn: FieldValue.serverTimestamp(),
        },
        actualizadoEn: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "CREDENCIAL_INICIAL_FAILED";
      await provRef.update({
        estado: "RETRYABLE_FAILURE",
        ultimoPasoConfirmado: "CORE_COMMITTED",
        errorRecuperable: errorMsg,
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      return {
        provisionamientoId,
        empresaId: entrada.empresaId,
        estado: "RETRYABLE_FAILURE",
        claimsEmitidos: false,
        idempotente: transaccionResultado.yaCometido,
        credencialInicial: null,
      };
    }
  } else if (transaccionResultado.prov.credencialInicial) {
    // Reintento tras un fallo posterior a este paso: la credencial ya fue
    // emitida antes. No se reexpone el PIN —nunca se persistió—, pero sí el
    // código, para que el llamador sepa cuál es.
    credencialInicialResultado = { codigo: transaccionResultado.prov.credencialInicial.codigo, pinTemporal: null };
  }

  // 5. Paso recuperable de emisión de Custom Claims
  const emitter = customClaimsEmitter ?? (async (u, e, r) => actualizarClaimsTenant(u, e, r));
  const claimsYaEmitidos = transaccionResultado.prov.estado === "CLAIMS_ISSUED"
    || (transaccionResultado.prov.estado === "RETRYABLE_FAILURE"
      && transaccionResultado.prov.ultimoPasoConfirmado === "CLAIMS_ISSUED");

  const habilitarIdentidad = ownerIdentityEnabler ?? (async (uid: string) => {
    const { getAuth } = await import("firebase-admin/auth");
    await getAuth().updateUser(uid, { disabled: false });
  });

  if (!claimsYaEmitidos) {
    try {
      if (debeEmitirClaims) {
        await emitter(ownerUid, entrada.empresaId, "admin");
      }
      // El ancla creada por este mismo Bootstrap nace `disabled: true`
      // (nunca es un mecanismo de login, solo un anclaje de claims); recién
      // aquí, con claims ya emitidos, se habilita — así un intento que nunca
      // llega a este punto no deja una cuenta utilizable. Si `ownerUid` fue
      // provisto por el llamador, su estado `disabled` no se toca: pudo
      // haber sido deshabilitado deliberadamente por una razón ajena a este
      // tenant.
      if (identidadCreadaPorBootstrap) await habilitarIdentidad(ownerUid);
      await provRef.update({
        estado: "CLAIMS_ISSUED",
        ultimoPasoConfirmado: "CLAIMS_ISSUED",
        errorRecuperable: null,
        actualizadoEn: FieldValue.serverTimestamp(),
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "AUTH_CLAIMS_FAILED";
      await provRef.update({
        estado: "RETRYABLE_FAILURE",
        // El último paso confirmado es CREDENTIAL_ISSUED, no CORE_COMMITTED:
        // para llegar aquí, el paso H (arriba) ya tuvo que completarse —
        // directamente o por replay idempotente de un intento anterior. Si
        // este campo quedara en CORE_COMMITTED, un reintento repetiría
        // innecesariamente el paso H (inocuo por su propia idempotencia,
        // pero no es el paso que realmente falló).
        ultimoPasoConfirmado: "CREDENTIAL_ISSUED",
        errorRecuperable: errorMsg,
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      return {
        provisionamientoId,
        empresaId: entrada.empresaId,
        estado: "RETRYABLE_FAILURE",
        claimsEmitidos: false,
        idempotente: transaccionResultado.yaCometido,
        credencialInicial: credencialInicialResultado,
      };
    }
  }

  try {
    const obligacionCompletadoId = await db.runTransaction(async (tx) => {
      // Lectura transaccional previa a cualquier escritura: si un commit concurrente ya
      // completó este mismo provisionamiento (reintento de Firestore tras conflicto de
      // versión), se reutiliza su obligacionCompletadoId ya persistido en vez de invocar
      // de nuevo el observador y generar una segunda obligación para el mismo hecho
      // (ADR-SAAS-012 §2.1: nunca un segundo CONFIRMADO del mismo hecho).
      const previo = (await tx.get(provRef)).data() as ProvisionamientoEmpresarial | undefined;
      if (previo?.estado === "COMPLETED") {
        return previo.obligacionCompletadoId ?? null;
      }
      const observadoCompletado = completionObserver?.(tx, { provisionamientoId, empresaId: entrada.empresaId });
      tx.update(provRef, {
        estado: "COMPLETED",
        ultimoPasoConfirmado: "COMPLETED",
        errorRecuperable: null,
        obligacionCompletadoId: observadoCompletado?.obligacionId ?? null,
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      return observadoCompletado?.obligacionId ?? null;
    });
    return {
      provisionamientoId,
      empresaId: entrada.empresaId,
      estado: "COMPLETED",
      claimsEmitidos: debeEmitirClaims,
      obligacionId: transaccionResultado.prov.obligacionId ?? null,
      obligacionCompletadoId,
      idempotente: transaccionResultado.yaCometido,
      credencialInicial: credencialInicialResultado,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "COMPLETION_PERSISTENCE_FAILED";
    await provRef.update({
      estado: "RETRYABLE_FAILURE",
      ultimoPasoConfirmado: "CLAIMS_ISSUED",
      errorRecuperable: errorMsg,
      actualizadoEn: FieldValue.serverTimestamp(),
    });
    return {
      provisionamientoId,
      empresaId: entrada.empresaId,
      estado: "RETRYABLE_FAILURE",
      claimsEmitidos: debeEmitirClaims,
      idempotente: transaccionResultado.yaCometido,
      credencialInicial: credencialInicialResultado,
    };
  }
}
