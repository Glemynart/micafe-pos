import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  getDocs,
  serverTimestamp,
  Timestamp,
  runTransaction,
  getDoc
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
 * Abre un nuevo turno para el cajero en el espacio.
 */
export async function abrirTurno(params: AbrirTurnoParams): Promise<string> {
  const turnosRef = collection(db, 'turnos');
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

  await setDoc(nuevoTurnoRef, nuevoTurno);

  // Trigger notification a los admins (fire and forget)
  if (typeof window !== 'undefined') {
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

  return nuevoTurnoRef.id;
}

/**
 * Cierra un turno existente, guardando el cuadre de caja (Cierre Ciego).
 *
 * Lógica de depósito a Caja Fuerte (Modelo B – float fijo):
 *   - Relevo (esCierreDefinitivo=false): deposita solo el efectivo neto de ventas,
 *     es decir max(0, totalReportadoEfectivo - baseApertura). La base queda en caja
 *     para el siguiente cajero.
 *   - Cierre definitivo (esCierreDefinitivo=true): deposita el total reportado íntegro,
 *     incluyendo la base, porque no hay turno siguiente.
 *
 * La baseApertura se lee desde el documento del turno en Firestore (fuente de verdad),
 * no desde los parámetros del cliente.
 *
 * Estructura: todas las lecturas ocurren antes de cualquier escritura para cumplir
 * con las restricciones de transacciones de Firestore.
 */
export async function cerrarTurno(params: CerrarTurnoParams): Promise<void> {
  const turnoRef = doc(db, 'turnos', params.turnoId);
  const cuentaRefEfectivo = doc(db, 'cuentas_bancarias', 'caja-fuerte');
  const cuentaRefBanco = doc(db, 'cuentas_bancarias', 'bancolombia');

  await runTransaction(db, async (transaction) => {
    // ── FASE DE LECTURAS (todas antes de cualquier escritura) ────────
    const turnoDoc = await transaction.get(turnoRef);
    if (!turnoDoc.exists() || turnoDoc.data().estado === 'cerrado') {
      return; // Idempotencia: ya cerrado o no existe
    }

    const baseApertura: number = turnoDoc.data().baseApertura || 0;
    const esCierreDefinitivo = params.esCierreDefinitivo ?? false;

    const depositoEfectivo = esCierreDefinitivo
      ? params.totalReportadoEfectivo
      : Math.max(0, params.totalReportadoEfectivo - baseApertura);

    const cuentaDocEf = await transaction.get(cuentaRefEfectivo);
    const cuentaDocBa = await transaction.get(cuentaRefBanco);

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

    if (depositoEfectivo > 0 && cuentaDocEf.exists()) {
      const saldoEfectivo = cuentaDocEf.data().saldo || 0;
      transaction.update(cuentaRefEfectivo, { saldo: saldoEfectivo + depositoEfectivo });

      const txRefEf = doc(collection(db, 'transacciones_financieras'));
      transaction.set(txRefEf, {
        cuentaId: 'caja-fuerte',
        cuentaNombre: 'Caja Fuerte',
        tipo: 'ingreso',
        monto: depositoEfectivo,
        concepto: esCierreDefinitivo
          ? 'Ingreso Cierre Definitivo (Efectivo)'
          : 'Ingreso Relevo de Turno (Efectivo neto)',
        categoria: 'ventas',
        referencia: params.turnoId,
        usuarioId: 'sistema',
        usuarioNombre: 'Cierre Automático',
        fecha: serverTimestamp(),
      });
    }

    if (params.ventasOtrosMetodos > 0 && cuentaDocBa.exists()) {
      const saldoBanco = cuentaDocBa.data().saldo || 0;
      transaction.update(cuentaRefBanco, { saldo: saldoBanco + params.ventasOtrosMetodos });

      const txRefBa = doc(collection(db, 'transacciones_financieras'));
      transaction.set(txRefBa, {
        cuentaId: 'bancolombia',
        cuentaNombre: 'Bancolombia',
        tipo: 'ingreso',
        monto: params.ventasOtrosMetodos,
        concepto: 'Ingreso Cierre de Turno (Digital)',
        categoria: 'ventas',
        referencia: params.turnoId,
        usuarioId: 'sistema',
        usuarioNombre: 'Cierre Automático',
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
