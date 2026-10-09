export type MotivoCierreSesion = "MANUAL" | "INACTIVIDAD";

export function debeRetirarTokenFcmAlCerrarSesion(motivo: MotivoCierreSesion, preservarTokenPush = false): boolean {
  return motivo !== "INACTIVIDAD" || !preservarTokenPush;
}
