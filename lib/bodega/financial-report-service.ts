import { collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query, Timestamp, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { getEmpresaId } from '@/lib/tenant';
import { rangoMesBogota, type FuenteReporte } from './financial-report';

export const MAX_VENTAS_REPORTE = 1000;
export const MAX_PRODUCTOS_REPORTE = 2000;
export interface DatosReporteBodega {
  empresaId: string;
  uid: string;
  consultadoEn: string;
  ventas: FuenteReporte[];
  productos: FuenteReporte[];
}

/** Lectura desde servidor con tenant canónico, membresía admin y límites explícitos. */
export async function leerReporteBodega(mes: string): Promise<DatosReporteBodega> {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error('Inicia sesión para consultar el reporte.');
  const empresaId = await getEmpresaId();
  const { inicio, fin } = rangoMesBogota(mes);
  const membresia = await getDocFromServer(doc(db, 'membresias', `${empresaId}_${usuario.uid}`));
  const m = membresia.data();
  if (!m || m.empresaId !== empresaId || m.uid !== usuario.uid || m.rol !== 'admin' || m.estado !== 'activa' || m.activo !== true) {
    throw new Error('El reporte requiere una membresía administradora activa.');
  }
  const [ventas, productos] = await Promise.all([
    getDocsFromServer(query(collection(db, 'ventas'), where('empresaId', '==', empresaId), where('fecha', '>=', Timestamp.fromDate(inicio)), where('fecha', '<', Timestamp.fromDate(fin)), orderBy('fecha', 'asc'), limit(MAX_VENTAS_REPORTE + 1))),
    getDocsFromServer(query(collection(db, 'productos'), where('empresaId', '==', empresaId), limit(MAX_PRODUCTOS_REPORTE + 1))),
  ]);
  if (ventas.size > MAX_VENTAS_REPORTE || productos.size > MAX_PRODUCTOS_REPORTE) {
    throw new Error('El período supera el límite de lectura del reporte. No se muestran totales parciales.');
  }
  if (auth.currentUser?.uid !== usuario.uid) throw new Error('La sesión cambió durante la consulta.');
  return {
    empresaId, uid: usuario.uid, consultadoEn: new Date().toISOString(),
    ventas: ventas.docs.map(d => ({ id: d.id, data: d.data() })),
    productos: productos.docs.map(d => ({ id: d.id, data: d.data() })),
  };
}
