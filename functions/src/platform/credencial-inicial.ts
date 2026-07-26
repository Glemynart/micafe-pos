import { randomInt } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

/**
 * credencial-inicial.ts — primitivas de generación para la credencial
 * operativa inicial de un tenant (ADR-SAAS-013 D-1).
 *
 * SIN CONSUMIDORES todavía (Capa 1 de la implementación por capas): estas
 * funciones no se invocan desde ningún callable ni desde el bootstrap. Eso
 * empieza en capas posteriores (paso H de `ejecutarBootstrapEmpresarial` y
 * el comando `ProvisionarCredencialInicialTenant`).
 *
 * Por qué el código se genera y no lo escribe el operador (ADR-SAAS-013 §3):
 * la resolución de login busca el código en TODOS los tenants a la vez
 * (`resolverCredencialOperativa` en operational-auth.ts no recibe empresaId
 * del cliente) y desempata con el PIN. Con códigos legibles elegidos a mano
 * (`admin`, `caja1`) la colisión de código entre tenants es la norma, no la
 * excepción, y deja solo 10^6 PINs para separarlas — con ~1200 tenants
 * usando `admin` la probabilidad de al menos una colisión (código, PIN)
 * supera el 50% (problema del cumpleaños). Un código con entropía propia,
 * verificado único antes de escribir, elimina el riesgo por construcción.
 */

const ALFABETO_CROCKFORD = "0123456789abcdefghjkmnpqrstvwxyz"; // sin i,l,o,u
const LONGITUD_SUFIJO = 4;
const LONGITUD_SLUG = 6;
const MAX_INTENTOS_UNICIDAD = 5;

/** Genera un PIN temporal de 6 dígitos con un generador criptográfico. */
export function generarPinTemporal(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function sufijoAleatorio(longitud: number): string {
  let sufijo = "";
  for (let i = 0; i < longitud; i++) {
    sufijo += ALFABETO_CROCKFORD[randomInt(0, ALFABETO_CROCKFORD.length)];
  }
  return sufijo;
}

/**
 * Deriva un slug apto para el prefijo del código a partir del nombre
 * comercial. No es el `Empresa.slug` reservado para MT-U7 (onboarding) —
 * ese campo, si algún día existe para la empresa, tiene prioridad (ver
 * `generarCodigoOperativo`). Este es solo el material del código de login.
 */
export function derivarSlugParaCodigo(nombreComercial: string): string {
  const normalizado = nombreComercial
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita diacríticos (NFD los separa como marcas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const slug = normalizado.slice(0, LONGITUD_SLUG);
  return slug.length >= 3 ? slug : slug.padEnd(3, "0");
}

/**
 * Compone un código candidato `<slug>-<4 base32 Crockford>`. Cumple
 * `CODIGO_REGEX` de contracts.ts (`/^[a-z0-9._-]{3,32}$/`) por construcción.
 */
export function generarCodigoOperativo(slugEmpresa: string): string {
  const slug = slugEmpresa || derivarSlugParaCodigo("empresa");
  return `${slug}-${sufijoAleatorio(LONGITUD_SUFIJO)}`;
}

/**
 * Verifica que un código no exista ya en NINGÚN tenant. Reutiliza la misma
 * consulta que `resolverCredencialOperativa` usa para desambiguar en login
 * (`credenciales_operativas.where('codigo','==',codigo)`), así que si esta
 * verificación pasa, el login no podrá colisionar sobre ese código.
 */
export async function codigoOperativoDisponibleGlobalmente(
  db: Firestore,
  codigo: string,
): Promise<boolean> {
  const snap = await db
    .collection("credenciales_operativas")
    .where("codigo", "==", codigo)
    .limit(1)
    .get();
  return snap.empty;
}

/**
 * Genera un código operativo con unicidad global verificada antes de
 * devolverlo (ADR-SAAS-013 §3.2). Hasta `MAX_INTENTOS_UNICIDAD` intentos;
 * con 32^4 ≈ 1.05M combinaciones por slug, agotar los intentos por
 * colisión genuina es estadísticamente insignificante — si ocurre, es más
 * probable que señale un problema real (p. ej. `codigoOperativoDisponibleGlobalmente`
 * mal invocado) que mala suerte, y por eso se falla explícito en vez de
 * reintentar indefinidamente.
 */
export async function generarCodigoOperativoUnico(
  db: Firestore,
  slugEmpresa: string,
): Promise<string> {
  for (let intento = 0; intento < MAX_INTENTOS_UNICIDAD; intento++) {
    const candidato = generarCodigoOperativo(slugEmpresa);
    if (await codigoOperativoDisponibleGlobalmente(db, candidato)) {
      return candidato;
    }
  }
  throw new Error("CODIGO_OPERATIVO_NO_DISPONIBLE");
}
