import { esTextoCanonico, normalizarTexto } from "@/lib/configuracion/normalizacion";

export const ABRIR_TURNO_OPERATIVO_V1 = "abrirTurnoOperativoV1" as const;
const PREFIJO = "r1a:abrirTurnoOperativoV1";
const TTL_MS = 15 * 60 * 1000;
const MAX_REINTENTOS = 2;

export interface PayloadAbrirTurnoOperativo {
  baseApertura: number;
  notasApertura: string;
}

export interface EnvelopeAbrirTurnoOperativo {
  commandId: string;
  idempotencyKey: string;
  correlationId: string;
  causationId: null;
  motivo: null;
  payload: PayloadAbrirTurnoOperativo;
}

export interface ResultadoAbrirTurnoOperativo {
  commandId: string;
  turnoId: string;
  cajeroId: string;
  estado: "abierto";
  correlationId: string;
}

export type CodigoErrorAperturaCliente =
  | "AUTH_REQUIRED"
  | "TENANT_ACCESS_DENIED"
  | "ROLE_FORBIDDEN"
  | "EMPRESA_NO_OPERATIVA"
  | "PAYLOAD_INVALID"
  | "LOCK_CONFLICT"
  | "ABORTED"
  | "COMMAND_ID_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "OPERATION_TOO_LARGE"
  | "UNAVAILABLE"
  | "CLIENT_STORAGE_UNAVAILABLE";

export class ErrorAperturaTurnoCliente extends Error {
  constructor(readonly code: CodigoErrorAperturaCliente) {
    super(code);
    this.name = "ErrorAperturaTurnoCliente";
  }
}

export interface ContextoAperturaPendiente {
  uid: string;
  empresaId: string;
}

export interface EntradaAperturaPendiente {
  baseApertura: number;
  notasApertura?: string;
}

export interface StorageAperturaPendiente {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): readonly string[];
}

export interface LocksAperturaPendiente {
  request<T>(name: string, options: { mode: "exclusive" }, callback: () => Promise<T>): Promise<T>;
}

export interface AdaptadoresAperturaPendiente {
  storage: StorageAperturaPendiente | null;
  locks: LocksAperturaPendiente | null;
  now: () => number;
  generarId: () => string;
  dormir: (ms: number) => Promise<void>;
}

interface RegistroPendiente extends EnvelopeAbrirTurnoOperativo {
  uid: string;
  empresaId: string;
  createdAt: number;
  updatedAt: number;
  retryCount: number;
}

interface IndicePendiente {
  commandId: string;
  createdAt: number;
}

const CODIGOS_DOMINIO = new Set<CodigoErrorAperturaCliente>([
  "AUTH_REQUIRED", "TENANT_ACCESS_DENIED", "ROLE_FORBIDDEN", "EMPRESA_NO_OPERATIVA", "PAYLOAD_INVALID",
  "LOCK_CONFLICT", "ABORTED", "COMMAND_ID_CONFLICT", "IDEMPOTENCY_CONFLICT", "OPERATION_TOO_LARGE", "UNAVAILABLE",
]);

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return !!valor && typeof valor === "object" && !Array.isArray(valor);
}

function tieneSoloClaves(valor: Record<string, unknown>, claves: readonly string[]): boolean {
  const actuales = Object.keys(valor).sort();
  return actuales.length === claves.length && actuales.every((clave, indice) => clave === [...claves].sort()[indice]);
}

function esId(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

export function normalizarPayloadApertura(entrada: EntradaAperturaPendiente): PayloadAbrirTurnoOperativo {
  if (!Number.isSafeInteger(entrada.baseApertura) || entrada.baseApertura < 0) {
    throw new ErrorAperturaTurnoCliente("PAYLOAD_INVALID");
  }
  if (entrada.notasApertura !== undefined && typeof entrada.notasApertura !== "string") {
    throw new ErrorAperturaTurnoCliente("PAYLOAD_INVALID");
  }
  const notasApertura = normalizarTexto(entrada.notasApertura ?? "");
  if (!esTextoCanonico(notasApertura, 0, 240)
    || /<\/?[a-z][^>]*>/i.test(notasApertura)
    || /(?:api[_-]?key|token|secret|password|credential|authorization)\s*[:=]/i.test(notasApertura)) {
    throw new ErrorAperturaTurnoCliente("PAYLOAD_INVALID");
  }
  return { baseApertura: entrada.baseApertura, notasApertura };
}

function nombreRegistro(contexto: ContextoAperturaPendiente, commandId: string): string {
  return `${PREFIJO}:${contexto.uid}:${contexto.empresaId}:${commandId}`;
}

function nombreIndice(contexto: ContextoAperturaPendiente): string {
  return `${PREFIJO}:index:${contexto.uid}:${contexto.empresaId}`;
}

function nombreBloqueo(contexto: ContextoAperturaPendiente): string {
  return `${PREFIJO}:${contexto.uid}:${contexto.empresaId}`;
}

function validarRegistro(valor: unknown, contexto: ContextoAperturaPendiente, ahora: number): valor is RegistroPendiente {
  if (!esObjeto(valor) || !tieneSoloClaves(valor, ["commandId", "idempotencyKey", "correlationId", "causationId", "motivo", "payload", "uid", "empresaId", "createdAt", "updatedAt", "retryCount"])) return false;
  if (!esId(valor.commandId) || !esId(valor.idempotencyKey) || !esId(valor.correlationId) || valor.causationId !== null || valor.motivo !== null) return false;
  const createdAt = valor.createdAt;
  const updatedAt = valor.updatedAt;
  const retryCount = valor.retryCount;
  if (valor.uid !== contexto.uid || valor.empresaId !== contexto.empresaId || typeof createdAt !== "number" || typeof updatedAt !== "number" || typeof retryCount !== "number" || !Number.isSafeInteger(createdAt) || !Number.isSafeInteger(updatedAt) || !Number.isSafeInteger(retryCount) || retryCount < 0 || createdAt > ahora || ahora - createdAt > TTL_MS) return false;
  try {
    const payload = normalizarPayloadApertura(valor.payload as EntradaAperturaPendiente);
    return payload.baseApertura === (valor.payload as Record<string, unknown>).baseApertura
      && payload.notasApertura === (valor.payload as Record<string, unknown>).notasApertura;
  } catch {
    return false;
  }
}

function validarIndice(valor: unknown): valor is IndicePendiente {
  return esObjeto(valor)
    && tieneSoloClaves(valor, ["commandId", "createdAt"])
    && esId(valor.commandId)
    && Number.isSafeInteger(valor.createdAt);
}

function eliminarContexto(storage: StorageAperturaPendiente, contexto: ContextoAperturaPendiente): void {
  const prefijoContexto = `${PREFIJO}:${contexto.uid}:${contexto.empresaId}:`;
  for (const key of storage.keys()) if (key.startsWith(prefijoContexto)) storage.removeItem(key);
  storage.removeItem(nombreIndice(contexto));
}

function leerPendiente(storage: StorageAperturaPendiente, contexto: ContextoAperturaPendiente, ahora: number): RegistroPendiente | null {
  const indiceRaw = storage.getItem(nombreIndice(contexto));
  if (indiceRaw === null) {
    // Sin índice no existe una intención recuperable: elimina cualquier registro huérfano del contexto.
    eliminarContexto(storage, contexto);
    return null;
  }
  let indice: unknown;
  try { indice = JSON.parse(indiceRaw); } catch { eliminarContexto(storage, contexto); return null; }
  if (!validarIndice(indice) || indice.createdAt > ahora || ahora - indice.createdAt > TTL_MS) {
    eliminarContexto(storage, contexto);
    return null;
  }
  const registroRaw = storage.getItem(nombreRegistro(contexto, indice.commandId));
  if (registroRaw === null) { eliminarContexto(storage, contexto); return null; }
  let registro: unknown;
  try { registro = JSON.parse(registroRaw); } catch { eliminarContexto(storage, contexto); return null; }
  if (!validarRegistro(registro, contexto, ahora) || registro.commandId !== indice.commandId || registro.createdAt !== indice.createdAt) {
    eliminarContexto(storage, contexto);
    return null;
  }
  return registro;
}

function guardarPendiente(storage: StorageAperturaPendiente, contexto: ContextoAperturaPendiente, registro: RegistroPendiente): void {
  storage.setItem(nombreRegistro(contexto, registro.commandId), JSON.stringify(registro));
  storage.setItem(nombreIndice(contexto), JSON.stringify({ commandId: registro.commandId, createdAt: registro.createdAt } satisfies IndicePendiente));
}

function crearRegistro(contexto: ContextoAperturaPendiente, payload: PayloadAbrirTurnoOperativo, adaptadores: AdaptadoresAperturaPendiente): RegistroPendiente {
  const createdAt = adaptadores.now();
  const commandId = adaptadores.generarId();
  const idempotencyKey = adaptadores.generarId();
  const correlationId = adaptadores.generarId();
  if (![commandId, idempotencyKey, correlationId].every(esId)) throw new ErrorAperturaTurnoCliente("CLIENT_STORAGE_UNAVAILABLE");
  return { commandId, idempotencyKey, correlationId, causationId: null, motivo: null, payload, uid: contexto.uid, empresaId: contexto.empresaId, createdAt, updatedAt: createdAt, retryCount: 0 };
}

function envelopeDe(registro: RegistroPendiente): EnvelopeAbrirTurnoOperativo {
  const { commandId, idempotencyKey, correlationId, causationId, motivo, payload } = registro;
  return { commandId, idempotencyKey, correlationId, causationId, motivo, payload };
}

function mismoPayload(a: PayloadAbrirTurnoOperativo, b: PayloadAbrirTurnoOperativo): boolean {
  return a.baseApertura === b.baseApertura && a.notasApertura === b.notasApertura;
}

export function mapearErrorAperturaCallable(error: unknown): ErrorAperturaTurnoCliente {
  if (error instanceof ErrorAperturaTurnoCliente) return error;
  const candidato = esObjeto(error) ? error : {};
  const details = esObjeto(candidato.details) ? candidato.details.code : undefined;
  if (typeof details === "string" && CODIGOS_DOMINIO.has(details as CodigoErrorAperturaCliente)) return new ErrorAperturaTurnoCliente(details as CodigoErrorAperturaCliente);
  if (candidato.code === "functions/aborted" || candidato.code === "aborted") return new ErrorAperturaTurnoCliente("ABORTED");
  if (candidato.code === "functions/unavailable" || candidato.code === "unavailable" || candidato.code === "functions/deadline-exceeded" || candidato.code === "deadline-exceeded" || candidato.name === "TimeoutError") return new ErrorAperturaTurnoCliente("UNAVAILABLE");
  if (candidato.code === "functions/unauthenticated" || candidato.code === "unauthenticated") return new ErrorAperturaTurnoCliente("AUTH_REQUIRED");
  if (candidato.code === "functions/permission-denied" || candidato.code === "permission-denied") return new ErrorAperturaTurnoCliente("TENANT_ACCESS_DENIED");
  return new ErrorAperturaTurnoCliente("UNAVAILABLE");
}

function esReintentable(error: ErrorAperturaTurnoCliente): boolean {
  return error.code === "UNAVAILABLE" || error.code === "ABORTED";
}

/** Limpia una intención conocida al abandonar su contexto autenticado. */
export async function limpiarAperturaPendiente(
  contexto: ContextoAperturaPendiente,
  adaptadores: Pick<AdaptadoresAperturaPendiente, "storage" | "locks">,
): Promise<void> {
  if (!adaptadores.storage || !adaptadores.locks) throw new ErrorAperturaTurnoCliente("CLIENT_STORAGE_UNAVAILABLE");
  try {
    await adaptadores.locks.request(nombreBloqueo(contexto), { mode: "exclusive" }, async () => {
      eliminarContexto(adaptadores.storage!, contexto);
    });
  } catch (error) {
    if (error instanceof ErrorAperturaTurnoCliente) throw error;
    throw new ErrorAperturaTurnoCliente("CLIENT_STORAGE_UNAVAILABLE");
  }
}

/** Conserva la garantía de que no queda intención local antes de informar una sesión ausente. */
export async function limpiarYRechazarAperturaSinSesion(
  contextoConocido: ContextoAperturaPendiente | null,
  adaptadores: Pick<AdaptadoresAperturaPendiente, "storage" | "locks">,
): Promise<never> {
  if (contextoConocido) await limpiarAperturaPendiente(contextoConocido, adaptadores);
  throw new ErrorAperturaTurnoCliente("AUTH_REQUIRED");
}

export async function ejecutarAperturaPendiente(
  contexto: ContextoAperturaPendiente,
  entrada: EntradaAperturaPendiente,
  invocar: (envelope: EnvelopeAbrirTurnoOperativo) => Promise<ResultadoAbrirTurnoOperativo>,
  adaptadores: AdaptadoresAperturaPendiente,
): Promise<ResultadoAbrirTurnoOperativo> {
  const payload = normalizarPayloadApertura(entrada);
  if (!contexto.uid || !contexto.empresaId || !adaptadores.storage || !adaptadores.locks) throw new ErrorAperturaTurnoCliente("CLIENT_STORAGE_UNAVAILABLE");
  const { storage } = adaptadores;
  try {
    return await adaptadores.locks.request(nombreBloqueo(contexto), { mode: "exclusive" }, async () => {
      let registro = leerPendiente(storage, contexto, adaptadores.now());
      if (registro && !mismoPayload(registro.payload, payload)) {
        eliminarContexto(storage, contexto);
        registro = null;
      }
      if (!registro) {
        registro = crearRegistro(contexto, payload, adaptadores);
        guardarPendiente(storage, contexto, registro);
      }
      while (true) {
        try {
          const respuesta = await invocar(envelopeDe(registro));
          eliminarContexto(storage, contexto);
          return respuesta;
        } catch (error) {
          const errorCliente = mapearErrorAperturaCallable(error);
          if (!esReintentable(errorCliente) || registro.retryCount >= MAX_REINTENTOS) {
            if (!esReintentable(errorCliente)) eliminarContexto(storage, contexto);
            throw errorCliente;
          }
          registro = { ...registro, retryCount: registro.retryCount + 1, updatedAt: adaptadores.now() };
          guardarPendiente(storage, contexto, registro);
          await adaptadores.dormir(250 * 2 ** (registro.retryCount - 1));
        }
      }
    });
  } catch (error) {
    if (error instanceof ErrorAperturaTurnoCliente) throw error;
    throw new ErrorAperturaTurnoCliente("CLIENT_STORAGE_UNAVAILABLE");
  }
}
