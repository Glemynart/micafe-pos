export {
  autenticarOperativo,
  provisionarCredencialOperativa,
  rotarPinOperativo,
  crearUsuarioConMembresia,
  actualizarMembresia,
} from "./operational-auth";
export {
  restablecerCredencialOperativa,
  restablecerCredencialAdministradorTenantSaas,
  reemitirRestablecimientoCredencialAdministradorTenantSaas,
  activarRestablecimientoCredencial,
} from "./credential-recovery-callables";

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
export {
  aplicarEfectosVentaOperativaV1,
  liquidarCuentaCobroV1,
  cerrarTurnoOperativoV1,
  registrarEgresoOperativoV1,
  registrarMovimientoFinancieroV1,
  trasladarEntreCuentasV1,
} from "./finanzas/callables";
export { registrarCompraOperativaV1 } from "./finanzas/compras";
export {
  crearArticuloInventarioV1,
  actualizarArticuloInventarioV1,
  registrarMermaOperativaV1,
} from "./inventario/callables";
export { crearProveedorOperativoV1, actualizarProveedorOperativoV1, desactivarProveedorOperativoV1 } from "./proveedores/callables";
export { cancelarReservaOperativaV1, completarReservaOperativaV1 } from "./reservas/callables";
export { wompiReservasWebhookV1 } from "./reservas-publicas/wompi";
export {
  crearCuentaSalonV1,
  agregarLineaCuentaSalonV1,
  modificarLineaCuentaSalonV1,
  finalizarAlquilerSalonV1,
  enviarCuentaCocinaV1,
  separarCuentaSalonV1,
  unirCuentasSalonV1,
  trasladarCuentaSalonV1,
  actualizarEstadoComandaSalonV1,
} from "./salon/callables";
export { crearNumeracionFiscal, actualizarNumeracionFiscal, transicionarNumeracionFiscal, establecerAsignacionFiscal, retirarAsignacionFiscal, confirmarVentaFiscalCallable, crearVentaDemostracionV1 } from "./fiscal/callables";
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
  desbloquearAdministradorInicialTenantSaas,
  ejecutarComandoComercialSaas,
  listarRecursosPlataformaSaas,
  obtenerDetalleEmpresaPlataformaSaas,
  obtenerResumenOperadorSaas,
  solicitarSoporteSaas,
  transicionarSoporteSaas,
  listarSoporteTenantSaas,
  consultarAuditoriaPlataformaSaas,
  consultarTenantDusemaSaas,
} from "./platform/callables";

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore } from "firebase-admin/firestore";
import { expirarSoportesVencidos } from "./platform/support";
import { reconciliarClaimsOperadores } from "./platform/initial-bootstrap";
import { reconciliarObligacionesAuditoria } from "./platform/audit";
import { reconciliarVentasPendientes } from "./finanzas/reconciliador";
import { reconciliarVencimientosComerciales } from "./suscripciones/scheduler";

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

export const reconciliarVentasPendientesOperativas = onSchedule(
  { region: "us-central1", schedule: "every 5 minutes", timeZone: "UTC" },
  async () => { await reconciliarVentasPendientes(getFirestore()); },
);

export const reconciliarVencimientosComercialesSaas = onSchedule(
  { region: "us-central1", schedule: "every 15 minutes", timeZone: "UTC" },
  async () => { await reconciliarVencimientosComerciales(getFirestore()); },
);


