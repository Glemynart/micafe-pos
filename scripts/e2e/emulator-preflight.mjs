import net from "node:net";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DUSEMA_E2E_PARAMS = {
  DUSEMA_ADMIN_BASE_URL: "https://dusema-e2e.invalid",
  DUSEMA_S2S_ISSUER: "pos-e2e",
  DUSEMA_S2S_AUDIENCE: "dusema-e2e",
  DUSEMA_S2S_KID: "dusema-e2e-kid",
  DUSEMA_S2S_ENVIRONMENT: "staging",
};
const DUSEMA_E2E_PARAM_NAMES = new Set(Object.keys(DUSEMA_E2E_PARAMS));

// Firebase Emulator descubre defineString desde functions/.env.local, no desde
// el entorno del proceso que lanza el CLI. El runner crea este archivo justo
// antes de iniciar Emulator y restaura el estado local al terminar.
export function prepararParametrosDusemaEmulador(functionsDir = resolve("functions")) {
  const envFile = resolve(functionsDir, ".env.local");
  const existia = existsSync(envFile);
  const contenidoOriginal = existia ? readFileSync(envFile, "utf8") : null;
  const sinParametrosDusema = (contenidoOriginal ?? "")
    .split(/\r?\n/)
    .filter((linea) => !DUSEMA_E2E_PARAM_NAMES.has(linea.match(/^\s*([A-Z0-9_]+)=/)?.[1]))
    .join("\n")
    .replace(/\n+$/, "");
  const parametros = Object.entries(DUSEMA_E2E_PARAMS)
    .map(([nombre, valor]) => `${nombre}=${valor}`)
    .join("\n");
  writeFileSync(envFile, `${sinParametrosDusema ? `${sinParametrosDusema}\n` : ""}${parametros}\n`);

  let restaurado = false;
  return () => {
    if (restaurado) return;
    restaurado = true;
    if (existia) writeFileSync(envFile, contenidoOriginal);
    else if (existsSync(envFile)) unlinkSync(envFile);
  };
}

export function exigirProjectIdEmulador(projectId, prefix = "demo-") {
  if (typeof projectId !== "string" || !projectId.startsWith(prefix) || !/^[a-z0-9-]+$/.test(projectId)) {
    throw new Error(`El E2E solo admite un proyecto de Emulator seguro con prefijo ${prefix}; recibido: ${projectId ?? "(ausente)"}.`);
  }
  return projectId;
}

export function parsearEndpointLocal(value, nombre, defaultPort) {
  const endpoint = value || `127.0.0.1:${defaultPort}`;
  const [host, portText] = endpoint.split(":");
  const port = Number(portText);
  if (!LOOPBACK_HOSTS.has(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${nombre} debe apuntar a loopback con puerto válido; recibido: ${endpoint}.`);
  }
  return { host, port, endpoint };
}

export function crearEndpointsEmulador(env = process.env) {
  return {
    functions: parsearEndpointLocal(env.FIREBASE_FUNCTIONS_EMULATOR_HOST, "Functions Emulator", 5001),
    firestore: parsearEndpointLocal(env.FIRESTORE_EMULATOR_HOST, "Firestore Emulator", 8085),
    auth: parsearEndpointLocal(env.FIREBASE_AUTH_EMULATOR_HOST, "Auth Emulator", 9099),
  };
}

export function obtenerEstadoPuertos(endpoints) {
  return Promise.all(Object.entries(endpoints).map(async ([nombre, endpoint]) => ({
    nombre,
    endpoint: endpoint.endpoint,
    enUso: await puertoEnUso(endpoint.host, endpoint.port),
  })));
}

export function puertoEnUso(host, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finalizar = (resultado) => {
      socket.destroy();
      resolve(resultado);
    };
    socket.once("connect", () => finalizar(true));
    socket.once("error", () => finalizar(false));
    socket.setTimeout(1_000, () => finalizar(false));
  });
}

async function comprobarHttp(url, acepta) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    const body = await response.text();
    return {
      ok: acepta(response.status),
      status: response.status,
      detalle: body.slice(0, 240),
    };
  } catch (error) {
    return { ok: false, status: null, detalle: error instanceof Error ? error.message : String(error) };
  }
}

async function comprobarFirestore(projectId, endpoint) {
  try {
    const response = await fetch(
      `http://${endpoint.endpoint}/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "_e2e_health" }] } }),
        signal: AbortSignal.timeout(2_000),
      },
    );
    const body = await response.text();
    return {
      // El emulador puede responder 400 mientras inicializa la base ante una
      // consulta de health mínima; ambos estados demuestran que el endpoint
      // Firestore está atendiendo en el puerto correcto.
      ok: (response.status >= 200 && response.status < 300) || response.status === 400 || response.status === 403,
      status: response.status,
      detalle: body.slice(0, 240),
    };
  } catch (error) {
    return { ok: false, status: null, detalle: error instanceof Error ? error.message : String(error) };
  }
}

async function comprobarAuth(projectId, endpoint) {
  return comprobarHttp(
    `http://${endpoint.endpoint}/emulator/v1/projects/${projectId}/config`,
    (status) => status >= 200 && status < 300,
  );
}

async function comprobarFunctions(projectId, endpoint) {
  const url = `http://${endpoint.endpoint}/${projectId}/us-central1/autenticarOperativo`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: {} }),
      signal: AbortSignal.timeout(2_000),
    });
    const body = await response.text();
    return {
      // Un callable cargado puede rechazar una petición inválida, pero nunca
      // debe responder 404. Así se detecta una Functions Emulator ausente o
      // perteneciente a otro proyecto sin exigir credenciales de prueba.
      ok: response.status !== 404 && response.status >= 200 && response.status < 500,
      status: response.status,
      detalle: body.slice(0, 240),
    };
  } catch (error) {
    return { ok: false, status: null, detalle: error instanceof Error ? error.message : String(error) };
  }
}

export async function comprobarEmuladores(projectId, endpoints) {
  const [firestore, auth, functions] = await Promise.all([
    comprobarFirestore(projectId, endpoints.firestore),
    comprobarAuth(projectId, endpoints.auth),
    comprobarFunctions(projectId, endpoints.functions),
  ]);
  return { firestore, auth, functions };
}

export async function esperarEmuladoresSaludables({ projectId, endpoints, timeoutMs = 60_000, intervalMs = 500 }) {
  const startedAt = Date.now();
  let ultimoEstado;
  while (Date.now() - startedAt <= timeoutMs) {
    ultimoEstado = await comprobarEmuladores(projectId, endpoints);
    if (Object.values(ultimoEstado).every((resultado) => resultado.ok)) return ultimoEstado;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const detalle = Object.entries(ultimoEstado ?? {})
    .map(([nombre, estado]) => `${nombre}: ${estado.status ?? "sin respuesta"} (${estado.detalle})`)
    .join("; ");
  throw new Error(`Los emuladores no quedaron saludables para ${projectId}: ${detalle}`);
}

export function detenerEmuladoresDemo(projectId) {
  exigirProjectIdEmulador(projectId, "demo-");
  if (process.platform !== "win32") return;
  const safeProjectId = projectId.replaceAll("'", "''");
  const command = `$projectId = '${safeProjectId}'; ` +
    "$names = @('java.exe','java','node.exe','node'); " +
    "Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name -and $_.CommandLine -and " +
    "(($_.CommandLine -like ('*--project_id ' + $projectId + '*')) -or " +
    "($_.CommandLine -like ('*--project ' + $projectId + '*'))) } | " +
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
  spawnSync("powershell.exe", ["-NoProfile", "-Command", command], { stdio: "ignore" });
}
