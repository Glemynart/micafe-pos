import assert from "node:assert/strict"
import test from "node:test"
import { crearRefrescoCoalescido } from "./refresh-coalescido"

function crearDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolver) => { resolve = resolver })
  return { promise, resolve }
}

test("una señal durante una relectura activa provoca una nueva lectura y agrupa señales consecutivas", async () => {
  const iniciada = crearDeferred<void>()
  const liberar = crearDeferred<void>()
  let lecturas = 0
  const actualizar = crearRefrescoCoalescido(async () => {
    lecturas += 1
    if (lecturas === 1) {
      iniciada.resolve()
      await liberar.promise
    }
  })

  const primera = actualizar()
  await iniciada.promise
  const segunda = actualizar()
  const tercera = actualizar()

  assert.equal(lecturas, 1)
  liberar.resolve()
  await Promise.all([primera, segunda, tercera])

  assert.equal(lecturas, 2)
})

test("un error no deja bloqueadas las relecturas posteriores", async () => {
  let intentos = 0
  const actualizar = crearRefrescoCoalescido(async () => {
    intentos += 1
    if (intentos === 1) throw new Error("fallo transitorio")
  })

  await assert.rejects(actualizar(), /fallo transitorio/)
  await actualizar()

  assert.equal(intentos, 2)
})
