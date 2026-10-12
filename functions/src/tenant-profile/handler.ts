import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { ErrorOperacionConfiguracion, perfilComercialCompleto, type OperacionConfiguracion } from "../../../lib/configuracion";
import { esTextoCanonico } from "../../../lib/configuracion/normalizacion";
import {
  ejecutarComandoConfiguracionConEstadoPreleidoEnTransaccion,
  leerComandoConfiguracionEnTransaccion,
  referenciasComandoConfiguracion,
  type ContextoComandoConfiguracion,
  type EntradaComandoConfiguracion,
} from "../configuracion/service";
import { leerConfiguracionEmpresa } from "../configuracion/reader";
import { exigirTenantActivo } from "../tenant-configuration/authority";

type Request = { auth?: { uid: string; token: Record<string, unknown> }; data?: unknown };
type TenantReader = typeof exigirTenantActivo;
type ConfigurationReader = typeof leerConfiguracionEmpresa;
type Dependencies = { db?: Firestore; exigirTenant?: TenantReader; leerConfiguracion?: ConfigurationReader };

interface PerfilComercialBodega {
  nombreComercial: string;
  razonSocial: string;
  tipoPersona: "NATURAL" | "JURIDICA";
  nit: string;
  digitoVerificacion: string;
  email: string;
  telefono: string;
  direccion: string;
  departamentoCodigo: string;
  departamentoNombre: string;
  municipioCodigo: string;
  municipioNombre: string;
  expectedRevision: number;
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
}

function fail(code: HttpsError["code"], message: string): never { throw new HttpsError(code, message); }
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value); }

function leerPerfil(data: unknown): PerfilComercialBodega {
  if (!record(data)) fail("invalid-argument", "PERFIL_COMERCIAL_INVALIDO");
  const allowed = new Set([
    "empresaId", "nombreComercial", "razonSocial", "tipoPersona", "nit", "digitoVerificacion", "email", "telefono",
    "direccion", "departamentoCodigo", "departamentoNombre", "municipioCodigo", "municipioNombre",
    "expectedRevision", "commandId", "idempotencyKey", "correlationId",
  ]);
  if (Object.keys(data).some((key) => !allowed.has(key))) fail("invalid-argument", "PERFIL_COMERCIAL_INVALIDO");
  const limites = {
    nombreComercial: 120,
    razonSocial: 240,
    nit: 15,
    digitoVerificacion: 1,
    email: 254,
    telefono: 20,
    direccion: 120,
    departamentoCodigo: 2,
    departamentoNombre: 100,
    municipioCodigo: 5,
    municipioNombre: 100,
  } as const;
  const keys = Object.keys(limites) as (keyof typeof limites)[];
  if (keys.some((key) => !esTextoCanonico(data[key], 1, limites[key])) || (data.tipoPersona !== "NATURAL" && data.tipoPersona !== "JURIDICA")) fail("invalid-argument", "PERFIL_COMERCIAL_INVALIDO");
  if (!Number.isInteger(data.expectedRevision) || (data.expectedRevision as number) < 1 || !id(data.commandId) || !id(data.idempotencyKey) || !id(data.correlationId)) fail("invalid-argument", "ENVELOPE_INVALIDO");
  return data as unknown as PerfilComercialBodega;
}

function operaciones(perfil: PerfilComercialBodega): OperacionConfiguracion[] {
  return [
    { tipo: "SET", ruta: "identidadFiscal.nombreComercial", valor: perfil.nombreComercial },
    { tipo: "SET", ruta: "identidadFiscal.razonSocial", valor: perfil.razonSocial },
    { tipo: "SET", ruta: "identidadFiscal.tipoPersona", valor: perfil.tipoPersona },
    { tipo: "SET", ruta: "identidadFiscal.tipoDocumento", valor: "NIT" },
    { tipo: "SET", ruta: "identidadFiscal.numeroDocumento", valor: perfil.nit },
    { tipo: "SET", ruta: "identidadFiscal.digitoVerificacion", valor: perfil.digitoVerificacion },
    { tipo: "SET", ruta: "identidadFiscal.contacto.email", valor: perfil.email },
    { tipo: "SET", ruta: "identidadFiscal.contacto.telefono", valor: perfil.telefono },
    { tipo: "SET", ruta: "localizacion.direccion.linea1", valor: perfil.direccion },
    { tipo: "SET", ruta: "localizacion.direccion.departamentoCodigo", valor: perfil.departamentoCodigo },
    { tipo: "SET", ruta: "localizacion.direccion.departamentoNombre", valor: perfil.departamentoNombre },
    { tipo: "SET", ruta: "localizacion.direccion.municipioCodigo", valor: perfil.municipioCodigo },
    { tipo: "SET", ruta: "localizacion.direccion.municipioNombre", valor: perfil.municipioNombre },
  ];
}

/** Guarda el perfil comercial de primer acceso sin completar ni habilitar requisitos fiscales. */
export async function ejecutarRegistrarPerfilComercialBodegaV1(request: Request, dependencies: Dependencies = {}) {
  if (!request.auth) fail("unauthenticated", "Autenticación requerida.");
  const perfil = leerPerfil(request.data);
  const db = dependencies.db ?? getFirestore();
  const tenant = await (dependencies.exigirTenant ?? exigirTenantActivo)(request, db);
  if (tenant.rol !== "admin") fail("permission-denied", "Acceso denegado.");

  const configuracion = await (dependencies.leerConfiguracion ?? leerConfiguracionEmpresa)(db, tenant.id);
  if (configuracion.vertical !== "BODEGA_MVP1") fail("permission-denied", "Acceso denegado.");

  const entrada: EntradaComandoConfiguracion = {
    comando: "ActualizarConfiguracionEmpresa",
    expectedRevision: perfil.expectedRevision,
    idempotencyKey: `perfil-bodega-${perfil.idempotencyKey}`,
    commandId: `perfil-bodega-${perfil.commandId}`,
    correlationId: perfil.correlationId,
    motivo: "PERFIL_COMERCIAL_PRIMER_ACCESO_BODEGA",
    operaciones: operaciones(perfil),
  };
  const contexto: ContextoComandoConfiguracion = {
    empresaId: tenant.id,
    actorId: request.auth.uid,
    origen: "ADMIN",
    paisFiscal: configuracion.localizacion.paisFiscal,
  };
  const refs = referenciasComandoConfiguracion(db, entrada, contexto);

  return db.runTransaction(async (tx) => {
    const lecturas = await leerComandoConfiguracionEnTransaccion(tx, entrada, refs);
    if (!lecturas.configSnap.exists || !lecturas.empresaSnap.exists) fail("failed-precondition", "PERFIL_COMERCIAL_NO_DISPONIBLE");
    const actual = lecturas.configSnap.data() as import("../../../lib/configuracion").ConfiguracionEmpresa;
    if (actual.vertical !== "BODEGA_MVP1") fail("permission-denied", "Acceso denegado.");

    let resultado;
    try {
      resultado = ejecutarComandoConfiguracionConEstadoPreleidoEnTransaccion(db, tx, entrada, contexto, refs, lecturas);
    } catch (error) {
      if (error instanceof ErrorOperacionConfiguracion) fail("invalid-argument", "PERFIL_COMERCIAL_INVALIDO");
      throw error;
    }
    if (resultado.idempotente) return { revision: resultado.revision, idempotente: true };
    if (perfilComercialCompleto(actual)) fail("failed-precondition", "PERFIL_COMERCIAL_YA_COMPLETO");

    const empresa = lecturas.empresaSnap.data() as Record<string, unknown>;
    if (!Number.isInteger(empresa.revision) || (empresa.revision as number) < 1) fail("failed-precondition", "EMPRESA_REVISION_INVALIDA");
    tx.update(refs.empresaRef, {
      nombre: perfil.nombreComercial,
      nombreComercial: perfil.nombreComercial,
      revision: (empresa.revision as number) + 1,
      actualizadaEn: FieldValue.serverTimestamp(),
    });
    return { revision: resultado.revision, idempotente: false };
  });
}
