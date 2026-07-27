import assert from 'node:assert/strict'
import test from 'node:test'
import {
  construirConsultaRepresentativa,
  describirCamposIndice,
  type CampoIndice,
  type ConsultaIndiceFirestore,
  VALOR_SONDA_ARRAY_CONTAINS,
} from '../consulta-indice-firestore'

class ConsultaFalsa implements ConsultaIndiceFirestore {
  operaciones: string[] = []

  where(fieldPath: string, opStr: 'array-contains', value: string): this {
    this.operaciones.push(`where:${fieldPath}:${opStr}:${value}`)
    return this
  }

  orderBy(fieldPath: string, directionStr: 'asc' | 'desc'): this {
    this.operaciones.push(`orderBy:${fieldPath}:${directionStr}`)
    return this
  }
}

test('conserva orderBy para un índice compuesto solo por campos ordenados', () => {
  const consulta = construirConsultaRepresentativa(new ConsultaFalsa(), [
    { fieldPath: 'empresaId', order: 'ASCENDING' },
    { fieldPath: 'fecha', order: 'DESCENDING' },
  ])

  assert.deepEqual(consulta.operaciones, [
    'orderBy:empresaId:asc',
    'orderBy:fecha:desc',
  ])
})

test('representa arrayConfig CONTAINS con array-contains y ordena solo los campos posteriores', () => {
  const fields = [
    { fieldPath: 'facultades', arrayConfig: 'CONTAINS' as const },
    { fieldPath: 'estado', order: 'ASCENDING' as const },
    { fieldPath: 'actualizadoEn', order: 'DESCENDING' as const },
  ]
  const consulta = construirConsultaRepresentativa(new ConsultaFalsa(), fields)

  assert.deepEqual(consulta.operaciones, [
    `where:facultades:array-contains:${VALOR_SONDA_ARRAY_CONTAINS}`,
    'orderBy:estado:asc',
    'orderBy:actualizadoEn:desc',
  ])
  assert.equal(
    describirCamposIndice(fields),
    'facultades array-contains, estado asc, actualizadoEn desc',
  )
})

// Caracterización, no aprobación: documenta que hoy una forma de campo que no
// declara `order` ni `arrayConfig` se trata como orden ascendente. La unión
// `CampoIndice` no admite esa forma, de modo que construirla exige un escape de
// tipos — y ese escape es justamente la evidencia de que el tipo estático no
// protege este camino: los campos llegan de `firestore.indexes.json` mediante un
// `JSON.parse(...) as ...` sin validar. Si alguna vez aparece un campo así (p. ej.
// `vectorConfig`), el índice se probaría con la consulta equivocada y el gate
// volvería a dar un falso negativo. Endurecerlo es una decisión aparte: este test
// solo fija el comportamiento actual para que el cambio sea visible cuando llegue.
test('documenta el fallback actual: una forma de campo desconocida se trata como orden ascendente', () => {
  const campoDesconocido = { fieldPath: 'embedding' } as unknown as CampoIndice
  const consulta = construirConsultaRepresentativa(new ConsultaFalsa(), [campoDesconocido])

  assert.deepEqual(consulta.operaciones, ['orderBy:embedding:asc'])
  assert.equal(describirCamposIndice([campoDesconocido]), 'embedding asc')
})
