import assert from "node:assert/strict";
import test from "node:test";
import { crearDetectorCambioSenalBodega, crearSuscripcionRecuperableSenalBodega, interpretarSnapshotSenalBodega, rutaSenalBodega } from "./live-signals-service";
import { crearRefrescoCoalescido } from "./refresh-coalescido";

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

test("la primera señal remota provoca una relectura si llega después de iniciar la carga", async () => {
  const detectarCambio = crearDetectorCambioSenalBodega();
  assert.equal(detectarCambio({ version: 4, conectada: false }), false);

  let lecturas = 0;
  let iniciarLectura!: () => void;
  let terminarPrimeraLectura!: () => void;
  const lecturaIniciada = new Promise<void>(resolve => { iniciarLectura = resolve; });
  const primeraLecturaPendiente = new Promise<void>(resolve => { terminarPrimeraLectura = resolve; });
  const refrescar = crearRefrescoCoalescido(async () => {
    lecturas += 1;
    if (lecturas === 1) {
      iniciarLectura();
      await primeraLecturaPendiente;
    }
  });

  const cargaInicial = refrescar();
  await lecturaIniciada;
  const primeraSenalRemota = { version: 5, conectada: true };
  if (detectarCambio(primeraSenalRemota)) void refrescar();
  terminarPrimeraLectura();
  await cargaInicial;

  assert.equal(lecturas, 2);
  assert.equal(detectarCambio(primeraSenalRemota), false);
  assert.equal(detectarCambio({ version: 6, conectada: true }), true);
  assert.equal(detectarCambio({ version: null, conectada: false }), false);
  assert.equal(detectarCambio({ version: 6, conectada: true }), true);
});

test("una escucha terminada por error puede reconectarse sin recrear la vista", () => {
  const escuchas: Array<{ estado: (state: { version: number | null; conectada: boolean }) => void; error: () => void }> = [];
  const estados: Array<{ version: number | null; conectada: boolean }> = [];
  let cancelaciones = 0;
  const suscripcion = crearSuscripcionRecuperableSenalBodega((estado, error) => {
    escuchas.push({ estado, error });
    return () => { cancelaciones += 1; };
  }, estado => estados.push(estado));

  assert.equal(escuchas.length, 1);
  escuchas[0].error();
  assert.deepEqual(estados.at(-1), { version: null, conectada: false });

  suscripcion.reconectar();
  assert.equal(escuchas.length, 2);
  assert.equal(cancelaciones, 1);
  escuchas[1].estado({ version: 8, conectada: true });
  assert.deepEqual(estados.at(-1), { version: 8, conectada: true });

  suscripcion.cerrar();
  assert.equal(cancelaciones, 2);
  suscripcion.reconectar();
  assert.equal(escuchas.length, 2);
});
