/**
 * mt-u3-colecciones-oficiales.ts — Fuente única de la lista oficial de
 * colecciones operativas de MT-U3 (MT-U3-helper-tenant-diseno.md §7.1).
 *
 * Módulo compartido SOLO para scripts (`scripts/`): sin dependencias de
 * runtime (no inicializa Firebase, no importa nada de `lib/`), sin efectos
 * secundarios de carga — es puro dato + una función de verificación que
 * recibe el `Firestore` ya inicializado del llamador.
 *
 * Consumido por `migrate-mt-u3-operativo.ts` y `rollback-mt-u3-operativo.ts`
 * para que ambos operen SIEMPRE sobre el mismo conjunto de 25 colecciones —
 * antes de este módulo, la lista estaba duplicada verbatim en ambos scripts,
 * con riesgo de que un cambio futuro en uno no se replicara en el otro y el
 * rollback dejara de cubrir exactamente lo que el backfill tocó.
 */

import type { Firestore } from 'firebase-admin/firestore'

export type GuardaEspecial = 'movimientos_inventario_default'

export interface ColeccionConfig {
  nombre: string
  guardaEspecial?: GuardaEspecial
}

// Orden = prioridad de migración del diseño: P0 (ledger, resuelve D-U2-3),
// P1 (alto volumen/fiscal), P2 (resto, alfabético). El orden es informativo
// para el reporte; cada colección es independiente e idempotente por sí sola.
export const COLECCIONES_OFICIALES: ColeccionConfig[] = [
  // P0 — ledger primero: resuelve D-U2-3 (empresaId:"default" hardcodeado)
  { nombre: 'movimientos_inventario', guardaEspecial: 'movimientos_inventario_default' },
  // P1 — alto volumen / fiscal
  { nombre: 'ventas' },
  { nombre: 'transacciones_financieras' },
  { nombre: 'turnos' },
  { nombre: 'compras' },
  // P2 — resto (orden alfabético)
  { nombre: 'agendas' },
  { nombre: 'auditoria_logs' },
  { nombre: 'categorias' },
  { nombre: 'clientes' },
  { nombre: 'comandas_cocina' },
  { nombre: 'consignadores' },
  { nombre: 'cuentas_bancarias' },
  { nombre: 'egresos' },
  { nombre: 'espacios' },
  { nombre: 'insumos' },
  { nombre: 'liquidaciones' },
  { nombre: 'mermas' },
  { nombre: 'mesas' },
  { nombre: 'modificador_grupos' },
  { nombre: 'pedidos_activos' },
  { nombre: 'producto_modificador_grupos' },
  { nombre: 'productos' },
  { nombre: 'recetas' },
  { nombre: 'reservas' },
  { nombre: 'turnos_activos' },
]

/**
 * Colecciones globales conocidas que NO ganan `empresaId` en MT-U3
 * (MT-U3-helper-tenant-diseno.md §7.2). Existen hoy en Firestore pero no
 * pertenecen a la lista oficial por diseño — se excluyen de la verificación
 * de "colección desconocida" para no generar ruido en cada corrida.
 */
export const GLOBALES_CONOCIDAS = [
  'usuarios',
  'permisos_roles',
  'empresas',
  'membresias',
  'eventos',
  'configuracion',
] as const

export interface VerificacionColecciones {
  /** Colecciones que EXISTEN en Firestore pero no están ni en la lista oficial ni en las globales conocidas. */
  desconocidas: string[]
  /** Entradas de la lista oficial que `listCollections()` no reportó (o no tienen documentos, o el nombre es incorrecto). */
  faltantesEnFirestore: string[]
}

/**
 * Cruza la lista oficial contra las colecciones reales de Firestore
 * (`db.listCollections()`, metadato barato — una sola llamada, no lee
 * documentos). Es la red de seguridad que evita repetir la clase de error
 * que originó la discrepancia de MT-U1 (colecciones reales omitidas de la
 * lista, o entradas que nunca fueron colecciones reales).
 *
 * Nota sobre `faltantesEnFirestore`: `listCollections()` solo devuelve
 * colecciones con al menos un documento. Una entrada oficial "faltante" aquí
 * puede significar (a) el nombre está mal escrito, o (b) la colección existe
 * en el modelo pero está legítimamente vacía en este momento — el llamador
 * debe presentarlo como advertencia a revisar, nunca como error automático.
 *
 * SOLO LECTURA. No modifica datos. No aborta nada por sí misma — el
 * llamador decide qué hacer con el resultado (MT-U3 Capa 0, Y2: nunca debe
 * impedir el dry-run).
 */
export async function verificarColeccionesContraFirestore(db: Firestore): Promise<VerificacionColecciones> {
  const coleccionesReales = (await db.listCollections()).map((c) => c.id)
  const oficialesSet = new Set(COLECCIONES_OFICIALES.map((c) => c.nombre))
  const globalesSet = new Set<string>(GLOBALES_CONOCIDAS)

  const desconocidas = coleccionesReales.filter((n) => !oficialesSet.has(n) && !globalesSet.has(n))
  const faltantesEnFirestore = COLECCIONES_OFICIALES.map((c) => c.nombre).filter(
    (n) => !coleccionesReales.includes(n)
  )

  return { desconocidas, faltantesEnFirestore }
}
