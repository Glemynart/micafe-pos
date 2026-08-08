import assert from "node:assert/strict"
import test from "node:test"
import { listarEventosPublicos } from "./route"

type Datos = Record<string, Record<string, Record<string, unknown>>>

function dbDePrueba(datos: Datos) {
  function consulta(coleccion: string, filtros: Array<[string, unknown]> = [], limite?: number) {
    const builder = {
      where(campo: string, _operador: string, valor: unknown) {
        return consulta(coleccion, [...filtros, [campo, valor]], limite)
      },
      limit(valor: number) {
        return consulta(coleccion, filtros, valor)
      },
      orderBy() {
        return builder
      },
      async get() {
        const docs = Object.entries(datos[coleccion] || {})
          .filter(([, data]) => filtros.every(([campo, valor]) => data[campo] === valor))
          .slice(0, limite ?? Number.POSITIVE_INFINITY)
          .map(([id, data]) => ({ id, data: () => data }))
        return { size: docs.length, docs }
      },
    }
    return builder
  }

  return {
    collection(coleccion: string) {
      return consulta(coleccion)
    },
  } as unknown as FirebaseFirestore.Firestore
}

const evento = (empresaId: string, titulo: string, activo = true) => ({
  empresaId,
  titulo,
  descripcion: `${titulo} descripción`,
  fecha: "2099-01-01",
  hora: "10:00",
  categoria: "Taller",
  activo,
  creadoPor: "no-debe-exponerse",
})

test("eventos públicos: devuelve únicamente eventos activos del tenant resuelto", async () => {
  const db = dbDePrueba({
    empresas: {
      a: { slug: "tenant-a", estado: "activa" },
      b: { slug: "tenant-b", estado: "trial" },
    },
    eventos: {
      "a-activo": evento("a", "Evento A"),
      "a-inactivo": evento("a", "Evento A oculto", false),
      "b-activo": evento("b", "Evento B"),
      legacy: { titulo: "Evento legacy", activo: true, fecha: "2099-01-01" },
    },
  })

  const response = await listarEventosPublicos(new Request("https://app.test/api/public/eventos?slug=tenant-a"), db)
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.eventos.map((item: { titulo: string }) => item.titulo), ["Evento A"])
  assert.equal(body.eventos[0].empresaId, undefined)
  assert.equal(body.eventos[0].creadoPor, undefined)
})

test("eventos públicos: slug inexistente, ambiguo y tenant suspendido no enumeran empresas", async () => {
  const db = dbDePrueba({
    empresas: {
      suspendida: { slug: "suspendida", estado: "suspendida" },
      ambiguaA: { slug: "duplicada", estado: "activa" },
      ambiguaB: { slug: "duplicada", estado: "activa" },
    },
    eventos: {},
  })

  for (const slug of ["no-existe", "duplicada", "suspendida"]) {
    const response = await listarEventosPublicos(new Request(`https://app.test/api/public/eventos?slug=${slug}`), db)
    assert.equal(response.status, 404, slug)
  }

  const missing = await listarEventosPublicos(new Request("https://app.test/api/public/eventos"), db)
  assert.equal(missing.status, 400)
})

test("eventos públicos: dos tenants operativos permanecen aislados", async () => {
  const db = dbDePrueba({
    empresas: {
      a: { slug: "tenant-a", estado: "activa" },
      b: { slug: "tenant-b", estado: "activa" },
    },
    eventos: {
      "a-activo": evento("a", "Evento A"),
      "b-activo": evento("b", "Evento B"),
    },
  })

  const responseA = await listarEventosPublicos(new Request("https://app.test/api/public/eventos?slug=tenant-a"), db)
  const responseB = await listarEventosPublicos(new Request("https://app.test/api/public/eventos?slug=tenant-b"), db)
  assert.deepEqual((await responseA.json()).eventos.map((item: { titulo: string }) => item.titulo), ["Evento A"])
  assert.deepEqual((await responseB.json()).eventos.map((item: { titulo: string }) => item.titulo), ["Evento B"])
})
