import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import net from "node:net";
import { resolve } from "node:path";

const projectId = process.env.E2E_P0_10_PROJECT_ID ?? "demo-p0-10-e2e";
const runId = process.env.E2E_P0_10_RUN_ID ?? `p0-10-${Date.now()}`;
const evidenceDir = resolve(process.env.E2E_P0_10_EVIDENCE_DIR ?? `artifacts/e2e/p0-10/${runId}`);
const backupDir = resolve(evidenceDir, "firestore-auth-export");
if (!/^demo-p0-10-[a-z0-9-]+$/.test(projectId)) {
  throw new Error("P0-10 sólo admite un proyecto demo-p0-10-* para impedir cualquier ejecución productiva.");
}
mkdirSync(evidenceDir, { recursive: true });

const env = { ...process.env };
delete env.GOOGLE_APPLICATION_CREDENTIALS;
Object.assign(env, {
  GCLOUD_PROJECT: projectId,
  E2E_P0_10_PROJECT_ID: projectId,
  E2E_P0_10_RUN_ID: runId,
  E2E_P0_10_EVIDENCE_DIR: evidenceDir,
});

async function puertoLibre(preferido) {
  for (let port = preferido; port < preferido + 100; port += 1) {
    const disponible = await Promise.all(["127.0.0.1", "0.0.0.0"].map((host) => new Promise((resolvePort) => {
      const server = net.createServer();
      server.once("error", () => resolvePort(false));
      server.listen(port, host, () => server.close(() => resolvePort(true)));
    }))).then((resultados) => resultados.every(Boolean));
    if (disponible) return port;
  }
  throw new Error(`No hay puerto local disponible cerca de ${preferido}.`);
}

function escribirConfig(path, firestorePort, authPort) {
  writeFileSync(path, `${JSON.stringify({
    emulators: {
      firestore: { port: firestorePort },
      auth: { port: authPort },
      singleProjectMode: true,
    },
  }, null, 2)}\n`);
}

const firestorePort = await puertoLibre(8087);
const authPort = await puertoLibre(9097);
const configPath = resolve(evidenceDir, "firebase.p0-10-seed.json");
escribirConfig(configPath, firestorePort, authPort);
Object.assign(env, {
  FIRESTORE_EMULATOR_HOST: `127.0.0.1:${firestorePort}`,
  FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${authPort}`,
});

const firebaseCli = resolve("node_modules", "firebase-tools", "lib", "bin", "firebase.js");
function detenerFirestoresDelProyecto() {
  if (process.platform !== "win32") return;
  const safeProjectId = projectId.replaceAll("'", "''");
  spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `$projectId = '${safeProjectId}'; Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'java.exe' -or $_.Name -eq 'java') -and $_.CommandLine -like '*cloud-firestore-emulator*' -and $_.CommandLine -like ('*--project_id ' + $projectId + '*') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }`,
  ], { stdio: "ignore" });
}

const phase = (name, args) => {
  const result = spawnSync(process.execPath, [firebaseCli, "emulators:exec", "--only", "firestore,auth", "--project", projectId, "--config", configPath, ...args], {
  cwd: process.cwd(),
  env,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  writeFileSync(resolve(evidenceDir, `${name}-phase.log`), output);
  process.stdout.write(output);
  return result;
};

const seed = phase("seed", ["--export-on-exit", backupDir, "node --import tsx scripts/e2e/p0-10-seed.ts"]);
detenerFirestoresDelProyecto();
const metadata = {
  runId,
  projectId,
  target: "firestore-and-auth-emulator",
  firestorePort,
  authPort,
  exportDir: backupDir,
  seedExitCode: seed.status ?? 1,
  startedAt: new Date().toISOString(),
};
if (existsSync("firebase-debug.log")) copyFileSync("firebase-debug.log", resolve(evidenceDir, "firebase-seed.log"));
if (seed.status !== 0) {
  metadata.status = "FAIL";
  metadata.completedAt = new Date().toISOString();
  writeFileSync(resolve(evidenceDir, "run-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  process.exitCode = seed.status ?? 1;
} else {
  const restoreFirestorePort = await puertoLibre(8287);
  const restoreAuthPort = await puertoLibre(9197);
  const restoreConfigPath = resolve(evidenceDir, "firebase.p0-10-restore.json");
  escribirConfig(restoreConfigPath, restoreFirestorePort, restoreAuthPort);
  Object.assign(env, {
    FIRESTORE_EMULATOR_HOST: `127.0.0.1:${restoreFirestorePort}`,
    FIREBASE_AUTH_EMULATOR_HOST: `127.0.0.1:${restoreAuthPort}`,
  });
  const restore = spawnSync(process.execPath, [firebaseCli, "emulators:exec", "--only", "firestore,auth", "--project", projectId, "--config", restoreConfigPath, "--import", backupDir, "node --import tsx scripts/e2e/p0-10-verify.ts"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const restoreOutput = `${restore.stdout ?? ""}${restore.stderr ?? ""}`;
  writeFileSync(resolve(evidenceDir, "restore-phase.log"), restoreOutput);
  process.stdout.write(restoreOutput);
  detenerFirestoresDelProyecto();
  metadata.restoreExitCode = restore.status ?? 1;
  metadata.restoreFirestorePort = restoreFirestorePort;
  metadata.restoreAuthPort = restoreAuthPort;
  metadata.status = restore.status === 0 ? "PASS" : "FAIL";
  metadata.completedAt = new Date().toISOString();
  if (existsSync("firebase-debug.log")) copyFileSync("firebase-debug.log", resolve(evidenceDir, "firebase-restore.log"));
  writeFileSync(resolve(evidenceDir, "run-metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  process.exitCode = restore.status ?? 1;
}
