import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DOCUMENTATION = /^(?:docs\/|ADR-[^/]+\.md$|BACKLOG-[^/]+\.md$|AGENTS\.md$|README(?:\.[^/]+)?$)/i;
const RUNTIME = /\.(?:ts|tsx|js|mjs|cjs|json|css|scss|html|yml|yaml)$/i;

export function classifyFiles(files) {
  const normalized = files.map((file) => file.replaceAll("\\", "/")).filter(Boolean);
  const documentationOnly = normalized.length > 0 && normalized.every((file) => DOCUMENTATION.test(file));
  const allRuntime = normalized.some((file) => RUNTIME.test(file) && !DOCUMENTATION.test(file));
  const functions = normalized.some((file) => file.startsWith("functions/") || file === "firebase.json");
  const firestoreRules = normalized.some((file) => file === "firestore.rules" || file === "firestore.indexes.json");
  const storageRules = normalized.some((file) => file === "storage.rules" || file === "firebase.json");
  const ci = normalized.some((file) => file.startsWith(".github/") || file.startsWith("scripts/ci/") || file.startsWith("scripts/release/"));
  const e2e = normalized.some((file) => file.startsWith("scripts/e2e/") || file.startsWith("tests/e2e/"));
  const publicEvents = normalized.some((file) => /(?:eventos|landing|public)/i.test(file));
  const shifts = normalized.some((file) => /(?:shift|turno|caja)/i.test(file));
  const recipes = normalized.some((file) => /(?:recipe|receta|modifier|modificador|inventar|compra|proveedor)/i.test(file));
  const salon = normalized.some((file) => /(?:salon|salón|mesa|comanda|cocina)/i.test(file));
  const recovery = normalized.some((file) => /(?:restore|recover|recovery|backup|p0-10)/i.test(file));
  const packageChange = normalized.some((file) => /(?:^|\/)(?:package\.json|package-lock\.json|tsconfig[^/]*\.json|next\.config\.[^/]+)$/.test(file));
  const productChange = allRuntime || functions || firestoreRules || storageRules || ci || e2e || packageChange;
  const safeFallback = normalized.length === 0 || normalized.some((file) => !DOCUMENTATION.test(file));
  const runCore = !documentationOnly && safeFallback;
  const broadCritical = productChange || safeFallback;

  return {
    files: normalized,
    documentationOnly,
    runCore,
    functions,
    firestoreRules,
    storageRules,
    ci,
    e2e,
    packageChange,
    p001: broadCritical,
    p006: broadCritical && (functions || firestoreRules || shifts || e2e),
    p102: broadCritical && (functions || firestoreRules || recipes || e2e),
    p104: broadCritical && (functions || firestoreRules || salon || e2e),
    p010: broadCritical && (functions || firestoreRules || recovery || e2e),
    b2: broadCritical && (functions || firestoreRules || publicEvents || e2e),
    b3: broadCritical && normalized.some((file) => file.startsWith("scripts/b3/") || /(?:B3|legacy-event)/i.test(file)),
  };
}

function changedFiles() {
  const eventName = process.env.GITHUB_EVENT_NAME;
  const base = eventName === "pull_request" ? process.env.GITHUB_BASE_SHA : process.env.GITHUB_EVENT_BEFORE;
  const head = process.env.GITHUB_HEAD_SHA || process.env.GITHUB_SHA || "HEAD";
  if (!base || /^0+$/.test(base)) return [];
  try {
    return execFileSync("git", ["diff", "--name-only", `${base}..${head}`], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((file) => file.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

const result = classifyFiles(changedFiles());
const output = process.env.GITHUB_OUTPUT;
if (output) {
  for (const [key, value] of Object.entries(result)) {
    if (key === "files") continue;
    const outputKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    appendFileSync(output, `${outputKey}=${value ? "true" : "false"}\n`);
  }
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
