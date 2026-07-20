import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export async function GET(req: Request) {
  // Solo uso en desarrollo
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Endpoint deshabilitado en producción' }, { status: 404 });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = await getAdminAuth().verifyIdToken(token);

    if (decoded.rol !== 'admin' || typeof decoded.empresaId !== 'string') {
      return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
    }

    const snapshot = await (await import('@/lib/firebase-admin')).getAdminDb().collection('usuarios').get();
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
