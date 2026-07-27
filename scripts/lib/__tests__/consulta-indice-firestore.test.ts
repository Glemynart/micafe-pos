import assert from 'node:assert/strict'
import test from 'node:test'
import {
  construirConsultaRepresentativa,
  describirCamposIndice,
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
