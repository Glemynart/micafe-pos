import { createHash } from "node:crypto";

export const TENANT_ANNEX_COLLECTION = "saas_legal_tenant_annexes";
export const EXPORT_CONTACT_AUTHORITY_COLLECTION = "saas_export_contact_authorities";

const idPattern = /^[A-Za-z0-9_-]{1,120}$/;
const referencePattern = /^[A-Za-z0-9._:-]{1,160}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const channels = new Set(["EMAIL_VERIFICADO", "WHATSAPP_VERIFICADO"]);
const holders = new Set(["CLIENTES", "PROVEEDORES", "ADMINISTRADORES", "VENDEDORES"]);
const dataCategories = new Set([
  "IDENTIFICACION_Y_CONTACTO", "TRANSACCIONES_COMERCIALES", "CREDITO_Y_COBROS",
  "CATALOGO_E_INVENTARIO", "REGISTROS_DE_ACCESO",
]);
const purposes = new Set([
  "OPERAR_EL_POS", "GESTIONAR_CLIENTES_Y_PEDIDOS", "ADMINISTRAR_INVENTARIO_Y_COMPRAS",
  "GESTIONAR_CUENTAS_POR_COBRAR", "PROTEGER_Y_DAR_SOPORTE_AL_SERVICIO",
]);
const exitInstructions = new Set(["DEVOLVER_Y_SUPRIMIR_SEGUN_RETENCIONES", "DEVOLVER_Y_SOLICITAR_SUPRESION"]);

export type ContactAuthoritySnapshot = {
  schemaVersion: 1;
  projectId: string;
  empresaId: string;
  revision: number;
  estado: "ACTIVO";
  contacto: {
    id: string;
    version: number;
    designacionVersion: number;
    canal: "EMAIL_VERIFICADO" | "WHATSAPP_VERIFICADO";
    designacionRef: string;
    pruebaCanalRef: string;
    designadoEn: string;
    verificadoEn: string;
  };
};

export type TenantAnnexSnapshot = {
  schemaVersion: 1;
  empresaId: string;
  revision: number;
  perfil: {
    referenciaVerificacion: string;
    nombreComercial: string;
    tipoPersona: "NATURAL" | "JURIDICA";
    verificadoEn: string;
  };
  representante: { referenciaDesignacion: string; designadoEn: string };
  capacidades: string[];
  contactoPrivacidad: {
    autoridadId: string;
    version: number;
    canal: "EMAIL_VERIFICADO" | "WHATSAPP_VERIFICADO";
  };
  instrucciones: {
    referencia: string;
    confirmadasPorAdmin: string;
    confirmadasEn: string;
    titulares: string[];
    categoriasDatos: string[];
    finalidades: string[];
    instruccionSalida: "DEVOLVER_Y_SUPRIMIR_SEGUN_RETENCIONES" | "DEVOLVER_Y_SOLICITAR_SUPRESION";
  };
  subencargados: {
    versionRegistro: number;
    sha256Registro: string;
    verificadoEn: string;
    entradas: Array<{ id: string; producto: string; finalidad: string; paisIso2: string; instrumentoRef: string }>;
  };
  conservacion: { version: number; sha256: string; respaldoRef: string; verificadoEn: string };
  seguridad: { version: number; sha256: string; controlesRef: string; verificadoEn: string };
};

export type TenantAnnexResult =
  | { disponible: true; snapshot: TenantAnnexSnapshot; sha256: string }
  | { disponible: false; faltantes: string[] };

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validString(value: unknown, max = 160): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\r\n\u0000-\u001f]/.test(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" && idPattern.test(value);
}

function validRef(value: unknown): value is string {
  return typeof value === "string" && referencePattern.test(value);
}

function validVersion(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function enumList(value: unknown, allowed: Set<string>): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= allowed.size
    && value.every((item) => typeof item === "string" && allowed.has(item))
    && new Set(value).size === value.length;
}

function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, "en"));
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, item]) => [key, canonical(item)]));
  throw new Error("LEGAL_ANNEX_CANONICAL_VALUE_INVALID");
}

export function sha256CanonicalLegal(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex");
}

export function sha256TenantAnnex(snapshot: TenantAnnexSnapshot): string {
  return sha256CanonicalLegal(snapshot);
}

export function sha256SubencargadosRegistry(entries: Array<{ id: string; producto: string; finalidad: string; paisIso2: string; instrumentoRef: string }>): string {
  return sha256CanonicalLegal([...entries].sort((a, b) => a.id.localeCompare(b.id, "en")));
}

export function validarAutoridadContacto(value: unknown, projectId: string, empresaId: string): value is ContactAuthoritySnapshot {
  if (!record(value) || value.schemaVersion !== 1 || value.projectId !== projectId || value.empresaId !== empresaId
    || !validVersion(value.revision) || value.estado !== "ACTIVO" || !record(value.contacto)) return false;
  const contact = value.contacto;
  return validId(contact.id) && validVersion(contact.version) && validVersion(contact.designacionVersion) && value.revision === contact.version
    && typeof contact.canal === "string" && channels.has(contact.canal)
    && validRef(contact.designacionRef) && validRef(contact.pruebaCanalRef)
    && validDate(contact.designadoEn) && validDate(contact.verificadoEn);
}

/** Builds a canonical, tenant-bound annex only from server-maintained verified source records. */
export function crearSnapshotAnexoTenant(input: {
  empresaId: string;
  authority: unknown;
  projectId: string;
  annexRecord: unknown;
  capacidadesContrato: string[];
}): TenantAnnexResult {
  const missing = new Set<string>();
  if (!validId(input.empresaId)) missing.add("empresaId");
  if (!validId(input.projectId)) missing.add("projectId");
  if (!validarAutoridadContacto(input.authority, input.projectId, input.empresaId)) missing.add("contacto representante verificado y activo");
  if (!record(input.annexRecord)) return { disponible: false, faltantes: [...missing, "ficha de tratamiento del tenant"] };

  const raw = input.annexRecord;
  if (!onlyKeys(raw, ["schemaVersion", "empresaId", "revision", "estado", "perfil", "representante", "capacidades", "instrucciones", "subencargados", "conservacion", "seguridad"])
    || raw.schemaVersion !== 1 || raw.empresaId !== input.empresaId || !validVersion(raw.revision) || raw.estado !== "VERIFICADO") missing.add("identidad y versión de la ficha");
  const perfil = record(raw.perfil) ? raw.perfil : {};
  if (!onlyKeys(perfil, ["referenciaVerificacion", "nombreComercial", "tipoPersona", "estado", "verificadoEn"])
    || !validRef(perfil.referenciaVerificacion) || !validString(perfil.nombreComercial, 160)
    || !["NATURAL", "JURIDICA"].includes(String(perfil.tipoPersona)) || perfil.estado !== "VERIFICADO"
    || !validDate(perfil.verificadoEn)) missing.add("identidad del negocio verificada");
  const representante = record(raw.representante) ? raw.representante : {};
  if (!onlyKeys(representante, ["referenciaDesignacion", "estado", "designadoEn"])
    || !validRef(representante.referenciaDesignacion) || representante.estado !== "VERIFICADO"
    || !validDate(representante.designadoEn)) missing.add("designación verificable del representante");
  const instruccion = record(raw.instrucciones) ? raw.instrucciones : {};
  if (!onlyKeys(instruccion, ["referencia", "estado", "confirmadasPorAdmin", "confirmadasEn", "titulares", "categoriasDatos", "finalidades", "instruccionSalida"])
    || !validRef(instruccion.referencia) || instruccion.estado !== "CONFIRMADAS" || !validDate(instruccion.confirmadasEn)
    || !validId(instruccion.confirmadasPorAdmin)
    || !enumList(instruccion.titulares, holders) || !enumList(instruccion.categoriasDatos, dataCategories)
    || !enumList(instruccion.finalidades, purposes) || !exitInstructions.has(String(instruccion.instruccionSalida))) {
    missing.add("instrucciones y finalidades confirmadas por el negocio");
  }
  const allowedCapabilities = new Set(input.capacidadesContrato);
  if (!Array.isArray(raw.capacidades) || raw.capacidades.length === 0 || raw.capacidades.some((item) => typeof item !== "string" || !allowedCapabilities.has(item))
    || new Set(raw.capacidades).size !== raw.capacidades.length) {
    missing.add("módulos limitados a las capacidades del contrato");
  }

  const sub = record(raw.subencargados) ? raw.subencargados : {};
  const providers = Array.isArray(sub.entradas) ? sub.entradas : [];
  const providersValid = providers.length > 0 && providers.every((entry) => record(entry)
    && onlyKeys(entry, ["id", "producto", "finalidad", "paisIso2", "instrumentoRef", "estado"]) && validId(entry.id)
    && validString(entry.producto, 120) && validString(entry.finalidad, 180)
    && typeof entry.paisIso2 === "string" && /^[A-Z]{2}$/.test(entry.paisIso2)
    && validRef(entry.instrumentoRef) && entry.estado === "VERIFICADO")
    && new Set(providers.map((entry: Record<string, unknown>) => entry.id)).size === providers.length;
  const normalizedProviders = providersValid ? providers.map((entry: Record<string, unknown>) => ({
    id: entry.id as string, producto: (entry.producto as string).trim(), finalidad: (entry.finalidad as string).trim(),
    paisIso2: entry.paisIso2 as string, instrumentoRef: entry.instrumentoRef as string,
  })).sort((a, b) => a.id.localeCompare(b.id, "en")) : [];
  if (!onlyKeys(sub, ["estadoRegistro", "versionRegistro", "sha256Registro", "verificadoEn", "entradas"])
    || sub.estadoRegistro !== "VERIFICADO" || !validDate(sub.verificadoEn)
    || !validVersion(sub.versionRegistro) || !digestPattern.test(String(sub.sha256Registro)) || providers.length === 0
    || !providersValid || sub.sha256Registro !== sha256SubencargadosRegistry(normalizedProviders)) {
    missing.add("inventario versionado y verificado de subencargados/regiones");
  }
  const retention = record(raw.conservacion) ? raw.conservacion : {};
  if (!onlyKeys(retention, ["estado", "version", "sha256", "respaldoRef", "verificadoEn"])
    || retention.estado !== "VERIFICADO" || !validDate(retention.verificadoEn)
    || !validVersion(retention.version) || !digestPattern.test(String(retention.sha256)) || !validRef(retention.respaldoRef)) missing.add("conservación y respaldos verificados");
  const security = record(raw.seguridad) ? raw.seguridad : {};
  if (!onlyKeys(security, ["estado", "version", "sha256", "controlesRef", "verificadoEn"])
    || security.estado !== "VERIFICADO" || !validDate(security.verificadoEn)
    || !validVersion(security.version) || !digestPattern.test(String(security.sha256)) || !validRef(security.controlesRef)) missing.add("controles de seguridad verificados");

  if (missing.size > 0) return { disponible: false, faltantes: [...missing].sort() };
  const authority = input.authority as ContactAuthoritySnapshot;
  const snapshot: TenantAnnexSnapshot = {
    schemaVersion: 1,
    empresaId: input.empresaId,
    revision: raw.revision as number,
    perfil: {
      referenciaVerificacion: perfil.referenciaVerificacion as string,
      nombreComercial: (perfil.nombreComercial as string).trim(),
      tipoPersona: perfil.tipoPersona as "NATURAL" | "JURIDICA",
      verificadoEn: perfil.verificadoEn as string,
    },
    representante: { referenciaDesignacion: representante.referenciaDesignacion as string, designadoEn: representante.designadoEn as string },
    capacidades: sorted(raw.capacidades as string[]),
    contactoPrivacidad: { autoridadId: authority.contacto.id, version: authority.contacto.version, canal: authority.contacto.canal },
    instrucciones: {
      referencia: instruccion.referencia as string,
      confirmadasPorAdmin: instruccion.confirmadasPorAdmin as string,
      confirmadasEn: instruccion.confirmadasEn as string,
      titulares: sorted(instruccion.titulares as string[]),
      categoriasDatos: sorted(instruccion.categoriasDatos as string[]),
      finalidades: sorted(instruccion.finalidades as string[]),
      instruccionSalida: instruccion.instruccionSalida as TenantAnnexSnapshot["instrucciones"]["instruccionSalida"],
    },
    subencargados: {
      versionRegistro: sub.versionRegistro as number,
      sha256Registro: sub.sha256Registro as string,
      verificadoEn: sub.verificadoEn as string,
      entradas: normalizedProviders,
    },
    conservacion: { version: retention.version as number, sha256: retention.sha256 as string, respaldoRef: retention.respaldoRef as string, verificadoEn: retention.verificadoEn as string },
    seguridad: { version: security.version as number, sha256: security.sha256 as string, controlesRef: security.controlesRef as string, verificadoEn: security.verificadoEn as string },
  };
  return { disponible: true, snapshot, sha256: sha256TenantAnnex(snapshot) };
}

export function validarSnapshotAnexoPersistido(value: unknown, expectedEmpresaId: string, expectedSha256: string): value is TenantAnnexSnapshot {
  if (!record(value) || value.schemaVersion !== 1 || value.empresaId !== expectedEmpresaId
    || !validVersion(value.revision) || !digestPattern.test(expectedSha256)
    || !onlyKeys(value, ["schemaVersion", "empresaId", "revision", "perfil", "representante", "capacidades", "contactoPrivacidad", "instrucciones", "subencargados", "conservacion", "seguridad"])
    || !record(value.perfil) || !onlyKeys(value.perfil, ["referenciaVerificacion", "nombreComercial", "tipoPersona", "verificadoEn"])
    || !validRef(value.perfil.referenciaVerificacion) || !validString(value.perfil.nombreComercial, 160)
    || !["NATURAL", "JURIDICA"].includes(String(value.perfil.tipoPersona)) || !validDate(value.perfil.verificadoEn)
    || !record(value.representante) || !onlyKeys(value.representante, ["referenciaDesignacion", "designadoEn"])
    || !validRef(value.representante.referenciaDesignacion) || !validDate(value.representante.designadoEn)
    || !Array.isArray(value.capacidades) || value.capacidades.length === 0 || value.capacidades.some((item) => !validId(item))
    || !record(value.contactoPrivacidad) || !validId(value.contactoPrivacidad.autoridadId) || !validVersion(value.contactoPrivacidad.version)
    || typeof value.contactoPrivacidad.canal !== "string" || !channels.has(value.contactoPrivacidad.canal)
    || !record(value.instrucciones) || !onlyKeys(value.instrucciones, ["referencia", "confirmadasPorAdmin", "confirmadasEn", "titulares", "categoriasDatos", "finalidades", "instruccionSalida"])
    || !validRef(value.instrucciones.referencia) || !validId(value.instrucciones.confirmadasPorAdmin) || !validDate(value.instrucciones.confirmadasEn)
    || !enumList(value.instrucciones.titulares, holders) || !enumList(value.instrucciones.categoriasDatos, dataCategories)
    || !enumList(value.instrucciones.finalidades, purposes) || !exitInstructions.has(String(value.instrucciones.instruccionSalida))
    || !record(value.subencargados) || !onlyKeys(value.subencargados, ["versionRegistro", "sha256Registro", "verificadoEn", "entradas"])
    || !validDate(value.subencargados.verificadoEn) || !validVersion(value.subencargados.versionRegistro)
    || !digestPattern.test(String(value.subencargados.sha256Registro)) || !Array.isArray(value.subencargados.entradas)
    || value.subencargados.entradas.length === 0 || value.subencargados.entradas.some((entry) => !record(entry)
      || !onlyKeys(entry, ["id", "producto", "finalidad", "paisIso2", "instrumentoRef"])
      || !validId(entry.id) || !validString(entry.producto, 120) || !validString(entry.finalidad, 180)
      || typeof entry.paisIso2 !== "string" || !/^[A-Z]{2}$/.test(entry.paisIso2) || !validRef(entry.instrumentoRef))
    || new Set(value.subencargados.entradas.map((entry: Record<string, unknown>) => entry.id)).size !== value.subencargados.entradas.length
    || value.subencargados.sha256Registro !== sha256SubencargadosRegistry(value.subencargados.entradas as TenantAnnexSnapshot["subencargados"]["entradas"])
    || !record(value.conservacion) || !onlyKeys(value.conservacion, ["version", "sha256", "respaldoRef", "verificadoEn"])
    || !validVersion(value.conservacion.version) || !digestPattern.test(String(value.conservacion.sha256))
    || !validRef(value.conservacion.respaldoRef) || !validDate(value.conservacion.verificadoEn)
    || !record(value.seguridad) || !onlyKeys(value.seguridad, ["version", "sha256", "controlesRef", "verificadoEn"]) || !validVersion(value.seguridad.version)
    || !digestPattern.test(String(value.seguridad.sha256)) || !validRef(value.seguridad.controlesRef) || !validDate(value.seguridad.verificadoEn)) return false;
  try { return sha256TenantAnnex(value as unknown as TenantAnnexSnapshot) === expectedSha256; }
  catch { return false; }
}
