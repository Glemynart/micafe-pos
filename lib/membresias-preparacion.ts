/** Lógica pura del gate de preparación de autoridad MT-U5B Bloque 1. */
import {
  ROLES_MEMBRESIA,
  esRolMembresia,
  estadoMembresiaDesdeActivo,
  idMembresia,
  normalizarPermisos,
  permisosSonIguales,
  type EstadoMembresia,
  type RolMembresia,
} from "./membresias-service";

export interface UsuarioPreparacion {
  uid: string;
  rol?: unknown;
  permisos?: unknown;
  activo?: unknown;
}

export interface MembresiaPreparacion {
  id: string;
  data: {
    empresaId?: unknown;
    uid?: unknown;
    rol?: unknown;
    permisos?: unknown;
    estado?: unknown;
    activo?: unknown;
    creadaEn?: unknown;
    actualizadaEn?: unknown;
  };
}

export interface MembresiaEsperada {
  uid: string;
  rol: RolMembresia;
  permisos: string[];
  estado: EstadoMembresia;
  activo: boolean;
}

export interface PlanPreparacionMembresias {
  esperadas: Map<string, MembresiaEsperada>;
  creadas: string[];
  actualizadas: string[];
  sinCambios: string[];
  errores: string[];
}

export function planificarPreparacionMembresias({
  empresaId,
  usuarios,
  plantillas,
  membresias,
  identidadesInexistentes = [],
}: {
  empresaId: string;
  usuarios: UsuarioPreparacion[];
  plantillas: Map<RolMembresia, unknown>;
  membresias: MembresiaPreparacion[];
  identidadesInexistentes?: readonly string[];
}): PlanPreparacionMembresias {
  const esperadas = new Map<string, MembresiaEsperada>();
  const errores: string[] = [];

  for (const rol of ROLES_MEMBRESIA) {
    if (!plantillas.has(rol)) {
      errores.push(`permisos_roles/${rol} no existe.`);
      continue;
    }
    if (!normalizarPermisos(plantillas.get(rol))) {
      errores.push(`permisos_roles/${rol}.permisos no es un arreglo válido de strings.`);
    }
  }

  for (const usuario of usuarios) {
    if (!esRolMembresia(usuario.rol)) {
      errores.push(`usuarios/${usuario.uid}.rol no pertenece al contrato canónico.`);
      continue;
    }
    const propios = usuario.permisos == null ? [] : normalizarPermisos(usuario.permisos);
    if (!propios) {
      errores.push(`usuarios/${usuario.uid}.permisos no es un arreglo válido de strings.`);
      continue;
    }
    const plantilla = normalizarPermisos(plantillas.get(usuario.rol));
    if (!plantilla) continue;
    const activo = usuario.activo === true;
    esperadas.set(usuario.uid, {
      uid: usuario.uid,
      rol: usuario.rol,
      permisos: normalizarPermisos([...plantilla, ...propios])!,
      estado: estadoMembresiaDesdeActivo(activo),
      activo,
    });
  }

  for (const uid of identidadesInexistentes) {
    errores.push(`usuarios/${uid} no tiene identidad correspondiente en Firebase Authentication.`);
  }

  const porUid = new Map<string, MembresiaPreparacion[]>();
  const porId = new Map<string, MembresiaPreparacion>();
  for (const membresia of membresias) {
    porId.set(membresia.id, membresia);
    const uid = membresia.data.uid;
    if (typeof uid !== "string" || !uid) {
      errores.push(`membresias/${membresia.id}.uid es inválido.`);
      continue;
    }
    const grupo = porUid.get(uid) ?? [];
    grupo.push(membresia);
    porUid.set(uid, grupo);
    if (membresia.data.empresaId === empresaId && membresia.id !== idMembresia(empresaId, uid)) {
      errores.push(`membresias/${membresia.id} no usa el id determinístico esperado.`);
    }
    if (membresia.data.empresaId === empresaId && !esperadas.has(uid)) {
      errores.push(`membresias/${membresia.id} apunta a un uid sin usuario legacy.`);
    }
  }
  for (const [uid, grupo] of porUid) {
    if (grupo.filter((m) => m.data.empresaId === empresaId).length > 1) {
      errores.push(`El uid ${uid} tiene múltiples membresías en la misma empresa.`);
    }
  }

  const creadas: string[] = [];
  const actualizadas: string[] = [];
  const sinCambios: string[] = [];
  for (const [uid, esperada] of esperadas) {
    const id = idMembresia(empresaId, uid);
    const existente = porId.get(id);
    if (!existente) {
      creadas.push(uid);
      continue;
    }
    const raw = existente.data;
    if (raw.empresaId !== empresaId) {
      errores.push(`membresias/${id}.empresaId no coincide con su id determinístico.`);
      continue;
    }
    const permisos = normalizarPermisos(raw.permisos);
    const completa = raw.uid === uid && raw.rol === esperada.rol && raw.estado === esperada.estado
      && raw.activo === esperada.activo && !!raw.creadaEn && !!raw.actualizadaEn
      && !!permisos && permisosSonIguales(permisos, esperada.permisos);
    if (completa) sinCambios.push(uid); else actualizadas.push(uid);
  }

  return { esperadas, creadas, actualizadas, sinCambios, errores };
}
