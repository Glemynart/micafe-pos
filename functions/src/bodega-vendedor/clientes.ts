import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirTenantActivo } from "../operational-auth";
import { leerConfiguracionEmpresa } from "../configuracion/service";

const REGION = "us-central1";
const CAMPOS_ENTRADA = ["nombre", "cedula", "tipoDocumento", "telefono", "contacto", "direccion", "barrioZona"] as const;
const TIPOS_DOCUMENTO_BODEGA = ["NIT", "CC"] as const;

type CampoEntrada = (typeof CAMPOS_ENTRADA)[number];
type EntradaClienteVendedor = Partial<Record<CampoEntrada, unknown>>;

const fail = (code: HttpsError["code"], message: string): never => { throw new HttpsError(code, message); };
const esObjeto = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

function textoRequerido(value: unknown, maximo: number, campo: string): string {
  if (typeof value !== "string") fail("invalid-argument", campo.toUpperCase() + "_INVALIDO");
  const normalizado = (value as string).trim();
  if (!normalizado || normalizado.length > maximo) fail("invalid-argument", campo.toUpperCase() + "_INVALIDO");
  return normalizado;
}

function textoOpcional(value: unknown, maximo: number, campo: string): string | undefined {
  if (value === undefined) return undefined;
  return textoRequerido(value, maximo, campo);
}

/** Convierte exclusivamente el contrato de alta Bodega; nunca recibe empresaId, estado ni saldos. */
export function normalizarEntradaClienteVendedor(data: unknown) {
  if (!esObjeto(data) || Object.keys(data).some((campo) => !CAMPOS_ENTRADA.includes(campo as CampoEntrada))) {
    fail("invalid-argument", "PAYLOAD_INVALIDO");
  }
  const entrada = data as EntradaClienteVendedor;
  const tipoDocumento = textoOpcional(entrada.tipoDocumento, 3, "tipo_documento");
  if (tipoDocumento && !TIPOS_DOCUMENTO_BODEGA.includes(tipoDocumento as (typeof TIPOS_DOCUMENTO_BODEGA)[number])) {
    fail("invalid-argument", "TIPO_DOCUMENTO_INVALIDO");
  }
  const contacto = textoOpcional(entrada.contacto, 160, "contacto");
  const direccion = textoOpcional(entrada.direccion, 240, "direccion");
  const barrioZona = textoOpcional(entrada.barrioZona, 120, "barrio_zona");
  return {
    nombre: textoRequerido(entrada.nombre, 160, "nombre"),
    cedula: textoRequerido(entrada.cedula, 40, "documento"),
    telefono: textoRequerido(entrada.telefono, 30, "telefono"),
    ...(tipoDocumento ? { tipoDocumento } : {}),
    ...(contacto ? { contacto } : {}),
    ...(direccion ? { direccion } : {}),
    ...(barrioZona ? { barrioZona } : {}),
  };
}

/** DTO fijo para vendedor: ni saldo, ni empresaId ni campos administrativos atraviesan la frontera. */
export function proyectarClienteVendedor(cliente: Record<string, unknown>) {
  const texto = (campo: string): string | null => typeof cliente[campo] === "string" && cliente[campo].trim() ? cliente[campo] : null;
  return {
    id: String(cliente.id ?? ""),
    nombre: texto("nombre") ?? "",
    cedula: texto("cedula") ?? "",
    tipoDocumento: texto("tipoDocumento"),
    telefono: texto("telefono") ?? "",
    contacto: texto("contacto"),
    direccion: texto("direccion"),
    barrioZona: texto("barrioZona"),
    activo: cliente.activo === true,
  };
}

interface ContextoClientesVendedor {
  empresaId: string;
  rol: string;
  permisos: readonly string[];
  clientesHabilitados: boolean;
}

/** Requiere la autoridad canónica ya revalidada por membresía y configuración tenant. */
function exigirVendedor(contexto: ContextoClientesVendedor) {
  if (contexto.rol !== "vendedor" || !contexto.permisos.includes("sell") || !contexto.clientesHabilitados) {
    fail("permission-denied", "ROL_NO_AUTORIZADO");
  }
}

export async function ejecutarConsultarClientesVendedor(db: any, contexto: ContextoClientesVendedor, data: unknown) {
  exigirVendedor(contexto);
  if (data !== undefined && (!esObjeto(data) || Object.keys(data).length !== 0)) fail("invalid-argument", "PAYLOAD_INVALIDO");
  const snap = await db.collection("clientes").where("empresaId", "==", contexto.empresaId).where("activo", "==", true).get();
  return { clientes: snap.docs.map((doc: any) => proyectarClienteVendedor({ id: doc.id, ...doc.data() })) };
}

export async function ejecutarCrearClienteVendedor(db: any, contexto: ContextoClientesVendedor, data: unknown) {
  exigirVendedor(contexto);
  const cliente = normalizarEntradaClienteVendedor(data);
  const ref = await db.collection("clientes").add({
    ...cliente,
    empresaId: contexto.empresaId,
    activo: true,
    creadoEn: FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  return { cliente: proyectarClienteVendedor({ id: ref.id, ...cliente, activo: true }) };
}

export const consultarClientesVendedorV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  const configuracion = await leerConfiguracionEmpresa(db, tenant.id);
  return ejecutarConsultarClientesVendedor(db, {
    empresaId: tenant.id,
    rol: tenant.rol,
    permisos: tenant.permisos,
    clientesHabilitados: configuracion.modulos.habilitados.includes("clientes"),
  }, request.data);
});

export const crearClienteVendedorV1 = onCall({ region: REGION }, async (request) => {
  const db = getFirestore();
  const tenant = await exigirTenantActivo(request, db);
  const configuracion = await leerConfiguracionEmpresa(db, tenant.id);
  return ejecutarCrearClienteVendedor(db, {
    empresaId: tenant.id,
    rol: tenant.rol,
    permisos: tenant.permisos,
    clientesHabilitados: configuracion.modulos.habilitados.includes("clientes"),
  }, request.data);
});
