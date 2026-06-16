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
  Timestamp
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
 */
export async function cerrarTurno(params: CerrarTurnoParams): Promise<void> {
  const turnoRef = doc(db, 'turnos', params.turnoId);
  await updateDoc(turnoRef, {
    estado: 'cerrado',
    fechaCierre: serverTimestamp(),
    ventasEfectivo: params.ventasEfectivo,
    ventasOtrosMetodos: params.ventasOtrosMetodos,
    totalEgresos: params.totalEgresos || 0,
    totalEsperadoEfectivo: params.totalEsperadoEfectivo,
    totalReportadoEfectivo: params.totalReportadoEfectivo,
    diferenciaEfectivo: params.diferenciaEfectivo,
    notasCierre: params.notasCierre || ''
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
export async function calcularVentasTurno(turnoId: string): Promise<{ efectivo: number, otros: number, total: number }> {
  const ventasRef = collection(db, 'ventas');
  const q = query(ventasRef, where('turnoId', '==', turnoId));
  const snapshot = await getDocs(q);
  
  let efectivo = 0;
  let otros = 0;

  snapshot.forEach(docSnap => {
    const venta = docSnap.data();
    if (venta.estado === 'pagada') {
      if (venta.metodoPago === 'efectivo') {
        efectivo += venta.totales.total;
      } else {
        otros += venta.totales.total;
      }
    }
  });

  return { efectivo, otros, total: efectivo + otros };
}
