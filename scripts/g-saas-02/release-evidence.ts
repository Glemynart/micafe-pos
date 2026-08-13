import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { evaluarReleaseEvidence, type CiObservation, type FunctionsObservation, type ReleaseEvidenceInput, type VercelObservation } from "./release-evidence-core";

const argumentos = new Set([
  "--project", "--repo", "--sha", "--out", "--rules-ref", "--storage-ref", "--smoke-ref", "--recovery-ref",
]);

function argumento(nombre: string): string | undefined {
  const index = process.argv.indexOf(nombre);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validarArgumentos(): void {
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (!argumentos.has(value)) throw new Error(`Argumento no permitido: ${value}`);
    index += 1;
  }
}

function ejecutar(command: string, args: readonly string[]): { ok: boolean; stdout: string } {
  const execution = spawnSync(command, [...args], {
    encoding: "utf8",
    windowsHide: true,
    shell: process.platform === "win32" && command === "firebase",
  });
  return { ok: execution.status === 0, stdout: execution.stdout?.trim() ?? "" };
}

function shaLocal(): string | null {
  const result = ejecutar("git", ["rev-parse", "origin/main"]);
  return result.ok ? result.stdout : null;
}

function leerJson(command: string, args: readonly string[]): { value: unknown | null; error?: string } {
  const result = ejecutar(command, args);
  if (!result.ok) return { value: null, error: `${command} no pudo completar la lectura solicitada.` };
  try {
    return { value: JSON.parse(result.stdout) as unknown };
  } catch {
    return { value: null, error: `${command} devolvió una respuesta no interpretable.` };
  }
}

function obtenerCi(repo: string, sha: string): { observation: CiObservation | null; error?: string } {
  const response = leerJson("gh", ["api", `repos/${repo}/actions/runs?head_sha=${sha}&per_page=50`]);
  if (response.error) return { observation: null, error: response.error };
  const runs = (response.value as { workflow_runs?: Array<Record<string, unknown>> })?.workflow_runs ?? [];
  const candidates = runs
    .filter((run) => run.name === "CI" && run.head_sha === sha)
    .sort((left, right) => String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")));
  const run = candidates[0];
  if (!run) return { observation: null };
  return {
    observation: {
      runId: String(run.id ?? ""),
      headSha: String(run.head_sha ?? ""),
      status: String(run.status ?? ""),
      conclusion: run.conclusion == null ? null : String(run.conclusion),
      url: run.html_url == null ? null : String(run.html_url),
    },
  };
}

function obtenerVercel(repo: string, sha: string): { observation: VercelObservation | null; error?: string } {
  const response = leerJson("gh", ["api", `repos/${repo}/commits/${sha}/status`]);
  if (response.error) return { observation: null, error: response.error };
  const statuses = (response.value as { statuses?: Array<Record<string, unknown>> })?.statuses ?? [];
  const vercelStatuses = statuses
    .filter((status) => String(status.context ?? "").toLowerCase().includes("vercel"))
    .sort((left, right) => String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")));
  const status = vercelStatuses[0];
  if (!status) return { observation: null };
  return {
    observation: {
      state: String(status.state ?? ""),
      targetUrl: status.target_url == null ? null : String(status.target_url),
      updatedAt: status.updated_at == null ? null : String(status.updated_at),
    },
  };
}

function obtenerFunctions(project: string): { observation: FunctionsObservation | null; error?: string } {
  const response = leerJson("firebase", ["functions:list", "--project", project, "--json"]);
  if (response.error) return { observation: null, error: response.error };
  const functions = (response.value as { result?: Array<Record<string, unknown>> })?.result ?? [];
  const runtimes = [...new Set(functions.map((item) => String(item.runtime ?? "")))].filter(Boolean).sort();
  const functionHashes = functions.map((item) => {
    const labels = item.labels && typeof item.labels === "object"
      ? item.labels as Record<string, unknown>
      : {};
    return String(item.hash ?? labels["firebase-functions-hash"] ?? "");
  }).filter(Boolean);
  const hashCounts = Object.fromEntries([...new Set(functionHashes)].sort().map((hash) => [
    hash,
    functionHashes.filter((value) => value === hash).length,
  ]));
  const hashes = Object.keys(hashCounts);
  return {
    observation: {
      count: functions.length,
      activeCount: functions.filter((item) => item.state === "ACTIVE").length,
      runtimes,
      hashes,
      hashCounts,
    },
  };
}

function external(reference: string | undefined) {
  return { reference: reference ?? null, independentlyVerified: false };
}

async function main(): Promise<void> {
  validarArgumentos();
  const project = argumento("--project");
  const repo = argumento("--repo");
  if (!project) throw new Error("--project es obligatorio.");
  if (!repo) throw new Error("--repo es obligatorio.");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(project)) throw new Error("--project tiene un formato no permitido.");
  const targetSha = argumento("--sha") ?? shaLocal();
  if (!targetSha) throw new Error("No fue posible resolver origin/main; use --sha explícitamente.");

  const collectionErrors: string[] = [];
  const ci = obtenerCi(repo, targetSha);
  const vercel = obtenerVercel(repo, targetSha);
  const functions = obtenerFunctions(project);
  for (const result of [ci, vercel, functions]) if (result.error) collectionErrors.push(result.error);

  const input: ReleaseEvidenceInput = {
    targetSha,
    originMainSha: shaLocal(),
    ci: ci.observation,
    vercel: vercel.observation,
    functions: functions.observation,
    external: {
      rules: external(argumento("--rules-ref")),
      storage: external(argumento("--storage-ref")),
      smoke: external(argumento("--smoke-ref")),
      recovery: external(argumento("--recovery-ref")),
    },
    collectionErrors,
  };
  const result = evaluarReleaseEvidence(input);
  const output = `${JSON.stringify(result, null, 2)}\n`;
  const out = argumento("--out");
  if (out) await writeFile(out, output, "utf8");
  process.stdout.write(output);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
