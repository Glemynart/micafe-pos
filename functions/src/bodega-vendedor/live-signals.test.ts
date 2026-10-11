import assert from "node:assert/strict";
import test from "node:test";
import {
  marcarSenalDisponibilidadBodega,
  marcarSenalSolicitudesAdminBodega,
  marcarSenalSolicitudesVendedorBodega,
} from "./live-signals";

type Write = { path: string; data: Record<string, unknown>; merge: boolean };

function signalHarness() {
  const writes: Write[] = [];
  const db = {
    collection(name: string) {
      return {
        doc(id: string) {
          const path = `${name}/${id}`;
          return {
            path,
            collection(nested: string) {
              return { doc(nestedId: string) { return { path: `${path}/${nested}/${nestedId}` }; } };
            },
          };
        },
      };
    },
  };
  const tx = { set(ref: { path: string }, data: Record<string, unknown>, options: { merge: boolean }) {
    writes.push({ path: ref.path, data, merge: options.merge });
  } };
  return { tx, db, writes };
}

test("señales de disponibilidad y bandeja admin solo escriben versiones técnicas tenant-aware", () => {
  const { tx, db, writes } = signalHarness();

  marcarSenalDisponibilidadBodega(tx, db, "empresa-a");
  marcarSenalSolicitudesAdminBodega(tx, db, "empresa-a");

  assert.deepEqual(writes.map(write => write.path), [
    "empresas/empresa-a/bodega_senales/disponibilidad",
    "empresas/empresa-a/bodega_senales/solicitudes_admin",
  ]);
  for (const write of writes) {
    assert.equal(write.data.empresaId, "empresa-a");
    assert.ok("version" in write.data);
    assert.ok("actualizadoEn" in write.data);
    assert.equal(write.merge, true);
    assert.deepEqual(Object.keys(write.data).sort(), ["actualizadoEn", "empresaId", "version"]);
  }
});

test("señal propia del vendedor queda bajo un id determinista y solo incluye su uid como selector de Rules", () => {
  const { tx, db, writes } = signalHarness();

  marcarSenalSolicitudesVendedorBodega(tx, db, "empresa-a", "vendedor-1");

  assert.equal(writes.length, 1);
  assert.match(writes[0].path, /^empresas\/empresa-a\/bodega_senales_vendedor\/[A-Za-z0-9_-]+$/);
  assert.equal(writes[0].data.empresaId, "empresa-a");
  assert.equal(writes[0].data.uid, "vendedor-1");
  assert.ok("version" in writes[0].data);
  assert.ok("actualizadoEn" in writes[0].data);
  assert.equal(writes[0].merge, true);
  assert.equal("solicitudId" in writes[0].data, false);
  assert.equal("clienteId" in writes[0].data, false);
  assert.equal("totalCOP" in writes[0].data, false);
});
