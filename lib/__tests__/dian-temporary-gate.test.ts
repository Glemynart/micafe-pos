import assert from "node:assert/strict";
import test from "node:test";
import { ejecutarAccionDianConDisponibilidad } from "../dian-temporary-gate";

const empresasAfectadas = [
  { nombre: "Cafe Atrato", empresaId: "1ae0rD9H8t3ZFSBKrrHR" },
  { nombre: "Prueba", empresaId: "Prueba" },
] as const;
const accionesDian = ["factura individual", "lote", "nota débito", "nota crédito"] as const;

for (const empresa of empresasAfectadas) {
  for (const accion of accionesDian) {
    test(`${empresa.nombre}: bloquea ${accion} antes de Factus y metadatos DIAN`, async () => {
      const efectos: string[] = [];

      const resultado = await ejecutarAccionDianConDisponibilidad(empresa.empresaId, async () => {
        efectos.push(`${accion}:factus`);
        efectos.push(`${accion}:metadatos-dian`);
        return { ok: true };
      });

      assert.deepEqual(resultado, { estado: "indisponible" });
      assert.deepEqual(efectos, []);
    });
  }
}

test("un tenant distinto conserva la emisión DIAN y completa sus efectos", async () => {
  const efectos: string[] = [];

  const resultado = await ejecutarAccionDianConDisponibilidad("tenant-no-afectado", async () => {
    efectos.push("factus");
    efectos.push("metadatos-dian");
    return { ok: true };
  });

  assert.deepEqual(resultado, { estado: "ejecutada", valor: { ok: true } });
  assert.deepEqual(efectos, ["factus", "metadatos-dian"]);
});

test("no invoca Factus si no se pudo resolver el tenant activo", async () => {
  const efectos: string[] = [];

  const resultado = await ejecutarAccionDianConDisponibilidad(null, async () => {
    efectos.push("factus");
    return { ok: true };
  });

  assert.deepEqual(resultado, { estado: "empresa_no_resuelta" });
  assert.deepEqual(efectos, []);
});
