import assert from "node:assert/strict"
import test from "node:test"
import {
  ejecutarBackfill,
  hashSnapshotSinEmpresaId,
  seleccionarPlanBackfill,
} from "./eventos-legacy-backfill"
import type { InventarioEvento, MapeoEventoLegacy, ReporteInventarioEventos } from "./eventos-legacy-inventory"

function reporte(eventos: InventarioEvento[]): ReporteInventarioEventos {
  return {
    schemaVersion: 1,
    contrato: "B3-A-eventos-legacy-dry-run",
    modo: "DRY_RUN",
    projectId: "demo-b3-test",
    entorno: "EMULATOR",
    productionWrites: false,
    totales: {
      totalEventos: eventos.length,
      canonicos: 0,
      canonicosEmpresaInexistente: 0,
      legacy: eventos.length,
      legacySinMapeo: 0,
      legacyMapeoValido: eventos.filter((evento) => evento.estado === "LEGACY_MAPEO_VALIDO").length,
      legacyMapeoInvalido: 0,
      legacyMapeoConflictivo: 0,
      mapeosNoEncontrados: 0,
    },
    eventos,
    mapeosNoEncontrados: [],
  }
}

test("selecciona únicamente legacy con mapeo explícito válido y orden determinista", () => {
  const plan = seleccionarPlanBackfill(reporte([
    { eventoId: "zeta", estado: "LEGACY_MAPEO_VALIDO", empresaIdDestino: "empresa-2", evidencia: "acta-z", motivos: [] },
    { eventoId: "alfa", estado: "LEGACY_SIN_MAPEO", motivos: [] },
    { eventoId: "beta", estado: "LEGACY_MAPEO_INVALIDO", empresaIdDestino: "", evidencia: "", motivos: [] },
    { eventoId: "delta", estado: "LEGACY_MAPEO_VALIDO", empresaIdDestino: "empresa-1", evidencia: "acta-d", motivos: [] },
  ]))

  assert.deepEqual(plan, [
    { eventoId: "delta", empresaIdDestino: "empresa-1", evidencia: "acta-d" },
    { eventoId: "zeta", empresaIdDestino: "empresa-2", evidencia: "acta-z" },
  ])
})

test("la evidencia del snapshot ignora únicamente empresaId", () => {
  const antes = {
    empresaId: "empresa-original",
    titulo: "Evento histórico",
    fecha: "2026-08-08",
    contenido: { orden: ["a", "b"], activo: true },
  }
  const después = { ...antes, empresaId: "empresa-destino" }
  const mutado = { ...después, titulo: "Evento alterado" }

  assert.equal(hashSnapshotSinEmpresaId(antes), hashSnapshotSinEmpresaId(después))
  assert.notEqual(hashSnapshotSinEmpresaId(antes), hashSnapshotSinEmpresaId(mutado))
})

test("incluye un canónico únicamente para verificar replay mediante mapeo explícito", () => {
  const inventario = reporte([
    {
      eventoId: "evento-canonico",
      estado: "CANONICO",
      empresaIdActual: "empresa-1",
      motivos: [],
    },
  ])
  const mapeo: MapeoEventoLegacy = { eventoId: "evento-canonico", empresaId: "empresa-1", evidencia: "acta-replay" }

  assert.deepEqual(seleccionarPlanBackfill(inventario), [])
  assert.deepEqual(seleccionarPlanBackfill(inventario, [mapeo]), [
    { eventoId: "evento-canonico", empresaIdDestino: "empresa-1", evidencia: "acta-replay" },
  ])
  assert.deepEqual(seleccionarPlanBackfill(inventario, [mapeo, { ...mapeo, empresaId: "empresa-2" }]), [])
})

test("rechaza ejecución fuera de Emulator antes de tocar Firestore", async () => {
  await assert.rejects(
    ejecutarBackfill({} as never, [], { projectId: "prod", entorno: "CONFIGURADO", execute: true }),
    /solo permite --execute en un proyecto demo-b3-eventos/,
  )
})
