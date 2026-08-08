import assert from "node:assert/strict"
import test from "node:test"
import { construirReporteInventario, parsearMapeos } from "./eventos-legacy-inventory"

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
