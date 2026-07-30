import {
  collection,
  doc,
  updateDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp,
  Timestamp,
  runTransaction,
  getDoc,
  increment,
  limit,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { onAuthStateChanged } from 'firebase/auth'
import { auth, db, getFirebaseFunctions } from './firebase'
import { calcularEgresosTurno } from './egresos-service'
import { tenantQuery, getEmpresaId, withEmpresaId } from '@/lib/tenant'
import {
  ABRIR_TURNO_OPERATIVO_V1,
  ErrorAperturaTurnoCliente,
  ejecutarAperturaPendiente,
  limpiarAperturaPendiente,
  limpiarYRechazarAperturaSinSesion,
  type AdaptadoresAperturaPendiente,
  type EnvelopeAbrirTurnoOperativo,
  type ResultadoAbrirTurnoOperativo,
} from '@/lib/turnos-apertura-r1a'

export interface Turno {
  id: string;
  cajeroId: string;
  cajeroNombre: string;
  fechaApertura: Timestamp;
  fechaCierre: Timestamp | null;
  estado: 'abierto' | 'cerrado';
  baseApertura: number;
  ventasEfectivo: number;
  ventasOtrosMetodos: number;
  totalEgresos?: number;
  totalEsperadoEfectivo: number;
  totalReportadoEfectivo: number;
  diferenciaEfectivo: number;
  notasApertura: string;
  notasCierre: string;
  esCierreDefinitivo?: boolean;
  turnoAnteriorId?: string | null;
  relevadoA?: string | null;
  alertaFaltante?: boolean;
  conteoDetalle?: Record<string, number>;
}

export interface AbrirTurnoParams {
  /** @deprecated La autoridad procede de la sesión; se ignora. */
  cajeroId?: string;
  /** @deprecated El nombre procede del perfil canónico; se ignora. */
  cajeroNombre?: string;
  baseApertura: number;
  notasApertura?: string;
  /** @deprecated El relevo no forma parte de R1-A; se ignora. */
  turnoAnteriorId?: string | null;
}

export interface CerrarTurnoParams {
  turnoId: string;
  ventasEfectivo: number;
  ventasOtrosMetodos: number;
  totalEgresos?: number;
  totalEsperadoEfectivo: number;
  totalReportadoEfectivo: number;
  diferenciaEfectivo: number;
  notasCierre?: string;
  esCierreDefinitivo?: boolean;
  relevoCajeroId?: string;
  relevoCajeroNombre?: string;
  umbralAlertaFaltante?: number;
  conteoDetalle?: Record<string, number>;
}

export interface CandidatoRelevo {
  uid: string;
  nombre: string;
}

/** Obtiene candidatos activos del tenant mediante el backend privilegiado. */
export async function obtenerCandidatosRelevo(): Promise<CandidatoRelevo[]> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("No hay una sesión activa.");

  const response = await fetch("/api/turnos/candidatos-relevo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("No fue posible cargar candidatos de relevo.");

  const data = await response.json() as { candidatos?: unknown };
  if (!Array.isArray(data.candidatos)) throw new Error("Respuesta de relevo inválida.");
  return data.candidatos.filter((candidato): candidato is CandidatoRelevo =>
    !!candidato
    && typeof candidato === "object"
    && typeof (candidato as CandidatoRelevo).uid === "string"
    && typeof (candidato as CandidatoRelevo).nombre === "string"
  );
}

let ultimoContextoApertura: { uid: string; empresaId: string } | null = null;
let desuscribirVigilanteApertura: (() => void) | null = null;

function adaptadoresAperturaNavegador(): AdaptadoresAperturaPendiente {
  let storage: AdaptadoresAperturaPendiente['storage'] = null;
  let locks: AdaptadoresAperturaPendiente['locks'] = null;
  try {
    const local = globalThis.localStorage;
    storage = {
      getItem: (key) => local.getItem(key),
      setItem: (key, value) => local.setItem(key, value),
      removeItem: (key) => local.removeItem(key),
      keys: () => Array.from({ length: local.length }, (_, index) => local.key(index)).filter((key): key is string => key !== null),
    };
  } catch { /* El helper convierte la ausencia en CLIENT_STORAGE_UNAVAILABLE. */ }
  try {
    locks = (globalThis.navigator as unknown as { locks?: AdaptadoresAperturaPendiente['locks'] }).locks ?? null;
  } catch { /* El helper convierte la ausencia en CLIENT_STORAGE_UNAVAILABLE. */ }
  return {
    storage,
    locks,
    now: () => Date.now(),
    generarId: () => globalThis.crypto?.randomUUID?.() ?? '',
    dormir: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

function vigilarLogoutCanonico(): void {
  if (desuscribirVigilanteApertura) return;
  desuscribirVigilanteApertura = onAuthStateChanged(auth, (usuario) => {
    if (usuario || !ultimoContextoApertura) return;
    const contextoPerdido = ultimoContextoApertura;
    ultimoContextoApertura = null;
    // `logout()` canónico concluye con Firebase signOut; este observador limpia la intención sin tocar UI.
    void limpiarAperturaPendiente(contextoPerdido, adaptadoresAperturaNavegador()).catch(() => undefined);
  });
}

/** Solicita la apertura al servidor; el cliente nunca crea ni adopta turnos. */
export async function abrirTurno(params: AbrirTurnoParams): Promise<string> {
  const adaptadores = adaptadoresAperturaNavegador();
  const uid = auth.currentUser?.uid;
  if (!uid) {
    const contextoPerdido = ultimoContextoApertura;
    ultimoContextoApertura = null;
    return limpiarYRechazarAperturaSinSesion(contextoPerdido, adaptadores);
  }
  let empresaId: string;
  try {
    empresaId = await getEmpresaId();
  } catch (error) {
    if (ultimoContextoApertura?.uid === uid) {
      const contextoPerdido = ultimoContextoApertura;
      ultimoContextoApertura = null;
      await limpiarAperturaPendiente(contextoPerdido, adaptadores);
    }
    throw error;
  }
  const contexto = { uid, empresaId };
  if (ultimoContextoApertura
    && (ultimoContextoApertura.uid !== contexto.uid || ultimoContextoApertura.empresaId !== contexto.empresaId)) {
    await limpiarAperturaPendiente(ultimoContextoApertura, adaptadores);
  }
  ultimoContextoApertura = contexto;
  vigilarLogoutCanonico();
  const callable = httpsCallable<EnvelopeAbrirTurnoOperativo, ResultadoAbrirTurnoOperativo>(
    getFirebaseFunctions(),
    ABRIR_TURNO_OPERATIVO_V1,
  );
  const resultado = await ejecutarAperturaPendiente(
    contexto,
    { baseApertura: params.baseApertura, notasApertura: params.notasApertura },
    async (envelope) => (await callable(envelope)).data,
    adaptadores,
  );
  return resultado.turnoId;
}

/**
 * Cierra un turno existente, guardando el cuadre de caja (Cierre Ciego).
 *
 * Lógica de depósito a Caja Fuerte (Modelo B – float fijo) [FASE-10C]:
 *   Fórmula unificada para relevo y cierre definitivo:
 *     depositoEfectivo = max(0, totalReportadoEfectivo - baseApertura)
 *   Solo se deposita el efectivo NETO de ventas; la base nunca se traslada
 *   digitalmente porque tampoco se acredita a caja-principal al abrir el turno.
 *   - Relevo: la base queda físicamente en caja para el siguiente cajero.
 *   - Cierre definitivo: la base se devuelve físicamente a la caja fuerte, sin
 *     movimiento digital (nunca tuvo registro de entrada).
 *   Depositar el reportado íntegro en cierre definitivo (comportamiento anterior)
 *   dejaba caja-principal en negativo cuando baseApertura > 0 — corregido aquí.
 *
 * La baseApertura se lee desde el documento del turno en Firestore (fuente de verdad),
 * no desde los parámetros del cliente.
 *
 * Estructura: todas las lecturas ocurren antes de cualquier escritura para cumplir
 * con las restricciones de transacciones de Firestore.
 */
export async function cerrarTurno(params: CerrarTurnoParams): Promise<void> {
  await httpsCallable(getFirebaseFunctions(), 'cerrarTurnoOperativoV1')({
    commandId: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), correlationId: crypto.randomUUID(), causationId: null,
    motivo: params.notasCierre ?? null,
    payload: { turnoId: params.turnoId, efectivoContado: params.totalReportadoEfectivo, relevoCajeroId: params.relevoCajeroId ?? null, conteoDetalle: params.conteoDetalle ?? null },
  })
  return
  const turnoRef = doc(db, 'turnos', params.turnoId);

  // MT-U3 Capa 3: resuelto UNA sola vez (§2.5) y reutilizado en el recálculo
  // de ventas/egresos y en el estampado dentro de la transacción.
  const empresaId = await getEmpresaId();

  // IMP-2: recalcular ventas y egresos desde la fuente de verdad antes de la transacción.
  // Los valores equivalentes en params se ignoran (pueden seguir enviándose por compatibilidad).
  const ventasRecalculadas = await calcularVentasTurno(params.turnoId, empresaId);
  const egresosRecalculados = await calcularEgresosTurno(params.turnoId, empresaId);

  await runTransaction(db, async (transaction) => {
    // ── FASE DE LECTURAS (todas antes de cualquier escritura) ────────
    const turnoDoc = await transaction.get(turnoRef);
    if (!turnoDoc.exists() || turnoDoc.data().estado === 'cerrado') {
      return; // Idempotencia: ya cerrado o no existe
    }

    const baseApertura: number = turnoDoc.data().baseApertura || 0;
    const esCierreDefinitivo = params.esCierreDefinitivo ?? false;

    // IMP-2: cifras derivadas calculadas desde la fuente de verdad (ventas/egresos reales).
    // Los campos equivalentes de params son ignorados intencionalmente.
    const ventasEfectivo = ventasRecalculadas.efectivo;
    const ventasOtrosMetodos = ventasRecalculadas.transferencia + ventasRecalculadas.tarjeta + ventasRecalculadas.otros;
    const totalEgresos = egresosRecalculados;
    const totalEsperadoEfectivo = baseApertura + ventasEfectivo - totalEgresos;
    const diferenciaEfectivo = params.totalReportadoEfectivo - totalEsperadoEfectivo;

    // FASE-10C: fórmula unificada (relevo y cierre definitivo depositan el mismo
    // neto de ventas). esCierreDefinitivo queda solo como metadata semántica.
    const depositoEfectivo = Math.max(0, params.totalReportadoEfectivo - baseApertura);

    // Candado de turno activo (turnos_activos/{cajeroId}). Compatible con turnos
    // antiguos sin candado: si no existe, el delete simplemente se omite.
    const cajeroId: string | undefined = turnoDoc.data().cajeroId;
    const cajeroNombre: string = turnoDoc.data().cajeroNombre || cajeroId || '';
    const lockRef = cajeroId ? doc(db, 'turnos_activos', cajeroId) : null;
    const lockDoc = lockRef ? await transaction.get(lockRef) : null;

    // FASE-10D: lecturas de validación para relevo automático.
    const esRelevo = !!params.relevoCajeroId;
    let relevoCajeroNombreAuth = '';
    let relevoLockRef: ReturnType<typeof doc> | null = null;

    if (esRelevo) {
      const relevoCajeroId = params.relevoCajeroId!;

      if (relevoCajeroId === cajeroId) {
        throw new Error('No puedes entregarte el turno a ti mismo.');
      }

      const usuarioBRef = doc(db, 'usuarios', relevoCajeroId);
      const membresiaBRef = doc(db, 'membresias', `${empresaId}_${relevoCajeroId}`);
      const [usuarioBDoc, membresiaBDoc] = await Promise.all([
        transaction.get(usuarioBRef),
        transaction.get(membresiaBRef),
      ]);

      if (!usuarioBDoc.exists()) {
        throw new Error('El cajero de relevo no fue encontrado.');
      }
      const usuarioB = usuarioBDoc.data() as { nombre?: string };
      const membresiaB = membresiaBDoc.data() as { activo?: boolean; estado?: string; rol?: string } | undefined;
      if (!membresiaB || membresiaB.estado !== 'activa' || membresiaB.activo !== true) {
        throw new Error('El cajero de relevo está deshabilitado.');
      }
      const rolB = membresiaB.rol || '';
      if (rolB !== 'cajero' && rolB !== 'supervisor') {
        throw new Error(`El rol "${rolB}" no es válido para recibir un relevo.`);
      }
      relevoCajeroNombreAuth = usuarioB.nombre || relevoCajeroId;

      relevoLockRef = doc(db, 'turnos_activos', relevoCajeroId);
      const relevoLockDoc = await transaction.get(relevoLockRef);
      if (relevoLockDoc.exists()) {
        throw new Error(`${relevoCajeroNombreAuth} ya tiene un turno abierto.`);
      }
    }

    // FASE-10E: alertaFaltante + conteoDetalle
    const umbral = params.umbralAlertaFaltante ?? 20000;
    const alertaFaltante = diferenciaEfectivo < -umbral;

    // ── Validación de fondos (IMP-4) ──────────────────────────────────
    // caja-principal debe cubrir el depósito + faltante antes de iniciar
    // cualquier escritura. En un futuro módulo de conciliación esta
    // validación podrá relajarse.
    const cajaPrincipalRef = doc(db, 'cuentas_bancarias', 'caja-principal');
    const cajaPrincipalSnap = await transaction.get(cajaPrincipalRef);
    if (!cajaPrincipalSnap.exists()) throw new Error('Cuenta caja-principal no encontrada.');

    const saldoDisponible = Number(cajaPrincipalSnap.data().saldo ?? 0);
    const faltanteAbsoluto = diferenciaEfectivo < 0 ? Math.abs(diferenciaEfectivo) : 0;
    const totalADebitar = depositoEfectivo + faltanteAbsoluto;

    if (totalADebitar > 0 && saldoDisponible < totalADebitar) {
      throw new Error(
        `Fondos insuficientes en Caja Registradora para completar el cierre. Saldo disponible: $${saldoDisponible.toLocaleString('es-CO')} — Depósito requerido: $${depositoEfectivo.toLocaleString('es-CO')}${faltanteAbsoluto > 0 ? ` + Faltante: $${faltanteAbsoluto.toLocaleString('es-CO')}` : ''}. Registre los ingresos faltantes o contacte al administrador.`
      );
    }

    // ── FASE DE ESCRITURAS ───────────────────────────────────────────
    transaction.update(turnoRef, {
      estado: 'cerrado',
      fechaCierre: serverTimestamp(),
      ventasEfectivo: ventasEfectivo,
      ventasOtrosMetodos: ventasOtrosMetodos,
      totalEgresos: totalEgresos,
      totalEsperadoEfectivo: totalEsperadoEfectivo,
      totalReportadoEfectivo: params.totalReportadoEfectivo,
      diferenciaEfectivo: diferenciaEfectivo,
      notasCierre: params.notasCierre || '',
      esCierreDefinitivo,
      alertaFaltante,
      ...(params.conteoDetalle ? { conteoDetalle: params.conteoDetalle } : {}),
      ...(esRelevo ? { relevadoA: params.relevoCajeroId } : {}),
    });

    // Liberar el candado solo si apunta a ESTE turno (evita liberar el de otro
    // turno activo en escenarios legacy con duplicados preexistentes).
    if (lockRef && lockDoc?.exists() && lockDoc.data().turnoId === params.turnoId) {
      transaction.delete(lockRef);
    }

    // FASE-10D: crear turno + candado para el cajero de relevo.
    if (esRelevo && relevoLockRef) {
      const turnosRef = collection(db, 'turnos');
      const nuevoTurnoRef = doc(turnosRef);
      transaction.set(nuevoTurnoRef, withEmpresaId(empresaId, {
        id: nuevoTurnoRef.id,
        cajeroId: params.relevoCajeroId,
        cajeroNombre: relevoCajeroNombreAuth,
        fechaApertura: serverTimestamp(),
        fechaCierre: null,
        estado: 'abierto',
        baseApertura: baseApertura,
        ventasEfectivo: 0,
        ventasOtrosMetodos: 0,
        totalEsperadoEfectivo: 0,
        totalReportadoEfectivo: 0,
        diferenciaEfectivo: 0,
        notasApertura: `Relevo automático de ${cajeroNombre}`,
        notasCierre: '',
        turnoAnteriorId: params.turnoId,
      }));
      transaction.set(relevoLockRef, withEmpresaId(empresaId, {
        cajeroId: params.relevoCajeroId,
        turnoId: nuevoTurnoRef.id,
        fechaApertura: serverTimestamp(),
      }));
    }

    // Traslado efectivo: caja-principal → caja-fuerte (Modelo B – float fijo)
    const cajaFuerteRef = doc(db, 'cuentas_bancarias', 'caja-fuerte');

    if (depositoEfectivo > 0) {
      const concepto = `Cierre de Turno — ${cajeroNombre}`;

      transaction.update(cajaPrincipalRef, { saldo: increment(-depositoEfectivo) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
        cuentaId: 'caja-principal',
        cuentaNombre: 'Caja Registradora',
        tipo: 'egreso',
        monto: depositoEfectivo,
        concepto,
        categoria: 'traslado',
        referencia: params.turnoId,
        usuarioId: cajeroId || '',
        usuarioNombre: cajeroNombre,
        fecha: serverTimestamp(),
      }));

      transaction.update(cajaFuerteRef, { saldo: increment(depositoEfectivo) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
        cuentaId: 'caja-fuerte',
        cuentaNombre: 'Caja Fuerte',
        tipo: 'ingreso',
        monto: depositoEfectivo,
        concepto,
        categoria: 'traslado',
        referencia: params.turnoId,
        usuarioId: cajeroId || '',
        usuarioNombre: cajeroNombre,
        fecha: serverTimestamp(),
      }));
    }

    // Ajuste por diferencia de caja: tras el depósito, caja-principal queda con
    // un residual de -diferenciaEfectivo (definitivo) o base-diferenciaEfectivo (relevo).
    // increment(diferencia) anula ese residual dejando 0 (definitivo) o base (relevo).
    const diferencia = diferenciaEfectivo;
    if (diferencia !== 0) {
      transaction.update(cajaPrincipalRef, { saldo: increment(diferencia) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), withEmpresaId(empresaId, {
        cuentaId: 'caja-principal',
        cuentaNombre: 'Caja Registradora',
        tipo: diferencia < 0 ? 'egreso' : 'ingreso',
        monto: Math.abs(diferencia),
        concepto: `${diferencia < 0 ? 'Faltante' : 'Sobrante'} de Caja — ${cajeroNombre}`,
        categoria: 'ajuste_caja',
        referencia: params.turnoId,
        usuarioId: cajeroId || '',
        usuarioNombre: cajeroNombre,
        fecha: serverTimestamp(),
      }));
    }
  });
}

/**
 * Escucha el turno activo (abierto) de un cajero específico en un espacio específico.
 */
export function suscribirTurnoActivo(
  cajeroId: string,
  callback: (turno: Turno | null) => void
) {
  let unsubscribe = () => {};
  let cancelado = false;

  tenantQuery(
    collection(db, 'turnos'),
    where('cajeroId', '==', cajeroId),
    where('estado', '==', 'abierto')
  ).then((q) => {
    if (cancelado) return;
    unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback(null);
      } else {
        // Debería haber solo un turno abierto por cajero/espacio
        const doc = snapshot.docs[0];
        callback({ id: doc.id, ...doc.data() } as Turno);
      }
    });
  });

  return () => {
    cancelado = true;
    unsubscribe();
  };
}

/**
 * Verifica una sola vez si hay un turno activo para un cajero. Útil para acciones puntuales como cerrar sesión.
 */
export async function verificarTurnoActivo(cajeroId: string): Promise<boolean> {
  const q = await tenantQuery(
    collection(db, 'turnos'),
    where('cajeroId', '==', cajeroId),
    where('estado', '==', 'abierto')
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

const HISTORIAL_TURNOS_LIMIT = 100;

/**
 * Escucha el historial de los HISTORIAL_TURNOS_LIMIT turnos más recientes.
 * Los roles (para excluir admin/marketing) se leen una sola vez al suscribir,
 * no en cada evento de snapshot.
 */
export function suscribirHistorialTurnos(
  callback: (turnos: Turno[]) => void
) {
  let unsubscribeTurnos = () => {};
  let cancelado = false;

  // Roles y estados provienen de membresías del tenant activo.
  Promise.all([
    tenantQuery(
      collection(db, 'turnos'),
      orderBy('fechaApertura', 'desc'),
      limit(HISTORIAL_TURNOS_LIMIT)
    ),
    tenantQuery(collection(db, 'membresias')).then((q) => getDocs(q)),
  ]).then(([q, membresiasSnap]) => {
    if (cancelado) return;
    const rolesPorUid: Record<string, string> = {}
    membresiasSnap.docs.forEach(d => {
      const data = d.data()
      if (data.estado === 'activa' && data.activo === true) rolesPorUid[data.uid] = data.rol || ''
    })

    unsubscribeTurnos = onSnapshot(q, (snapshot) => {
      const turnos = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Turno))
        .filter(t => {
          const rol = rolesPorUid[t.cajeroId] || ''
          return rol !== 'admin' && rol !== 'marketing'
        });
      callback(turnos);
    });
  });

  return () => {
    cancelado = true;
    unsubscribeTurnos();
  };
}

/**
 * Calcula las ventas totales (efectivo y otros) asociadas a un turno específico.
 * Llama a esta función justo antes de presentar la pantalla de Cierre Ciego para obtener 
 * los totales reales que el cajero debe tener.
 */
export async function calcularVentasTurno(turnoId: string, empresaId?: string): Promise<{ efectivo: number, transferencia: number, tarjeta: number, otros: number, total: number }> {
  const ventasRef = collection(db, 'ventas');

  // MT-U3 Capa 3: `empresaId` opcional — si el llamador ya lo resolvió como
  // parte de una operación más amplia (p. ej. `cerrarTurno`), lo reutiliza en
  // ambas consultas en vez de resolverlo de nuevo (§2.5).
  const empresaIdResuelto = empresaId ?? (await getEmpresaId());

  // 1. Ventas normales del turno
  const qVentas = query(ventasRef, where('empresaId', '==', empresaIdResuelto), where('turnoId', '==', turnoId), where('estadoOperativo', '==', 'COMPLETO'));
  const snapshotVentas = await getDocs(qVentas);

  // 2. Recaudos de deudas (cuentas por cobrar) realizados en este turno
  const qRecaudos = query(ventasRef, where('empresaId', '==', empresaIdResuelto), where('turnoRecaudoId', '==', turnoId), where('estadoOperativo', '==', 'COMPLETO'));
  const snapshotRecaudos = await getDocs(qRecaudos);
  
  let efectivo = 0;
  let transferencia = 0;
  let tarjeta = 0;
  let otros = 0;

  const procesarVenta = (venta: any, esRecaudo: boolean = false) => {
    // H-01: la venta a crédito original (cuenta_cobro) no es ingreso del turno donde se vendió;
    // su realización se contabiliza por la ruta de recaudo (turnoRecaudoId). Evita el doble conteo.
    if (!esRecaudo && venta.metodoPago === 'cuenta_cobro') return;

    if (venta.estado === 'pagada') {
      const total = venta.totales?.total || 0;
      
      const metodo = esRecaudo ? (venta.metodoPagoFinal || 'efectivo') : venta.metodoPago;
      
      if (metodo === 'efectivo') {
        efectivo += total;
      } else if (metodo === 'transferencia') {
        transferencia += total;
      } else if (metodo === 'tarjeta') {
        tarjeta += total;
      } else if (metodo === 'mixto' && Array.isArray(venta.pagoMixtoDetalle) && !esRecaudo) {
        venta.pagoMixtoDetalle.forEach((detalle: any) => {
          const monto = detalle.monto || 0;
          if (detalle.metodo === 'efectivo') efectivo += monto;
          else if (detalle.metodo === 'transferencia') transferencia += monto;
          else if (detalle.metodo === 'tarjeta') tarjeta += monto;
          else otros += monto;
        });
      } else {
        otros += total;
      }
    }
  };

  snapshotVentas.forEach(docSnap => procesarVenta(docSnap.data(), false));
  snapshotRecaudos.forEach(docSnap => procesarVenta(docSnap.data(), true));

  return { efectivo, transferencia, tarjeta, otros, total: efectivo + transferencia + tarjeta + otros };
}
