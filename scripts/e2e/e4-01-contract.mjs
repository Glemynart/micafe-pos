export const E4_01_STEP_DEFINITIONS = Object.freeze([
  Object.freeze({ id: "P0-01", runner: "scripts/e2e/p0-01-runner.mjs", projectPrefix: "demo-p0-01-" }),
  Object.freeze({ id: "P0-06", runner: "scripts/e2e/p0-06-runner.mjs", projectPrefix: "demo-p0-06-" }),
  Object.freeze({ id: "P1-02", runner: "scripts/e2e/p1-02-runner.mjs", projectPrefix: "demo-p1-02-" }),
  Object.freeze({ id: "P1-04", runner: "scripts/e2e/p1-04-runner.mjs", projectPrefix: "demo-p1-04-" }),
  Object.freeze({ id: "P0-10", runner: "scripts/e2e/p0-10-runner.mjs", projectPrefix: "demo-p0-10-" }),
]);

export const E4_01_PENDING_GATES = Object.freeze([
  Object.freeze({
    id: "P0-07/E3.1",
    type: "EXTERNAL_GATE",
    status: "PENDIENTE",
    description: "Impresión física requiere impresora térmica y canal de caja acordado.",
  }),
  Object.freeze({
    id: "P0-08/E3.2",
    type: "EXTERNAL_GATE",
    status: "PENDIENTE",
    description: "Distribución Electron solo aplica si se selecciona ese canal.",
  }),
  Object.freeze({
    id: "P0-02/E1.2-P0-09",
    type: "EXTERNAL_GATE",
    status: "PENDIENTE",
    description: "DIAN y operación FISCAL requieren datos fiscales y decisión del tenant.",
  }),
  Object.freeze({
    id: "P1-09",
    type: "EXTERNAL_GATE",
    status: "PENDIENTE",
    description: "Wompi y reservas públicas requieren decisión comercial y configuración externa.",
  }),
  Object.freeze({
    id: "P2-04",
    type: "EXTERNAL_GATE",
    status: "PENDIENTE",
    description: "Offline y reconciliación requieren pruebas de conectividad y decisión posterior.",
  }),
  Object.freeze({
    id: "P2-01",
    type: "EXTERNAL_GATE",
    status: "PENDIENTE",
    description: "Notificaciones requieren VAPID, permisos y dispositivos de prueba.",
  }),
]);

export function validarProyectoEmulador(projectId, prefix) {
  return typeof projectId === "string"
    && projectId.startsWith(prefix)
    && /^[a-z0-9-]+$/.test(projectId);
}

export function validarContratoE4_01() {
  const ids = E4_01_STEP_DEFINITIONS.map((step) => step.id);
  const gates = E4_01_PENDING_GATES.map((gate) => gate.id);
  return ids.length === new Set(ids).size
    && ids.length === 5
    && gates.length === new Set(gates).size
    && gates.length === 6
    && E4_01_PENDING_GATES.every((gate) => gate.type === "EXTERNAL_GATE" && gate.status === "PENDIENTE");
}
