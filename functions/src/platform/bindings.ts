import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { exigirId } from "./validation";

export const PLATFORM_BINDINGS_COLLECTION = "saas_platform_bindings";
export const DUSEMA_PRODUCT_CODE = "DUSEMA" as const;
export const DUSEMA_BINDING_ACTIVE_STATE = "ACTIVO" as const;

export type BindingEnvironment = "staging" | "production";
export type PlatformBindingState = "ACTIVO" | "SUSPENDIDO" | "REVOCADO";

export interface DusemaPlatformBinding {
  schemaVersion: 1;
  productCode: typeof DUSEMA_PRODUCT_CODE;
  environment: BindingEnvironment;
  empresaPosId: string;
  externalTenantId: string;
  estado: PlatformBindingState;
  creadoPor: string;
  creadoEn: unknown;
  actualizadoPor: string;
  actualizadoEn: unknown;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function esId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

export function esEnvironment(value: unknown): value is BindingEnvironment {
  return value === "staging" || value === "production";
}

function exigirEnvironment(value: unknown): BindingEnvironment {
  if (!esEnvironment(value)) {
    throw new HttpsError("invalid-argument", "BINDING_ENVIRONMENT_INVALIDO");
  }
  return value;
}

export function idBindingDusema(environment: BindingEnvironment, empresaPosId: string): string {
  return `${environment}:${DUSEMA_PRODUCT_CODE}:${empresaPosId}`;
}

function inconsistente(codigo = "BINDING_INCONSISTENTE"): never {
  throw new HttpsError("failed-precondition", codigo);
}

function validarFechaPersistida(value: unknown): boolean {
  return value !== undefined && value !== null;
}

/** Valida la forma y la coherencia canónica de un documento de binding. */
export function validarBindingDusema(
  value: unknown,
  expected: { environment: BindingEnvironment; empresaPosId: string },
  actualDocumentId?: string,
): DusemaPlatformBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return inconsistente();
  const data = value as Record<string, unknown>;
  if (data.schemaVersion !== 1) return inconsistente("BINDING_SCHEMA_INVALIDO");
  if (data.productCode !== DUSEMA_PRODUCT_CODE) return inconsistente("BINDING_PRODUCTO_INVALIDO");
  if (!esEnvironment(data.environment)) return inconsistente("BINDING_ENVIRONMENT_INVALIDO");
  if (data.environment !== expected.environment) return inconsistente("BINDING_ENVIRONMENT_INCONSISTENTE");
  if (!esId(data.empresaPosId)) return inconsistente("BINDING_EMPRESA_POS_ID_INVALIDO");
  if (data.empresaPosId !== expected.empresaPosId) return inconsistente("BINDING_EMPRESA_INCONSISTENTE");
  if (!esId(data.externalTenantId)) return inconsistente("BINDING_EXTERNAL_TENANT_ID_INVALIDO");
  if (data.estado !== "ACTIVO" && data.estado !== "SUSPENDIDO" && data.estado !== "REVOCADO") {
    return inconsistente("BINDING_ESTADO_INVALIDO");
  }
  if (!esId(data.creadoPor) || !validarFechaPersistida(data.creadoEn)) {
    return inconsistente("BINDING_AUDITORIA_CREACION_INVALIDA");
  }
  if (!esId(data.actualizadoPor) || !validarFechaPersistida(data.actualizadoEn)) {
    return inconsistente("BINDING_AUDITORIA_ACTUALIZACION_INVALIDA");
  }
  const binding: DusemaPlatformBinding = {
    schemaVersion: 1,
    productCode: DUSEMA_PRODUCT_CODE,
    environment: data.environment,
    empresaPosId: data.empresaPosId,
    externalTenantId: data.externalTenantId,
    estado: data.estado,
    creadoPor: data.creadoPor,
    creadoEn: data.creadoEn,
    actualizadoPor: data.actualizadoPor,
    actualizadoEn: data.actualizadoEn,
  };
  if (actualDocumentId !== undefined && actualDocumentId !== idBindingDusema(expected.environment, expected.empresaPosId)) {
    return inconsistente("BINDING_ID_DETERMINISTA_INVALIDO");
  }
  return binding;
}

function esActivoParaClave(
  value: unknown,
  environment: BindingEnvironment,
  field: "empresaPosId" | "externalTenantId",
  expectedValue: string,
): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return data.productCode === DUSEMA_PRODUCT_CODE
    && data.environment === environment
    && data.estado === DUSEMA_BINDING_ACTIVE_STATE
    && data[field] === expectedValue;
}

async function bindingsByField(
  db: Firestore,
  field: "empresaPosId" | "externalTenantId",
  value: string,
) {
  // One equality filter uses Firestore automatic indexes; primary resolution
  // remains the deterministic document ID and needs no composite index.
  return db.collection(PLATFORM_BINDINGS_COLLECTION).where(field, "==", value).get();
}

/** Resolves a Dusema binding exclusively in the POS backend. */
export async function resolverBindingDusema(
  db: Firestore,
  empresaPosIdInput: unknown,
  environmentInput: unknown,
): Promise<DusemaPlatformBinding | null> {
  const empresaPosId = exigirId(empresaPosIdInput, "EMPRESA_POS_ID_INVALIDO");
  const environment = exigirEnvironment(environmentInput);

  const empresaSnap = await db.collection("empresas").doc(empresaPosId).get();
  if (!empresaSnap.exists) throw new HttpsError("not-found", "EMPRESA_NOT_FOUND");

  const documentId = idBindingDusema(environment, empresaPosId);
  const bindingSnap = await db.collection(PLATFORM_BINDINGS_COLLECTION).doc(documentId).get();
  const empresaBindingsSnap = await bindingsByField(db, "empresaPosId", empresaPosId);
  const activosEmpresa = empresaBindingsSnap.docs.filter((doc) =>
    esActivoParaClave(doc.data(), environment, "empresaPosId", empresaPosId));

  if (!bindingSnap.exists) {
    if (activosEmpresa.length > 0) return inconsistente("BINDING_ID_DETERMINISTA_AUSENTE");
    return null;
  }

  const binding = validarBindingDusema(bindingSnap.data(), { environment, empresaPosId }, bindingSnap.id);
  if (binding.estado !== DUSEMA_BINDING_ACTIVE_STATE) {
    throw new HttpsError("failed-precondition", "BINDING_NO_ACTIVO");
  }
  if (activosEmpresa.length !== 1 || activosEmpresa[0]?.id !== documentId) {
    return inconsistente("BINDING_CARDINALIDAD_EMPRESA_INVALIDA");
  }

  const tenantBindingsSnap = await bindingsByField(db, "externalTenantId", binding.externalTenantId);
  const activosTenant = tenantBindingsSnap.docs.filter((doc) =>
    esActivoParaClave(doc.data(), environment, "externalTenantId", binding.externalTenantId));
  if (activosTenant.length !== 1 || activosTenant[0]?.id !== documentId) {
    return inconsistente("BINDING_CARDINALIDAD_TENANT_INVALIDA");
  }

  return binding;
}
