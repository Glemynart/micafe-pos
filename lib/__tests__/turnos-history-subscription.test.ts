import assert from "node:assert/strict";
import test from "node:test";
import { suscribirTrasPreparacion } from "../turnos-history-subscription";

function siguienteTarea(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("entrega los datos recibidos y libera el listener al cancelar", async () => {
  const datos: string[] = [];
  let liberar = 0;

  const cancelar = suscribirTrasPreparacion<string>(
    async (emitir) => {
      emitir("turno-1");
      return () => { liberar += 1; };
    },
    (dato) => datos.push(dato),
    () => assert.fail("no debía notificarse un error"),
  );

  await siguienteTarea();

  assert.deepEqual(datos, ["turno-1"]);
  cancelar();
  assert.equal(liberar, 1);
});

test("notifica fallos al preparar las consultas en vez de dejar la vista cargando", async () => {
  const fallo = Object.assign(new Error("denegado"), { code: "permission-denied" });
  const errores: unknown[] = [];

  const cancelar = suscribirTrasPreparacion<string>(
    async () => { throw fallo; },
    () => assert.fail("no debía emitir datos"),
    (error) => errores.push(error),
  );

  await siguienteTarea();

  assert.deepEqual(errores, [fallo]);
  cancelar();
});

test("notifica errores emitidos por el listener Firestore", async () => {
  const fallo = Object.assign(new Error("listener fallido"), { code: "failed-precondition" });
  const errores: unknown[] = [];

  const cancelar = suscribirTrasPreparacion<string>(
    async (_emitir, notificarError) => {
      notificarError(fallo);
      return () => undefined;
    },
    () => assert.fail("no debía emitir datos"),
    (error) => errores.push(error),
  );

  await siguienteTarea();

  assert.deepEqual(errores, [fallo]);
  cancelar();
});

test("si se cancela durante la preparación, ignora emisiones y libera el listener tardío", async () => {
  let completarPreparacion!: (cancelar: () => void) => void;
  const datos: string[] = [];
  const errores: unknown[] = [];
  let liberar = 0;

  const cancelar = suscribirTrasPreparacion<string>(
    () => new Promise((resolve) => { completarPreparacion = resolve; }),
    (dato) => datos.push(dato),
    (error) => errores.push(error),
  );

  await siguienteTarea();
  cancelar();
  completarPreparacion(() => { liberar += 1; });
  await siguienteTarea();

  assert.deepEqual(datos, []);
  assert.deepEqual(errores, []);
  assert.equal(liberar, 1);
});
