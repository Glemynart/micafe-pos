import assert from 'node:assert/strict'
import test from 'node:test'
import { drenarPagina, type EscritorEnLote } from '../drenar-pagina'

/**
 * Doble fiel de `BulkWriter` en lo único que importa aquí: **bufferiza**.
 *
 * `update()` devuelve una promesa que solo se asienta cuando el lote se envía
 * de verdad, y el envío ocurre exclusivamente en dos situaciones:
 *   (a) el búfer alcanza `tamanoLote` (auto-envío), o
 *   (b) alguien llama a `flush()`.
 *
 * Es exactamente la semántica que provocó el fallo en producción: las
 * escrituras que no completan un lote quedan retenidas indefinidamente si nadie
 * drena, y `await` sobre ellas nunca retorna.
 */
class BulkWriterFalso implements EscritorEnLote {
  enviados: string[] = []
  flushes = 0
  private pendientes: { id: string; resolver: () => void }[] = []

  constructor(private readonly tamanoLote = 20) {}

  update(id: string): Promise<void> {
    return new Promise<void>((resolve) => {
      this.pendientes.push({ id, resolver: resolve })
      if (this.pendientes.length >= this.tamanoLote) this.enviarPendientes()
    })
  }

  async flush(): Promise<void> {
    this.flushes++
    this.enviarPendientes()
  }

  private enviarPendientes() {
    const lote = this.pendientes
    this.pendientes = []
    for (const p of lote) {
      this.enviados.push(p.id)
      p.resolver()
    }
  }
}

/** Resuelve a 'colgado' si la promesa no se asienta en el plazo dado. */
async function conTiempoLimite<T>(p: Promise<T>, ms = 150): Promise<T | 'colgado'> {
  let temporizador: NodeJS.Timeout | undefined
  const centinela = new Promise<'colgado'>((resolve) => {
    temporizador = setTimeout(() => resolve('colgado'), ms)
  })
  try {
    return await Promise.race([p, centinela])
  } finally {
    if (temporizador) clearTimeout(temporizador)
  }
}

/** Encola `n` escrituras y devuelve sus promesas, como hace el backfill. */
function encolar(bw: BulkWriterFalso, n: number, prefijo = 'doc'): Promise<void>[] {
  return Array.from({ length: n }, (_, i) => bw.update(`${prefijo}-${i}`))
}

test('REGRESIÓN — un último lote incompleto se cuelga si se espera sin drenar', async () => {
  // Reproduce el comportamiento ANTERIOR a la corrección: `Promise.all` directo
  // sobre 4 escrituras que no completan un lote de 20. Documenta el defecto.
  const bw = new BulkWriterFalso(20)
  const escrituras = encolar(bw, 4)

  const resultado = await conTiempoLimite(Promise.all(escrituras))

  assert.equal(resultado, 'colgado', 'sin flush(), esperar el lote incompleto no retorna nunca')
  assert.deepEqual(bw.enviados, [], 'y ninguna escritura llega a enviarse')
})

test('REGRESIÓN — drenarPagina completa un último lote incompleto', async () => {
  const bw = new BulkWriterFalso(20)
  const escrituras = encolar(bw, 4)

  const resultado = await conTiempoLimite(drenarPagina(bw, escrituras))

  assert.notEqual(resultado, 'colgado', 'drenarPagina debe retornar, no colgarse')
  assert.equal(bw.flushes, 1, 'debe drenar el búfer exactamente una vez')
  assert.equal(bw.enviados.length, 4, 'las 4 escrituras del lote incompleto deben enviarse')
})

test('REGRESIÓN — escenario exacto de producción: 44 documentos, 40 auto-enviados y 4 retenidos', async () => {
  // `ventas` tenía 44 huérfanos. Con lotes de 20 se auto-enviaron 40 y los 4
  // restantes quedaron en el búfer; el proceso murió sin escribirlos.
  const bw = new BulkWriterFalso(20)
  const escrituras = encolar(bw, 44, 'venta')

  assert.equal(bw.enviados.length, 40, 'precondición: el auto-envío solo cubre los lotes completos')

  const resultado = await conTiempoLimite(drenarPagina(bw, escrituras))

  assert.notEqual(resultado, 'colgado')
  assert.equal(bw.enviados.length, 44, 'tras drenar no debe quedar ninguna escritura retenida')
  assert.equal(new Set(bw.enviados).size, 44, 'sin duplicados: cada documento se envía una sola vez')
})

test('una página sin escrituras es no-op y no gasta un viaje de red', async () => {
  // Dry-run, o página cuyos documentos ya estaban todos estampados.
  const bw = new BulkWriterFalso(20)

  await drenarPagina(bw, [])

  assert.equal(bw.flushes, 0, 'no debe llamarse a flush() si no hay nada encolado')
  assert.deepEqual(bw.enviados, [])
})

test('sin escritor (dry-run) no se toca la red y se conserva la contrapresión', async () => {
  // En dry-run el backfill no crea BulkWriter: `escritor` llega como null y la
  // lista de escrituras siempre está vacía. No debe lanzar.
  await drenarPagina(null, [])
})

test('la contrapresión por página se conserva: drenarPagina no retorna antes de tiempo', async () => {
  // Garantiza que el helper realmente ESPERA a que las escrituras se asienten,
  // que es la propiedad de contrapresión que el script declara querer: no se
  // pagina a la siguiente página con trabajo aún en vuelo.
  const bw = new BulkWriterFalso(20)
  const escrituras = encolar(bw, 5)
  let asentadas = 0
  for (const p of escrituras) void p.then(() => { asentadas++ })

  await drenarPagina(bw, escrituras)

  assert.equal(asentadas, 5, 'al retornar, todos los .then de contabilidad ya se ejecutaron')
})

test('varias páginas consecutivas drenan de forma independiente', async () => {
  // El BulkWriter es uno por colección y sobrevive a todas sus páginas: flush()
  // debe poder invocarse repetidamente sobre la misma instancia.
  const bw = new BulkWriterFalso(20)

  await drenarPagina(bw, encolar(bw, 3, 'p1'))
  await drenarPagina(bw, encolar(bw, 7, 'p2'))

  assert.equal(bw.flushes, 2)
  assert.equal(bw.enviados.length, 10)
  assert.equal(new Set(bw.enviados).size, 10)
})
