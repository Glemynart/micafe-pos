/**
 * producto-modificador-grupos-service.ts
 *
 * Funciones Firestore para asignar grupos de modificadores a productos.
 * La relacion vive en una coleccion separada para permitir reutilizacion y
 * overrides por producto sin duplicar la definicion central del grupo.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ModificadorGrupo } from "@/lib/modificador-grupos-service";

export interface ProductoModificadorGrupoOverride {
  precioDelta?: number;
  activo?: boolean;
}

export interface ProductoModificadorGrupo {
  id: string;
  espacioId: string;
  productoId: string;
  grupoId: string;
  orden: number;
  activo: boolean;
  minSeleccion?: number;
  maxSeleccion?: number;
  opcionesPermitidas?: string[];
  opcionOverrides?: Record<string, ProductoModificadorGrupoOverride>;
  creadoEn?: unknown;
  actualizadoEn?: unknown;
}

export type ProductoModificadorGrupoInput = Omit<
  ProductoModificadorGrupo,
  "id" | "creadoEn" | "actualizadoEn"
>;

const COLLECTION_NAME = "producto_modificador_grupos";

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

function validarOpcionesUnicas(ids: string[], campo: string): string[] {
  const normalizados = ids.map((id) => validarTextoObligatorio(id, campo));
  const unicos = new Set(normalizados);
  if (unicos.size !== normalizados.length) {
    throw new Error(`El campo "${campo}" no permite ids duplicados.`);
  }
  return normalizados;
}

function validarOverrides(
  overrides: Record<string, ProductoModificadorGrupoOverride> | undefined,
  opcionesGrupo: Set<string>
): Record<string, ProductoModificadorGrupoOverride> | undefined {
  if (!overrides) return undefined;

  const entries = Object.entries(overrides);
  if (entries.length === 0) return undefined;

  const resultado: Record<string, ProductoModificadorGrupoOverride> = {};

  for (const [opcionIdCrudo, override] of entries) {
    const opcionId = validarTextoObligatorio(opcionIdCrudo, "opcionOverrides");
    if (!opcionesGrupo.has(opcionId)) {
      throw new Error(`La opcion "${opcionId}" no existe en el grupo asignado.`);
    }
    if (override === null || typeof override !== "object" || Array.isArray(override)) {
      throw new Error(`El override de la opcion "${opcionId}" es invalido.`);
    }

    for (const clave of Object.keys(override)) {
      if (clave !== "precioDelta" && clave !== "activo") {
        throw new Error(
          `El override "${clave}" no esta permitido para la opcion "${opcionId}".`
        );
      }
    }

    if (
      override.precioDelta !== undefined &&
      !Number.isFinite(override.precioDelta)
    ) {
      throw new Error(
        `El campo "precioDelta" del override para "${opcionId}" debe ser numerico.`
      );
    }
    if (override.activo !== undefined && typeof override.activo !== "boolean") {
      throw new Error(
        `El campo "activo" del override para "${opcionId}" debe ser booleano.`
      );
    }

    resultado[opcionId] = {
      ...(override.precioDelta !== undefined
        ? { precioDelta: override.precioDelta }
        : {}),
      ...(override.activo !== undefined ? { activo: override.activo } : {}),
    };
  }

  return Object.keys(resultado).length > 0 ? resultado : undefined;
}

function validarRelacionBasica(data: ProductoModificadorGrupoInput): void {
  validarTextoObligatorio(data.espacioId, "espacioId");
  validarTextoObligatorio(data.productoId, "productoId");
  validarTextoObligatorio(data.grupoId, "grupoId");
  validarNumeroEnteroNoNegativo(data.orden, "orden");
  validarBooleano(data.activo, "activo");

  if (data.minSeleccion !== undefined) {
    validarNumeroEnteroNoNegativo(data.minSeleccion, "minSeleccion");
  }
  if (data.maxSeleccion !== undefined) {
    validarNumeroEnteroNoNegativo(data.maxSeleccion, "maxSeleccion");
  }
  if (
    data.minSeleccion !== undefined &&
    data.maxSeleccion !== undefined &&
    data.maxSeleccion < data.minSeleccion
  ) {
    throw new Error('El campo "maxSeleccion" no puede ser menor que "minSeleccion".');
  }
}

function validarRangoSeleccion(minSeleccion: number, maxSeleccion: number): void {
  validarNumeroEnteroNoNegativo(minSeleccion, "minSeleccion");
  validarNumeroEnteroNoNegativo(maxSeleccion, "maxSeleccion");

  if (maxSeleccion < minSeleccion) {
    throw new Error('El campo "maxSeleccion" no puede ser menor que "minSeleccion".');
  }
}

function construirRelacionId(productoId: string, grupoId: string): string {
  return `${productoId}_${grupoId}`;
}

export function suscribirProductoModificadorGrupos(
  productoId: string,
  callback: (relaciones: ProductoModificadorGrupo[]) => void
): Unsubscribe {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("productoId", "==", productoId),
    where("activo", "==", true)
  );

  return onSnapshot(q, (snap) => {
    const relaciones: ProductoModificadorGrupo[] = snap.docs
      .map((relDoc) => ({
        id: relDoc.id,
        ...(relDoc.data() as Omit<ProductoModificadorGrupo, "id">),
      }))
      .sort((a, b) => a.orden - b.orden || a.grupoId.localeCompare(b.grupoId));

    callback(relaciones);
  });
}

export async function listarProductoModificadorGrupos(
  productoId: string
): Promise<ProductoModificadorGrupo[]> {
  const q = query(
    collection(db, COLLECTION_NAME),
    where("productoId", "==", productoId),
    where("activo", "==", true)
  );
  const snap = await getDocs(q);

  return snap.docs
    .map((relDoc) => ({
      id: relDoc.id,
      ...(relDoc.data() as Omit<ProductoModificadorGrupo, "id">),
    }))
    .sort((a, b) => a.orden - b.orden || a.grupoId.localeCompare(b.grupoId));
}

export async function asignarGrupoAProducto(
  data: ProductoModificadorGrupoInput
): Promise<string> {
  validarRelacionBasica(data);

  const espacioId = data.espacioId.trim();
  const productoId = data.productoId.trim();
  const grupoId = data.grupoId.trim();
  const relacionId = construirRelacionId(productoId, grupoId);

  await runTransaction(db, async (transaction) => {
    const productoRef = doc(db, "productos", productoId);
    const grupoRef = doc(db, "modificador_grupos", grupoId);
    const relacionRef = doc(db, COLLECTION_NAME, relacionId);

    const [productoSnap, grupoSnap, relacionSnap] = await Promise.all([
      transaction.get(productoRef),
      transaction.get(grupoRef),
      transaction.get(relacionRef),
    ]);

    if (!productoSnap.exists()) {
      throw new Error("Producto no encontrado.");
    }
    if (!grupoSnap.exists()) {
      throw new Error("Grupo de modificadores no encontrado.");
    }

    const producto = productoSnap.data() as { espacioId?: string };
    const grupo = grupoSnap.data() as Omit<ModificadorGrupo, "id">;

    if (!grupo.activo) {
      throw new Error("No se puede asignar un grupo de modificadores inactivo.");
    }
    if ((producto.espacioId ?? "") !== espacioId) {
      throw new Error("El producto no pertenece al espacio indicado.");
    }
    if (grupo.espacioId !== espacioId) {
      throw new Error("El grupo no pertenece al espacio indicado.");
    }

    const minEfectivo = data.minSeleccion ?? grupo.minSeleccion;
    const maxEfectivo = data.maxSeleccion ?? grupo.maxSeleccion;
    validarRangoSeleccion(minEfectivo, maxEfectivo);

    const opcionIdsGrupo = new Set((grupo.opciones ?? []).map((opcion) => opcion.id));
    const opcionesPermitidas = data.opcionesPermitidas
      ? validarOpcionesUnicas(data.opcionesPermitidas, "opcionesPermitidas")
      : undefined;

    if (opcionesPermitidas) {
      for (const opcionId of opcionesPermitidas) {
        if (!opcionIdsGrupo.has(opcionId)) {
          throw new Error(`La opcion permitida "${opcionId}" no existe en el grupo.`);
        }
      }
    }

    const opcionOverrides = validarOverrides(data.opcionOverrides, opcionIdsGrupo);
    const creadoEnExistente = relacionSnap.exists()
      ? (relacionSnap.data().creadoEn ?? serverTimestamp())
      : serverTimestamp();

    transaction.set(relacionRef, {
      id: relacionId,
      espacioId,
      productoId,
      grupoId,
      orden: data.orden,
      activo: data.activo,
      ...(data.minSeleccion !== undefined ? { minSeleccion: data.minSeleccion } : {}),
      ...(data.maxSeleccion !== undefined ? { maxSeleccion: data.maxSeleccion } : {}),
      ...(opcionesPermitidas ? { opcionesPermitidas } : {}),
      ...(opcionOverrides ? { opcionOverrides } : {}),
      creadoEn: creadoEnExistente,
      actualizadoEn: serverTimestamp(),
    });
  });

  return relacionId;
}

export async function quitarGrupoDeProducto(
  productoId: string,
  grupoId: string
): Promise<void> {
  const relacionId = construirRelacionId(
    validarTextoObligatorio(productoId, "productoId"),
    validarTextoObligatorio(grupoId, "grupoId")
  );

  const relacionRef = doc(db, COLLECTION_NAME, relacionId);
  const snap = await getDoc(relacionRef);
  if (!snap.exists()) {
    throw new Error("Relacion producto-grupo no encontrada.");
  }

  await updateDoc(relacionRef, {
    activo: false,
    actualizadoEn: serverTimestamp(),
  });
}
