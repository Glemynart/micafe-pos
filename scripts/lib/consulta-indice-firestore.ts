/**
 * Construye la consulta de solo lectura que el gate MT-U3 usa para comprobar
 * que un índice compuesto ya está disponible en Firestore.
 */

export type CampoIndice =
  | {
      fieldPath: string
      order: 'ASCENDING' | 'DESCENDING'
      arrayConfig?: never
    }
  | {
      fieldPath: string
      arrayConfig: 'CONTAINS'
      order?: never
    }

export interface IndiceDefinicion {
  collectionGroup: string
  fields: CampoIndice[]
}

type DireccionOrden = 'asc' | 'desc'

/** Superficie mínima de una Query de Firestore que necesita el verificador. */
export interface ConsultaIndiceFirestore {
  where(fieldPath: string, opStr: 'array-contains', value: string): ConsultaIndiceFirestore
  orderBy(fieldPath: string, directionStr: DireccionOrden): ConsultaIndiceFirestore
}

// No corresponde a un permiso ni a datos de negocio. Solo obliga a Firestore a
// planificar una consulta con array-contains; que no existan documentos que lo
// contengan es válido y sigue verificando la disponibilidad del índice.
export const VALOR_SONDA_ARRAY_CONTAINS = '__mt_u3_indice_probe__'

/**
 * Conserva las consultas compuestas únicamente por orden y representa un campo
 * `arrayConfig: CONTAINS` con la operación equivalente de Firestore.
 */
export function construirConsultaRepresentativa<T extends ConsultaIndiceFirestore>(
  consulta: T,
  fields: readonly CampoIndice[],
): T {
  let resultado: ConsultaIndiceFirestore = consulta

  for (const field of fields) {
    if ('arrayConfig' in field && field.arrayConfig === 'CONTAINS') {
      resultado = resultado.where(field.fieldPath, 'array-contains', VALOR_SONDA_ARRAY_CONTAINS)
    } else {
      resultado = resultado.orderBy(field.fieldPath, field.order === 'DESCENDING' ? 'desc' : 'asc')
    }
  }

  return resultado as T
}

export function describirCamposIndice(fields: readonly CampoIndice[]): string {
  return fields.map((field) => {
    if ('arrayConfig' in field && field.arrayConfig === 'CONTAINS') {
      return `${field.fieldPath} array-contains`
    }
    return `${field.fieldPath} ${field.order === 'DESCENDING' ? 'desc' : 'asc'}`
  }).join(', ')
}
