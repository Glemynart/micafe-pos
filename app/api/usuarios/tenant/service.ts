type MembresiaDatos = {
  empresaId?: unknown;
  uid?: unknown;
  rol?: unknown;
  estado?: unknown;
  activo?: unknown;
};

type PerfilDatos = {
  nombre?: unknown;
  username?: unknown;
};

export type PerfilTenantMinimo = {
  uid: string;
  nombre: string;
  username: string;
};

export type ContextoTenant = {
  uid?: unknown;
  empresaId?: unknown;
  rol?: unknown;
};

type Documento = {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
};

type DbPerfilesTenant = {
  collection(nombre: string): {
    doc(id: string): unknown;
    where(campo: string, operador: '==', valor: string): { get(): Promise<{ docs: Documento[] }> };
  };
  getAll(...referencias: unknown[]): Promise<Documento[]>;
};

export function esAdminTenantActivo(contexto: ContextoTenant, membresia: MembresiaDatos | undefined): boolean {
  return typeof contexto.uid === 'string'
    && typeof contexto.empresaId === 'string'
    && contexto.rol === 'admin'
    && membresia?.empresaId === contexto.empresaId
    && membresia?.uid === contexto.uid
    && membresia.rol === 'admin'
    && membresia.estado === 'activa'
    && membresia.activo === true;
}

/**
 * Une miembros del tenant con perfiles globales exclusivamente en backend.
 * No retorna email, timestamps, permisos, roles ni fcmTokens.
 */
export async function listarPerfilesMinimosTenant(
  db: DbPerfilesTenant,
  empresaId: string,
): Promise<PerfilTenantMinimo[]> {
  const membresias = await db.collection('membresias').where('empresaId', '==', empresaId).get();
  const miembros = membresias.docs
    .map((documento) => documento.data() as MembresiaDatos | undefined)
    .filter((membresia): membresia is MembresiaDatos & { uid: string } =>
      membresia?.empresaId === empresaId
      && typeof membresia.uid === 'string'
      && (membresia.estado === 'activa' || membresia.estado === 'inactiva')
      && typeof membresia.activo === 'boolean',
    );
  const perfiles = miembros.length === 0
    ? []
    : await db.getAll(...miembros.map((membresia) => db.collection('usuarios').doc(membresia.uid)));
  const perfilesPorUid = new Map(perfiles.filter((perfil) => perfil.exists).map((perfil) => [perfil.id, perfil.data() as PerfilDatos]));

  return miembros.map((membresia) => {
    const perfil = perfilesPorUid.get(membresia.uid);
    return {
      uid: membresia.uid,
      nombre: typeof perfil?.nombre === 'string' ? perfil.nombre : membresia.uid,
      username: typeof perfil?.username === 'string' ? perfil.username : '',
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
