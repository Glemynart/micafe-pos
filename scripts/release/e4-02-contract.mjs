export const E4_02_REQUIRED_CI_COMMANDS = [
  "npm run test:e2e:preflight",
  "npm run test:auth-foundation",
  "npm run test:rules",
  "npm run test:storage-rules",
  "npm run e2e:p0-01",
  "npm run e2e:p0-06",
  "npm run e2e:p1-02",
  "npm run e2e:p1-04",
  "npm run e2e:p0-10",
  "npm run e2e:e4-01",
];

export const E4_02_PENDING_GATES = [
  {
    id: "P0-07/E3.1",
    kind: "EXTERNAL_GATE",
    status: "PENDING_EXTERNAL",
    reason: "Requiere impresora térmica y validación física del canal de caja.",
  },
  {
    id: "P0-08/E3.2",
    kind: "CONDITIONAL_GATE",
    status: "PENDING_EXTERNAL",
    reason: "Depende de la decisión de canal y de la certificación física de impresión.",
  },
  {
    id: "P0-02/E1.2-P0-09",
    kind: "CONDITIONAL_GATE",
    status: "PENDING_EXTERNAL",
    reason: "Requiere información fiscal y decisión de operación FISCAL; no bloquea DEMO.",
  },
  {
    id: "P1-09",
    kind: "CONDITIONAL_GATE",
    status: "PENDING_EXTERNAL",
    reason: "Wompi y reservas públicas requieren decisión y configuración comercial.",
  },
  {
    id: "P2-04",
    kind: "FOLLOW_UP",
    status: "PENDING_EXTERNAL",
    reason: "La operación offline y su reconciliación pertenecen a un alcance posterior.",
  },
  {
    id: "P2-01",
    kind: "FOLLOW_UP",
    status: "PENDING_EXTERNAL",
    reason: "Las notificaciones requieren FCM, permisos y dispositivos reales.",
  },
];

export const E4_02_FOLLOW_UP_IDS = [
  "E4.2-SEC-002-DEPENDENCIES",
  "E4.2-SEC-003-MASTER-PLAN",
  "E4.2-CI-001-UNCOVERED-SURFACES",
];

export function validarContratoE4_02({ ci, gates, followUpIds }) {
  if (!E4_02_REQUIRED_CI_COMMANDS.every((command) => ci.includes(command))) {
    return false;
  }

  const gateIds = gates.map((gate) => gate.id);
  if (gateIds.length !== E4_02_PENDING_GATES.length || new Set(gateIds).size !== gateIds.length) {
    return false;
  }

  return E4_02_FOLLOW_UP_IDS.every((id) => followUpIds.includes(id));
}
