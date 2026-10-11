import assert from "node:assert/strict";
import test from "node:test";
import { interpretarSnapshotSenalBodega, rutaSenalBodega } from "./live-signals-service";

test("las rutas de señales se limitan a canales soportados y al vendedor propio", () => {
  assert.equal(rutaSenalBodega("tenant-a", "disponibilidad"), "empresas/tenant-a/bodega_senales/disponibilidad");
  assert.equal(rutaSenalBodega("tenant-a", "solicitudes_admin"), "empresas/tenant-a/bodega_senales/solicitudes_admin");
  assert.equal(rutaSenalBodega("tenant-a", "solicitudes_vendedor", "seller-1"), "empresas/tenant-a/bodega_senales_vendedor/seller-1");
  assert.throws(() => rutaSenalBodega("tenant-a", "solicitudes_admin", "seller-1"));
  assert.throws(() => rutaSenalBodega("tenant-a", "solicitudes_vendedor"));
  assert.throws(() => rutaSenalBodega("tenant/a", "disponibilidad"));
  assert.throws(() => rutaSenalBodega("tenant-a", "otro" as never));
});

test("un snapshot de señal valida tenant, versión y estado de conexión antes de reconsultar", () => {
  const map = (data: Record<string, unknown> | undefined, fromCache: boolean) => ({
    exists: () => data !== undefined,
    data: () => data,
    metadata: { fromCache },
  });

  assert.deepEqual(interpretarSnapshotSenalBodega(map({ empresaId: "tenant-a", version: 4 }, false), "tenant-a"), { version: 4, conectada: true });
  assert.deepEqual(interpretarSnapshotSenalBodega(map({ empresaId: "tenant-a", version: 4 }, true), "tenant-a"), { version: 4, conectada: false });
  assert.deepEqual(interpretarSnapshotSenalBodega(map(undefined, false), "tenant-a"), { version: 0, conectada: true });
  assert.deepEqual(interpretarSnapshotSenalBodega(map({ empresaId: "tenant-b", version: 4 }, false), "tenant-a"), { version: null, conectada: false });
  assert.deepEqual(interpretarSnapshotSenalBodega(map({ empresaId: "tenant-a", version: "4" }, false), "tenant-a"), { version: null, conectada: false });
});
