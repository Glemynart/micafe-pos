export {
  autenticarOperativo,
  provisionarCredencialOperativa,
  rotarPinOperativo,
  crearUsuarioConMembresia,
  actualizarMembresia,
} from "./operational-auth";

export {
  crearIncorporacionDirecta,
  activarIncorporacionDirecta,
  crearIncorporacionEmail,
  reenviarIncorporacionEmail,
  cancelarIncorporacionEmail,
  aceptarIncorporacionEmail,
} from "./incorporaciones";
export { actualizarConfiguracionEmpresa, actualizarParametrosFiscales, actualizarPreferenciasImpresion, actualizarPoliticasOperativas, obtenerConfiguracionEmpresa } from "./configuracion/callables";
export { abrirTurnoOperativoV1 } from "./turnos/callable";
export { anularVentaOperativaV1 } from "./finanzas/anulaciones";
export { crearNumeracionFiscal, actualizarNumeracionFiscal, transicionarNumeracionFiscal, establecerAsignacionFiscal, retirarAsignacionFiscal, confirmarVentaFiscalCallable } from "./fiscal/callables";
export { bootstrapEmpresarialCallable } from "./bootstrap/callables";
export { obtenerEstadoOnboarding, completarPasoFiscalOnboardingCallable, completarPasoNumeracionOnboardingCallable } from "./onboarding/callables";
export {
  consultarContextoPlataforma,
  incorporarOperadorSaas,
  cambiarFacultadesOperadorSaas,
  suspenderOperadorSaas,
  reactivarOperadorSaas,
  revocarOperadorSaas,
  solicitarBootstrapEmpresarialSaas,
  provisionarCredencialInicialTenantSaas,
  reemitirCredencialInicialTemporalSaas,
  ejecutarComandoComercialSaas,
  listarRecursosPlataformaSaas,
  obtenerDetalleEmpresaPlataformaSaas,
  solicitarSoporteSaas,
  transicionarSoporteSaas,
  listarSoporteTenantSaas,
  consultarAuditoriaPlataformaSaas,
} from "./platform/callables";

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { expirarSoportesVencidos } from "./platform/support";
import { reconciliarClaimsOperadores } from "./platform/initial-bootstrap";
import { reconciliarObligacionesAuditoria } from "./platform/audit";

export const expirarSoportesSaas = onSchedule(
  { region: "us-central1", schedule: "every 5 minutes", timeZone: "UTC" },
  async () => { await expirarSoportesVencidos(getFirestore()); },
);

export const reconciliarClaimsOperadoresSaas = onSchedule(
  { region: "us-central1", schedule: "every 10 minutes", timeZone: "UTC" },
  async () => { await reconciliarClaimsOperadores(getFirestore()); },
);

export const reconciliarAuditoriaPlataformaSaas = onSchedule(
  { region: "us-central1", schedule: "every 5 minutes", timeZone: "UTC" },
  async () => { await reconciliarObligacionesAuditoria(getFirestore()); },
);


