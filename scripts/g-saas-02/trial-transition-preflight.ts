import { writeFile } from "node:fs/promises";
import {
  evaluarTrialTransitionPreflight,
  type TrialTransitionSnapshot,
} from "./trial-transition-preflight-core";

type FirestoreDocument = { name?: string; fields?: Record<string, unknown> };

const argumentos = new Set([
  "--project", "--tenant", "--as-of", "--main-sha", "--functions-hash", "--ci-green",
  "--rules-verified", "--storage-verified", "--vercel-verified", "--recovery-ref", "--out",
]);

function argumento(nombre: string): string | undefined {
  const index = process.argv.indexOf(nombre);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function exigirArgumento(nombre: string): string {
  const value = argumento(nombre);
  if (!value) throw new Error(`${nombre} es obligatorio.`);
  return value;
}

function validarArgumentos(): void {
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (!argumentos.has(value)) throw new Error(`Argumento no permitido: ${value}`);
    index += 1;
  }
}

function decode(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const entry = value as Record<string, unknown>;
  if ("stringValue" in entry) return entry.stringValue;
  if ("integerValue" in entry) return Number(entry.integerValue);
  if ("doubleValue" in entry) return entry.doubleValue;
  if ("booleanValue" in entry) return entry.booleanValue;
  if ("timestampValue" in entry) return entry.timestampValue;
  if ("nullValue" in entry) return null;
  if ("arrayValue" in entry) {
    const values = (entry.arrayValue as { values?: unknown[] }).values ?? [];
    return values.map(decode);
  }
  if ("mapValue" in entry) {
    const fields = (entry.mapValue as { fields?: Record<string, unknown> }).fields ?? {};
    return Object.fromEntries(Object.entries(fields).map(([key, nested]) => [key, decode(nested)]));
  }
  return value;
}

function decodeDocument(document: FirestoreDocument | null): Record<string, unknown> | null {
  if (!document) return null;
  return Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode(value)]));
}

function documentId(document: FirestoreDocument): string {
  return document.name?.split("/").pop() ?? "";
}

async function readProduction(projectId: string, tenantId: string): Promise<Pick<TrialTransitionSnapshot, "empresa" | "suscripcionRaiz" | "planAnual" | "configuracion" | "relaciones" | "operador">> {
  const token = process.env.FIREBASE_ACCESS_TOKEN;
  if (!token) throw new Error("FIREBASE_ACCESS_TOKEN es obligatorio; el preflight no obtiene ni imprime credenciales.");
  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents`;
  const headers = { Authorization: `Bearer ${token}` };
  const get = async (path: string): Promise<FirestoreDocument | null> => {
    const response = await fetch(`${base}/${path}`, { method: "GET", headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`GET Firestore falló (${response.status}) para ${path}.`);
    return await response.json() as FirestoreDocument;
  };
  const list = async (path: string): Promise<FirestoreDocument[]> => {
    const response = await fetch(`${base}/${path}?pageSize=100`, { method: "GET", headers });
    if (!response.ok) throw new Error(`GET Firestore falló (${response.status}) para ${path}.`);
    return ((await response.json()) as { documents?: FirestoreDocument[] }).documents ?? [];
  };
  const [empresa, suscripcionRaiz, config, plan, version, relations, operators] = await Promise.all([
    get(`empresas/${tenantId}`),
    get(`suscripciones/${tenantId}`),
    get(`configuraciones/${tenantId}`),
    get("planes/mvp_comercial"),
    get("planes/mvp_comercial/versiones/2"),
    list(`suscripciones/${tenantId}/relaciones`),
    list("saas_operadores"),
  ]);
  void plan;
  return {
    empresa: decodeDocument(empresa),
    suscripcionRaiz: decodeDocument(suscripcionRaiz),
    planAnual: decodeDocument(version),
    configuracion: decodeDocument(config),
    relaciones: relations.map((document) => ({ id: documentId(document), ...decodeDocument(document) })),
    operador: decodeDocument(operators.find((document) => decodeDocument(document)?.estado === "ACTIVO") ?? null),
  };
}

async function main(): Promise<void> {
  validarArgumentos();
  const projectId = exigirArgumento("--project");
  const tenantId = exigirArgumento("--tenant");
  const release = {
    mainSha: exigirArgumento("--main-sha"),
    functionsHash: exigirArgumento("--functions-hash"),
    ciGreen: argumento("--ci-green") === "true",
    rulesVerified: argumento("--rules-verified") === "true",
    storageVerified: argumento("--storage-verified") === "true",
    vercelVerified: argumento("--vercel-verified") === "true",
  };
  const production = await readProduction(projectId, tenantId);
  const snapshot: TrialTransitionSnapshot = {
    projectId,
    tenantId,
    asOf: argumento("--as-of") ?? new Date().toISOString().slice(0, 10),
    ...production,
    release,
    recoveryEvidenceRef: argumento("--recovery-ref") ?? null,
  };
  const result = evaluarTrialTransitionPreflight(snapshot);
  const output = `${JSON.stringify(result, null, 2)}\n`;
  const out = argumento("--out");
  if (out) await writeFile(out, output, "utf8");
  process.stdout.write(output);
  if (result.status !== "ESPERAR_VENTANA" && result.status !== "LISTO_PARA_COMANDOS") process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
