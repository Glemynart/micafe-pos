import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { esAdminTenantActivo, listarPerfilesMinimosTenant, type ContextoTenant } from './service';

export async function GET(request: Request) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const contexto = await getAdminAuth().verifyIdToken(authorization.slice('Bearer '.length)) as ContextoTenant;
    if (typeof contexto.uid !== 'string' || typeof contexto.empresaId !== 'string' || contexto.rol !== 'admin') {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
    }

    const db = getAdminDb();
    const propia = await db.collection('membresias').doc(`${contexto.empresaId}_${contexto.uid}`).get();
    if (!esAdminTenantActivo(contexto, propia.data())) {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
    }

    return NextResponse.json({ perfiles: await listarPerfilesMinimosTenant(db, contexto.empresaId) });
  } catch {
    return NextResponse.json({ error: 'No fue posible cargar los perfiles.' }, { status: 500 });
  }
}
