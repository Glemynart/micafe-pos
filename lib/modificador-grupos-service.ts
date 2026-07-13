/**
 * modificador-grupos-service.ts
 *
 * Funciones Firestore para leer / crear / editar / desactivar grupos de
 * modificadores reutilizables. Las opciones viven embebidas dentro del grupo.
 */

import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface ModificadorOpcion {
  id: string;
  nombre: string;
  precioDelta: number;
  activo: boolean;
  orden: number;
  /**
   * Opcion preseleccionada al abrir el selector.
   * No implica obligatoriedad ni reemplaza min/max.
   */
  default?: boolean;
  cocinaNombre?: string;
}

export interface ModificadorGrupo {
  id: string;
  espacioId: string;
  nombre: string;
  descripcion?: string;
  minSeleccion: number;
  maxSeleccion: number;
  activo: boolean;
  orden: number;
  opciones: ModificadorOpcion[];
  creadoEn?: unknown;
  actualizadoEn?: unknown;
}

export type ModificadorGrupoInput = Omit<
  ModificadorGrupo,
  "id" | "creadoEn" | "actualizadoEn"
>;

const COLLECTION_NAME = "modificador_grupos";

function validarTextoObligatorio(valor: string, campo: string): string {
  const normalizado = valor.trim();
  if (!normalizado) {
    throw new Error(`El campo "${campo}" es obligatorio.`);
  }
  return normalizado;
}

function validarNumeroEnteroNoNegativo(valor: number, campo: string): void {
  if (!Number.isInteger(valor) || valor < 0) {
    throw new Error(`El campo "${campo}" debe ser un entero mayor o igual a 0.`);
  }
}

function validarBooleano(valor: boolean, campo: string): void {
  if (typeof valor !== "boolean") {
    throw new Error(`El campo "${campo}" debe ser booleano.`);
  }
}

function validarOpciones(opciones: ModificadorOpcion[]): ModificadorOpcion[] {
  if (!Array.isArray(opciones)) {
    throw new Error('El campo "opciones" debe ser un arreglo.');
  }

  const ids = new Set<string>();

  return opciones.map((opcion, index) => {
    const id = validarTextoObligatorio(opcion.id, `opciones[${index}].id`);
    const nombre = validarTextoObligatorio(opcion.nombre, `opciones[${index}].nombre`);

    if (ids.has(id)) {
      throw new Error(`La opcion "${id}" esta duplicada dentro del grupo.`);
    }
    ids.add(id);

    if (!Number.isFinite(opcion.precioDelta)) {
      throw new Error(`El campo "opciones[${index}].precioDelta" debe ser numerico.`);
    }
    validarBooleano(opcion.activo, `opciones[${index}].activo`);
    validarNumeroEnteroNoNegativo(opcion.orden, `opciones[${index}].orden`);
    if (opcion.default !== undefined) {
      validarBooleano(opcion.default, `opciones[${index}].default`);
    }

    const cocinaNombre = opcion.cocinaNombre?.trim();

    return {
      id,
      nombre,
      precioDelta: opcion.precioDelta,
      activo: opcion.activo,
      orden: opcion.orden,
      ...(opcion.default !== undefined ? { default: opcion.default } : {}),
      ...(cocinaNombre ? { cocinaNombre } : {}),
    };
  });
}

function normalizarGrupo(data: ModificadorGrupoInput): ModificadorGrupoInput {
  const espacioId = validarTextoObligatorio(data.espacioId, "espacioId");
  const nombre = validarTextoObligatorio(data.nombre, "nombre");

  validarNumeroEnteroNoNegativo(data.minSeleccion, "minSeleccion");
  validarNumeroEnteroNoNegativo(data.maxSeleccion, "maxSeleccion");
  validarNumeroEnteroNoNegativo(data.orden, "orden");
  validarBooleano(data.activo, "activo");

  if (data.maxSeleccion < data.minSeleccion) {
    throw new Error('El campo "maxSeleccion" no puede ser menor que "minSeleccion".');
  }

  const descripcion = data.descripcion?.trim();

  return {
    espacioId,
    nombre,
    ...(descripcion ? { descripcion } : {}),
    minSeleccion: data.minSeleccion,
    maxSeleccion: data.maxSeleccion,
    activo: data.activo,
    orden: data.orden,
    opciones: validarOpciones(data.opciones),
  };
}

export function suscribirModificadorGrupos(
  espacioId: string,
  callback: (grupos: ModificadorGrupo[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("espacioId", "==", espacioId),
    where("activo", "==", true)
  );

  return onSnapshot(q, (snap) => {
    const grupos: ModificadorGrupo[] = snap.docs
      .map((grupoDoc) => ({
        id: grupoDoc.id,
        ...(grupoDoc.data() as Omit<ModificadorGrupo, "id">),
      }))
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

    callback(grupos);
  });
}

export function suscribirTodosModificadorGrupos(
  espacioId: string,
  callback: (grupos: ModificadorGrupo[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("espacioId", "==", espacioId)
  );

  return onSnapshot(q, (snap) => {
    const grupos: ModificadorGrupo[] = snap.docs
      .map((grupoDoc) => ({
        id: grupoDoc.id,
        ...(grupoDoc.data() as Omit<ModificadorGrupo, "id">),
      }))
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));

    callback(grupos);
  });
}

export async function obtenerModificadorGrupo(
  grupoId: string
): Promise<ModificadorGrupo | null> {
  const snap = await getDoc(doc(db, COLLECTION_NAME, grupoId));
  if (!snap.exists()) return null;

  return {
    id: snap.id,
    ...(snap.data() as Omit<ModificadorGrupo, "id">),
  };
}

export async function crearModificadorGrupo(
  data: ModificadorGrupoInput
): Promise<string> {
  const payload = normalizarGrupo(data);
  const ref = await addDoc(collection(db, COLLECTION_NAME), {
    ...payload,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  return ref.id;
}

export async function editarModificadorGrupo(
  grupoId: string,
  data: Partial<ModificadorGrupoInput>
): Promise<void> {
  const grupoRef = doc(db, COLLECTION_NAME, grupoId);
  const snap = await getDoc(grupoRef);
  if (!snap.exists()) {
    throw new Error("Grupo de modificadores no encontrado.");
  }

  const descripcionEditada = data.descripcion?.trim();
  const actual = snap.data() as Omit<ModificadorGrupo, "id">;
  const payload = normalizarGrupo({
    espacioId: data.espacioId ?? actual.espacioId,
    nombre: data.nombre ?? actual.nombre,
    descripcion: data.descripcion !== undefined ? data.descripcion : actual.descripcion,
    minSeleccion: data.minSeleccion ?? actual.minSeleccion,
    maxSeleccion: data.maxSeleccion ?? actual.maxSeleccion,
    activo: data.activo ?? actual.activo,
    orden: data.orden ?? actual.orden,
    opciones: data.opciones ?? actual.opciones ?? [],
  });

  await updateDoc(grupoRef, {
    ...payload,
    ...(data.descripcion !== undefined
      ? (descripcionEditada
          ? { descripcion: descripcionEditada }
          : { descripcion: deleteField() })
      : {}),
    actualizadoEn: serverTimestamp(),
  });
}

export async function eliminarModificadorGrupo(grupoId: string): Promise<void> {
  const grupoRef = doc(db, COLLECTION_NAME, grupoId);
  const snap = await getDoc(grupoRef);
  if (!snap.exists()) {
    throw new Error("Grupo de modificadores no encontrado.");
  }

  await updateDoc(grupoRef, {
    activo: false,
    actualizadoEn: serverTimestamp(),
  });
}
