import { randomUUID } from "node:crypto";
import { defineSecret, defineString } from "firebase-functions/params";
import { importPKCS8, SignJWT } from "jose";

export const DUSEMA_S2S_SCOPE = "DUSEMA_TENANT_READ" as const;
export const DUSEMA_S2S_SUBJECT = "pos-platform" as const;
export const DUSEMA_S2S_TTL_SECONDS = 60;
export const DUSEMA_S2S_TIMEOUT_MS = 5_000;

const DUSEMA_ADMIN_BASE_URL_PARAM = defineString("DUSEMA_ADMIN_BASE_URL");
const DUSEMA_S2S_ISSUER_PARAM = defineString("DUSEMA_S2S_ISSUER");
const DUSEMA_S2S_AUDIENCE_PARAM = defineString("DUSEMA_S2S_AUDIENCE");
const DUSEMA_S2S_KID_PARAM = defineString("DUSEMA_S2S_KID");
export const DUSEMA_S2S_PRIVATE_KEY_PARAM = defineSecret("DUSEMA_S2S_PRIVATE_KEY");

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type DusemaS2sErrorCode =
  | "DUSEMA_CONFIG_INVALIDA"
  | "DUSEMA_CONTEXT_INVALIDO"
  | "DUSEMA_TENANT_ID_INVALIDO"
  | "DUSEMA_TIMEOUT"
  | "DUSEMA_UNAVAILABLE"
  | "DUSEMA_UNAUTHORIZED"
  | "DUSEMA_FORBIDDEN"
  | "DUSEMA_TENANT_NOT_FOUND"
  | "DUSEMA_UPSTREAM_REJECTED"
  | "DUSEMA_RESPONSE_INVALIDA";

export class DusemaS2sError extends Error {
  constructor(readonly code: DusemaS2sErrorCode) {
    super(code);
    this.name = "DusemaS2sError";
  }
}

export interface DusemaS2sConfig {
  baseUrl: string;
  issuer: string;
  audience: string;
  kid: string;
  privateKeyPem: string;
  timeoutMs: number;
}

export interface DusemaS2sContext {
  actorUid: string;
  empresaPosId: string;
  correlationId: string;
}

export interface DusemaTenantMetadata {
  id: string;
  nombre: string;
  razonSocial: string | null;
  nit: string | null;
  activo: boolean;
  plan: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface DusemaFetchInit {
  method: "GET";
  headers: Record<string, string>;
  redirect: "error";
  signal: AbortSignal;
}

export interface DusemaFetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type DusemaFetch = (url: string, init: DusemaFetchInit) => Promise<DusemaFetchResponse>;

export interface DusemaS2sClientDependencies {
  fetch?: DusemaFetch;
  now?: () => number;
}

function requiredText(value: unknown): string {
  if (typeof value !== "string") throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");
  }
  return trimmed;
}

function normalizeBaseUrl(value: unknown): string {
  const raw = requiredText(value);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");
  }
  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname ? `${pathname}/` : "/"}`;
}

function normalizePrivateKey(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 16_384) {
    throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");
  }
  return value.replace(/\\n/g, "\n").replace(/\\r/g, "\r").trim();
}

export function validarConfiguracionDusemaS2s(value: unknown): DusemaS2sConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");
  }
  const config = value as Record<string, unknown>;
  const timeoutMs = config.timeoutMs;
  if (typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");
  }
  return {
    baseUrl: normalizeBaseUrl(config.baseUrl),
    issuer: requiredText(config.issuer),
    audience: requiredText(config.audience),
    kid: requiredText(config.kid),
    privateKeyPem: normalizePrivateKey(config.privateKeyPem),
    timeoutMs,
  };
}

export function cargarConfiguracionDusemaS2s(): DusemaS2sConfig {
  try {
    return validarConfiguracionDusemaS2s({
      baseUrl: DUSEMA_ADMIN_BASE_URL_PARAM.value(),
      issuer: DUSEMA_S2S_ISSUER_PARAM.value(),
      audience: DUSEMA_S2S_AUDIENCE_PARAM.value(),
      kid: DUSEMA_S2S_KID_PARAM.value(),
      privateKeyPem: DUSEMA_S2S_PRIVATE_KEY_PARAM.value(),
      timeoutMs: DUSEMA_S2S_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof DusemaS2sError) throw error;
    throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");
  }
}

function validarId(value: unknown, code: DusemaS2sErrorCode): string {
  if (typeof value !== "string" || !ID.test(value)) throw new DusemaS2sError(code);
  return value;
}

function validarContexto(context: unknown): DusemaS2sContext {
  if (!context || typeof context !== "object" || Array.isArray(context)) {
    throw new DusemaS2sError("DUSEMA_CONTEXT_INVALIDO");
  }
  const value = context as Record<string, unknown>;
  return {
    actorUid: validarId(value.actorUid, "DUSEMA_CONTEXT_INVALIDO"),
    empresaPosId: validarId(value.empresaPosId, "DUSEMA_CONTEXT_INVALIDO"),
    correlationId: validarId(value.correlationId, "DUSEMA_CONTEXT_INVALIDO"),
  };
}

export async function emitirJwtDusema(
  config: DusemaS2sConfig,
  contextInput: DusemaS2sContext,
  now = Math.floor(Date.now() / 1000),
): Promise<string> {
  const configValidada = validarConfiguracionDusemaS2s(config);
  const context = validarContexto(contextInput);
  if (!Number.isSafeInteger(now) || now <= 0) throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");

  try {
    const privateKey = await importPKCS8(configValidada.privateKeyPem, "RS256");
    return await new SignJWT({
      scope: DUSEMA_S2S_SCOPE,
      actorUid: context.actorUid,
      empresaPosId: context.empresaPosId,
      correlationId: context.correlationId,
    })
      .setProtectedHeader({ alg: "RS256", kid: configValidada.kid, typ: "JWT" })
      .setIssuer(configValidada.issuer)
      .setAudience(configValidada.audience)
      .setSubject(DUSEMA_S2S_SUBJECT)
      .setJti(randomUUID())
      .setIssuedAt(now)
      .setExpirationTime(now + DUSEMA_S2S_TTL_SECONDS)
      .sign(privateKey);
  } catch (error) {
    if (error instanceof DusemaS2sError) throw error;
    throw new DusemaS2sError("DUSEMA_CONFIG_INVALIDA");
  }
}

function esRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textoOpcional(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function proyectarTenantDusema(value: unknown): DusemaTenantMetadata {
  if (!esRecord(value)
    || typeof value.id !== "string"
    || typeof value.nombre !== "string"
    || !textoOpcional(value.razonSocial)
    || !textoOpcional(value.nit)
    || typeof value.activo !== "boolean"
    || !Object.prototype.hasOwnProperty.call(value, "plan")
    || typeof value.createdAt !== "string"
    || typeof value.updatedAt !== "string") {
    throw new DusemaS2sError("DUSEMA_RESPONSE_INVALIDA");
  }
  return {
    id: value.id,
    nombre: value.nombre,
    razonSocial: value.razonSocial,
    nit: value.nit,
    activo: value.activo,
    plan: value.plan,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function urlTenant(baseUrl: string, tenantId: string): string {
  return new URL(`platform/admin/v1/tenants/${encodeURIComponent(tenantId)}`, baseUrl).toString();
}

function normalizarErrorHttp(status: number): DusemaS2sError {
  if (status === 401) return new DusemaS2sError("DUSEMA_UNAUTHORIZED");
  if (status === 403) return new DusemaS2sError("DUSEMA_FORBIDDEN");
  if (status === 404) return new DusemaS2sError("DUSEMA_TENANT_NOT_FOUND");
  if (status === 408 || status === 429 || status >= 500) return new DusemaS2sError("DUSEMA_UNAVAILABLE");
  return new DusemaS2sError("DUSEMA_UPSTREAM_REJECTED");
}

export function createDusemaS2sClient(
  configInput: DusemaS2sConfig,
  dependencies: DusemaS2sClientDependencies = {},
) {
  const config = validarConfiguracionDusemaS2s(configInput);
  const fetcher = dependencies.fetch ?? (globalThis.fetch as unknown as DusemaFetch);
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));

  return {
    async getTenant(tenantIdInput: unknown, contextInput: unknown): Promise<DusemaTenantMetadata> {
      const tenantId = validarId(tenantIdInput, "DUSEMA_TENANT_ID_INVALIDO");
      const context = validarContexto(contextInput);
      const token = await emitirJwtDusema(config, context, now());
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const response = await fetcher(urlTenant(config.baseUrl, tenantId), {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
            "X-Correlation-Id": context.correlationId,
          },
          redirect: "error",
          signal: controller.signal,
        });
        if (!response.ok) throw normalizarErrorHttp(response.status);
        return proyectarTenantDusema(await response.json());
      } catch (error) {
        if (error instanceof DusemaS2sError) throw error;
        if (controller.signal.aborted) throw new DusemaS2sError("DUSEMA_TIMEOUT");
        throw new DusemaS2sError("DUSEMA_UNAVAILABLE");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export function createConfiguredDusemaS2sClient(dependencies: DusemaS2sClientDependencies = {}) {
  return createDusemaS2sClient(cargarConfiguracionDusemaS2s(), dependencies);
}
