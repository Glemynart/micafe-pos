import assert from "node:assert/strict"
import test from "node:test"
import {
  analizarReferenciaAsset,
  construirInventarioAssets,
  construirReporteInventario,
  parsearMapeos,
  serializarReporte,
} from "./eventos-legacy-inventory"

const empresas = [
  { id: "tenant-a", data: { estado: "activa", nombre: "Café A" } },
  { id: "tenant-suspendido", data: { estado: "suspendida", nombre: "Café S" } },
]

test("clasifica canónicos, legacy sin mapeo y mapeos válidos sin inferir por nombre", () => {
  const reporte = construirReporteInventario(
    [
      { id: "canonico", data: { empresaId: "tenant-a", titulo: "Evento canónico" } },
      { id: "legacy", data: { titulo: "Café A", slug: "cafe-a" } },
      { id: "legacy-suspendido", data: { titulo: "Evento histórico" } },
    ],
    empresas,
    [{ eventoId: "legacy-suspendido", empresaId: "tenant-suspendido", evidencia: "evidencia archivada #42" }],
    { projectId: "demo-b3-eventos-test", entorno: "EMULATOR" },
  )

  assert.deepEqual(reporte.totales, {
    totalEventos: 3,
    canonicos: 1,
    canonicosEmpresaInexistente: 0,
    legacy: 2,
    legacySinMapeo: 1,
    legacyMapeoValido: 1,
    legacyMapeoInvalido: 0,
    legacyMapeoConflictivo: 0,
    mapeosNoEncontrados: 0,
  })
  assert.equal(reporte.eventos.find((evento) => evento.eventoId === "legacy")?.estado, "LEGACY_SIN_MAPEO")
  assert.equal(reporte.eventos.find((evento) => evento.eventoId === "legacy-suspendido")?.estado, "LEGACY_MAPEO_VALIDO")
})

test("rechaza destinos inexistentes y evidencia ausente sin proponer escrituras", () => {
  const reporte = construirReporteInventario(
    [{ id: "legacy", data: { titulo: "Evento" } }, { id: "canonico-huerfano", data: { empresaId: "no-existe" } }],
    empresas,
    [{ eventoId: "legacy", empresaId: "no-existe", evidencia: "" }],
    { projectId: "demo-b3-eventos-test", entorno: "EMULATOR" },
  )

  assert.equal(reporte.productionWrites, false)
  assert.equal(reporte.eventos.find((evento) => evento.eventoId === "legacy")?.estado, "LEGACY_MAPEO_INVALIDO")
  assert.equal(reporte.eventos.find((evento) => evento.eventoId === "canonico-huerfano")?.estado, "CANONICO_EMPRESA_INEXISTENTE")
})

test("clasifica mapeos duplicados como conflictivos y mapeos desconocidos como no encontrados", () => {
  const reporte = construirReporteInventario(
    [{ id: "legacy", data: {} }],
    empresas,
    [
      { eventoId: "legacy", empresaId: "tenant-a", evidencia: "fuente A" },
      { eventoId: "legacy", empresaId: "tenant-suspendido", evidencia: "fuente B" },
      { eventoId: "evento-inexistente", empresaId: "tenant-a", evidencia: "fuente C" },
    ],
    { projectId: "demo-b3-eventos-test", entorno: "EMULATOR" },
  )

  assert.equal(reporte.eventos[0].estado, "LEGACY_MAPEO_CONFLICTIVO")
  assert.deepEqual(reporte.mapeosNoEncontrados, ["evento-inexistente"])
  assert.equal(reporte.totales.mapeosNoEncontrados, 1)
})

test("el manifiesto requiere versión y campos explícitos", () => {
  assert.deepEqual(parsearMapeos({ schemaVersion: 1, mapeos: [{ eventoId: "e1", empresaId: "t1", evidencia: "doc" }] }), [
    { eventoId: "e1", empresaId: "t1", evidencia: "doc" },
  ])
  assert.throws(() => parsearMapeos({ schemaVersion: 2, mapeos: [] }), /schemaVersion=1/)
  assert.throws(() => parsearMapeos({ schemaVersion: 1 }), /arreglo mapeos/)
})

test("analiza referencias Storage sin conservar tokens ni asignar tenant por la URL", () => {
  const gs = analizarReferenciaAsset("gs://bucket-demo/eventos/legacy.png?token=secreto")
  const firebase = analizarReferenciaAsset("https://firebasestorage.googleapis.com/v0/b/bucket-demo/o/tenants%2Ftenant-a%2Feventos%2Fe1%2Fcanonico.png?alt=media&token=secreto")
  const externa = analizarReferenciaAsset("https://cdn.example.test/imagen.png")

  assert.equal(gs?.tipo, "STORAGE_PATH")
  assert.equal(gs?.path, "eventos/legacy.png")
  assert.equal(gs?.ruta, "LEGACY")
  assert.equal(firebase?.bucket, "bucket-demo")
  assert.equal(firebase?.path, "tenants/tenant-a/eventos/e1/canonico.png")
  assert.equal(firebase?.ruta, "CANONICA_TENANT")
  assert.equal(externa?.tipo, "URL_EXTERNA")
  assert.equal(externa?.host, "cdn.example.test")
  assert.notEqual(JSON.stringify(gs), JSON.stringify({ token: "secreto" }))
})

test("inventaría assets existentes, compartidos, externos y huérfanos de forma determinista", () => {
  const eventos = [
    { id: "legacy-a", data: { imagenUrl: "gs://bucket-demo/eventos/shared.png?token=uno" } },
    { id: "legacy-b", data: { imagenUrl: "gs://bucket-demo/eventos/shared.png?token=dos" } },
    { id: "legacy-c", data: { imagenUrl: "https://cdn.example.test/externa.png" } },
    { id: "legacy-d", data: {} },
  ]
  const primero = construirInventarioAssets(eventos, [
    { bucket: "bucket-demo", path: "eventos/shared.png" },
    { bucket: "bucket-demo", path: "eventos/orphan.png" },
  ])
  const segundo = construirInventarioAssets(eventos, [
    { bucket: "bucket-demo", path: "eventos/shared.png" },
    { bucket: "bucket-demo", path: "eventos/orphan.png" },
  ])

  assert.deepEqual(primero, segundo)
  assert.equal(primero.totales.referencias, 3)
  assert.equal(primero.totales.assetsCompartidos, 1)
  assert.equal(primero.totales.objetosNoReferenciados, 1)
  assert.equal(primero.totales.eventosConAsset, 3)
  assert.equal(primero.totales.eventosSinAsset, 1)
  assert.equal(primero.assets.find((asset) => asset.path === "eventos/shared.png")?.estado, "REFERENCIA_COMPARTIDA")
  assert.equal(primero.assets.find((asset) => asset.tipo === "URL_EXTERNA")?.estado, "URL_EXTERNA_NO_VERIFICABLE")
  assert.equal(primero.assets.find((asset) => asset.path === "eventos/orphan.png")?.estado, "OBJETO_NO_REFERENCIADO")
})

test("la evidencia serializada es reproducible y no contiene URLs o tokens crudos", () => {
  const reporte = construirReporteInventario(
    [{ id: "legacy", data: { imagenUrl: "gs://bucket-demo/eventos/legacy.png?token=secreto" } }],
    empresas,
    [],
    { projectId: "demo-b3-eventos-test", entorno: "EMULATOR" },
    { storageObjects: [{ bucket: "bucket-demo", path: "eventos/legacy.png" }] },
  )
  const primero = serializarReporte(reporte)
  const segundo = serializarReporte(reporte)

  assert.equal(primero, segundo)
  assert.equal(primero.includes("token=secreto"), false)
  assert.equal(primero.includes("gs://bucket-demo"), false)
})
