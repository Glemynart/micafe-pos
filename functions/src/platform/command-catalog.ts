import { HttpsError } from "firebase-functions/v2/https";
import type { FacultadPlataforma } from "./contracts";

export const COMANDOS_COMERCIALES = {
  CrearPlan: "COMERCIAL_GOBERNAR",
  CrearNuevaVersionPlan: "COMERCIAL_GOBERNAR",
  PublicarPlan: "COMERCIAL_GOBERNAR",
  ActualizarBorradorPlan: "COMERCIAL_GOBERNAR",
  RetirarVersionPlan: "COMERCIAL_GOBERNAR",
  CrearSuscripcionActiva: "COMERCIAL_GOBERNAR",
  TransicionarSuscripcion: "COMERCIAL_GOBERNAR",
  RenovarSuscripcion: "COMERCIAL_GOBERNAR",
  CambiarPlanSuscripcion: "COMERCIAL_GOBERNAR",
  ProgramarCancelacionSuscripcion: "COMERCIAL_GOBERNAR",
  RevocarCancelacionSuscripcion: "COMERCIAL_GOBERNAR",
  TransicionarEmpresa: "LIFECYCLE_GOBERNAR",
} as const satisfies Record<string, FacultadPlataforma>;

export type TipoComandoComercial = keyof typeof COMANDOS_COMERCIALES;

export function obtenerComandoComercial(value: unknown): {
  tipo: TipoComandoComercial;
  facultad: FacultadPlataforma;
} {
  if (typeof value !== "string" || !(value in COMANDOS_COMERCIALES)) {
    throw new HttpsError("invalid-argument", "COMANDO_PLATAFORMA_INVALIDO");
  }
  const tipo = value as TipoComandoComercial;
  return { tipo, facultad: COMANDOS_COMERCIALES[tipo] };
}
