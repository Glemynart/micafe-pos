import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import type { FacultadPlataforma } from "./contracts";

export const COMANDOS_COMERCIALES = {
  CrearPlan: "COMERCIAL_GOBERNAR",
  CrearNuevaVersionPlan: "COMERCIAL_GOBERNAR",
  PublicarPlan: "COMERCIAL_GOBERNAR",
  ActualizarBorradorPlan: "COMERCIAL_GOBERNAR",
  RetirarVersionPlan: "COMERCIAL_GOBERNAR",
  CrearSuscripcionActiva: "COMERCIAL_GOBERNAR",
  CrearSuscripcionTrial: "COMERCIAL_GOBERNAR",
  TransicionarSuscripcion: "COMERCIAL_GOBERNAR",
  RenovarSuscripcion: "COMERCIAL_GOBERNAR",
  CambiarPlanSuscripcion: "COMERCIAL_GOBERNAR",
  ProgramarCancelacionSuscripcion: "COMERCIAL_GOBERNAR",
  RevocarCancelacionSuscripcion: "COMERCIAL_GOBERNAR",
  TransicionarEmpresa: "LIFECYCLE_GOBERNAR",
  ActualizarDatosAdministrativosEmpresa: "LIFECYCLE_GOBERNAR",
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

/**
 * `TransicionarEmpresa` reutiliza un único comando y servicio de lifecycle
 * (ADR-SAAS-009) para todo el grafo de `Empresa.estado`, pero ADR-SAAS-011 §3.3 y
 * MT-U9 §B2.7 reservan archivar, restaurar y eliminar a `CONSERVACION_GOBERNAR`,
 * separada de `LIFECYCLE_GOBERNAR` (activar/suspender/cancelar/reactivar). El grafo
 * admisible (`lib/suscripciones/contrato.ts#transicionesEmpresa`) solo puede alcanzar
 * `archivada` desde `cancelada` y `eliminada` desde `archivada`: ambos destinos son
 * conservación sin ambigüedad. `cancelada` es la única excepción, alcanzable tanto
 * por cancelación rutinaria (trial/activa/suspendida) como por restauración desde
 * `archivada`; distinguirlas exige leer el estado actual del agregado antes de
 * autorizar, sin lo cual el nombre del destino no basta.
 */
const DESTINOS_CONSERVACION_INCONDICIONAL = new Set(["archivada", "eliminada"]);

export async function facultadTransicionEmpresa(
  db: Firestore,
  destino: unknown,
  empresaId: unknown,
): Promise<FacultadPlataforma> {
  if (typeof destino !== "string") {
    throw new HttpsError("invalid-argument", "LIFECYCLE_DESTINO_INVALIDO");
  }
  if (DESTINOS_CONSERVACION_INCONDICIONAL.has(destino)) {
    return "CONSERVACION_GOBERNAR";
  }
  if (destino === "cancelada" && typeof empresaId === "string") {
    const snap = await db.collection("empresas").doc(empresaId).get();
    if (snap.exists && snap.data()?.estado === "archivada") {
      return "CONSERVACION_GOBERNAR";
    }
  }
  return "LIFECYCLE_GOBERNAR";
}
