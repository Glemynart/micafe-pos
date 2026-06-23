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
} from 'firebase/firestore'
import { db, auth } from './firebase'

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
}

export interface AbrirTurnoParams {
  cajeroId: string;
  cajeroNombre: string;
  baseApertura: number;
  notasApertura?: string;
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
}

/**
 * Abre un nuevo turno para el cajero, garantizando unicidad mediante un
 * documento candado de ID determinista: `turnos_activos/{cajeroId}`.
 *
 * La apertura es atómica (runTransaction sobre el candado determinista), lo que
 * elimina la condición de carrera TOCTOU del antiguo "verificar + crear":
 *   - Si ya existe candado → idempotente, devuelve el turno activo (no duplica).
 *   - Compatibilidad hacia atrás: si hay un turno abierto sin candado (creado
 *     antes de esta corrección), lo "adopta" creando el candado que apunta a él
 *     en vez de abrir uno nuevo.
 *   - En el caso normal crea turno + candado en la misma transacción.
 *
 * Nota Firestore: las transacciones no admiten queries; por eso la detección de
 * turnos legacy usa un getDocs previo (best-effort). La unicidad real la asegura
 * el candado determinista dentro de la transacción.
 */
export async function abrirTurno(params: AbrirTurnoParams): Promise<string> {
  const turnosRef = collection(db, 'turnos');
  const lockRef = doc(db, 'turnos_activos', params.cajeroId);

  // Compatibilidad hacia atrás: detectar turnos abiertos previos sin candado.
  const legacyQuery = query(
    turnosRef,
    where('cajeroId', '==', params.cajeroId),
    where('estado', '==', 'abierto')
  );
  const legacySnap = await getDocs(legacyQuery);
  const legacyTurnoId = legacySnap.empty ? null : legacySnap.docs[0].id;

  let turnoCreado = false; // se resetea en cada reintento de la transacción

  const turnoId = await runTransaction(db, async (transaction) => {
    turnoCreado = false;

    // 1. ¿Ya hay candado? → turno activo existente, idempotente.
    const lockSnap = await transaction.get(lockRef);
    if (lockSnap.exists()) {
      return lockSnap.data().turnoId as string;
    }

    // 2. Sin candado: ¿existe un turno legacy abierto sin candado? → adoptarlo.
    if (legacyTurnoId) {
      const legacyRef = doc(db, 'turnos', legacyTurnoId);
      const legacyTurnoSnap = await transaction.get(legacyRef);
      if (legacyTurnoSnap.exists() && legacyTurnoSnap.data().estado === 'abierto') {
        transaction.set(lockRef, {
          cajeroId: params.cajeroId,
          turnoId: legacyTurnoId,
          fechaApertura: legacyTurnoSnap.data().fechaApertura ?? serverTimestamp(),
        });
        return legacyTurnoId;
      }
    }

    // 3. Caso normal: crear turno nuevo + candado, atómicamente.
    const nuevoTurnoRef = doc(turnosRef);
    const nuevoTurno = {
      id: nuevoTurnoRef.id,
      cajeroId: params.cajeroId,
      cajeroNombre: params.cajeroNombre,
      fechaApertura: serverTimestamp(),
      fechaCierre: null,
      estado: 'abierto',
      baseApertura: params.baseApertura,
      ventasEfectivo: 0,
      ventasOtrosMetodos: 0,
      totalEsperadoEfectivo: 0,
      totalReportadoEfectivo: 0,
      diferenciaEfectivo: 0,
      notasApertura: params.notasApertura || '',
      notasCierre: ''
    };
    transaction.set(nuevoTurnoRef, nuevoTurno);
    transaction.set(lockRef, {
      cajeroId: params.cajeroId,
      turnoId: nuevoTurnoRef.id,
      fechaApertura: serverTimestamp(),
    });
    turnoCreado = true;
    return nuevoTurnoRef.id;
  });

  // Notificación push solo cuando se abre un turno NUEVO (no en idempotencia/adopción).
  if (turnoCreado && typeof window !== 'undefined') {
    auth.currentUser?.getIdToken().then(token => {
      fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          title: '¡Nuevo Turno Abierto!',
          message: `El cajero ${params.cajeroNombre} ha iniciado turno con base de $${params.baseApertura.toLocaleString('es-CO')}.`
        })
      }).catch(err => console.error('Error enviando notificación push:', err))
    }).catch(err => console.error('Error obteniendo token para notificacion:', err))
  }

  return turnoId;
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
  const turnoRef = doc(db, 'turnos', params.turnoId);

  await runTransaction(db, async (transaction) => {
    // ── FASE DE LECTURAS (todas antes de cualquier escritura) ────────
    const turnoDoc = await transaction.get(turnoRef);
    if (!turnoDoc.exists() || turnoDoc.data().estado === 'cerrado') {
      return; // Idempotencia: ya cerrado o no existe
    }

    const baseApertura: number = turnoDoc.data().baseApertura || 0;
    const esCierreDefinitivo = params.esCierreDefinitivo ?? false;

    // FASE-10C: fórmula unificada (relevo y cierre definitivo depositan el mismo
    // neto de ventas). esCierreDefinitivo queda solo como metadata semántica.
    const depositoEfectivo = Math.max(0, params.totalReportadoEfectivo - baseApertura);

    // Candado de turno activo (turnos_activos/{cajeroId}). Compatible con turnos
    // antiguos sin candado: si no existe, el delete simplemente se omite.
    const cajeroId: string | undefined = turnoDoc.data().cajeroId;
    const cajeroNombre: string = turnoDoc.data().cajeroNombre || cajeroId || '';
    const lockRef = cajeroId ? doc(db, 'turnos_activos', cajeroId) : null;
    const lockDoc = lockRef ? await transaction.get(lockRef) : null;

    // ── FASE DE ESCRITURAS ───────────────────────────────────────────
    transaction.update(turnoRef, {
      estado: 'cerrado',
      fechaCierre: serverTimestamp(),
      ventasEfectivo: params.ventasEfectivo,
      ventasOtrosMetodos: params.ventasOtrosMetodos,
      totalEgresos: params.totalEgresos || 0,
      totalEsperadoEfectivo: params.totalEsperadoEfectivo,
      totalReportadoEfectivo: params.totalReportadoEfectivo,
      diferenciaEfectivo: params.diferenciaEfectivo,
      notasCierre: params.notasCierre || '',
      esCierreDefinitivo,
    });

    // Liberar el candado solo si apunta a ESTE turno (evita liberar el de otro
    // turno activo en escenarios legacy con duplicados preexistentes).
    if (lockRef && lockDoc?.exists() && lockDoc.data().turnoId === params.turnoId) {
      transaction.delete(lockRef);
    }

    // Traslado efectivo: caja-principal → caja-fuerte (Modelo B – float fijo)
    const cajaPrincipalRef = doc(db, 'cuentas_bancarias', 'caja-principal');
    const cajaFuerteRef = doc(db, 'cuentas_bancarias', 'caja-fuerte');

    if (depositoEfectivo > 0) {
      const concepto = `Cierre de Turno — ${cajeroNombre}`;

      transaction.update(cajaPrincipalRef, { saldo: increment(-depositoEfectivo) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), {
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
      });

      transaction.update(cajaFuerteRef, { saldo: increment(depositoEfectivo) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), {
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
      });
    }

    // Ajuste por diferencia de caja: tras el depósito, caja-principal queda con
    // un residual de -diferenciaEfectivo (definitivo) o base-diferenciaEfectivo (relevo).
    // increment(diferencia) anula ese residual dejando 0 (definitivo) o base (relevo).
    const diferencia = params.diferenciaEfectivo;
    if (diferencia !== 0) {
      transaction.update(cajaPrincipalRef, { saldo: increment(diferencia) });
      transaction.set(doc(collection(db, 'transacciones_financieras')), {
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
      });
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
  const q = query(
    collection(db, 'turnos'),
    where('cajeroId', '==', cajeroId),
    where('estado', '==', 'abierto')
  );

  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(null);
    } else {
      // Debería haber solo un turno abierto por cajero/espacio
      const doc = snapshot.docs[0];
      callback({ id: doc.id, ...doc.data() } as Turno);
    }
  });
}

/**
 * Verifica una sola vez si hay un turno activo para un cajero. Útil para acciones puntuales como cerrar sesión.
 */
export async function verificarTurnoActivo(cajeroId: string): Promise<boolean> {
  const q = query(
    collection(db, 'turnos'),
    where('cajeroId', '==', cajeroId),
    where('estado', '==', 'abierto')
  );
  const snap = await getDocs(q);
  return !snap.empty;
}

/**
 * Escucha el historial completo de turnos de un espacio.
 */
export function suscribirHistorialTurnos(
  callback: (turnos: Turno[]) => void
) {
  const q = query(
    collection(db, 'turnos')
  );

  return onSnapshot(q, async (snapshot) => {
    const usuariosSnap = await getDocs(query(collection(db, 'usuarios')))
    const rolesPorUid: Record<string, string> = {}
    usuariosSnap.docs.forEach(d => {
      rolesPorUid[d.id] = d.data().rol || ''
    })

    const turnos = snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Turno))
      .filter(t => {
        const rol = rolesPorUid[t.cajeroId] || ''
        return rol !== 'admin' && rol !== 'marketing'
      })
      .sort((a, b) => {
        const timeA = a.fechaApertura?.toMillis ? a.fechaApertura.toMillis() : 0;
        const timeB = b.fechaApertura?.toMillis ? b.fechaApertura.toMillis() : 0;
        return timeB - timeA;
      });
    callback(turnos);
  });
}

/**
 * Calcula las ventas totales (efectivo y otros) asociadas a un turno específico.
 * Llama a esta función justo antes de presentar la pantalla de Cierre Ciego para obtener 
 * los totales reales que el cajero debe tener.
 */
export async function calcularVentasTurno(turnoId: string): Promise<{ efectivo: number, transferencia: number, tarjeta: number, otros: number, total: number }> {
  const ventasRef = collection(db, 'ventas');
  
  // 1. Ventas normales del turno
  const qVentas = query(ventasRef, where('turnoId', '==', turnoId));
  const snapshotVentas = await getDocs(qVentas);
  
  // 2. Recaudos de deudas (cuentas por cobrar) realizados en este turno
  const qRecaudos = query(ventasRef, where('turnoRecaudoId', '==', turnoId));
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
