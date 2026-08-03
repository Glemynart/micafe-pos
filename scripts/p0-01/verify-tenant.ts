import "dotenv/config";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  type AuthUserView,
  type DocumentView,
  type ReadOnlyCertificationSource,
  type CertificationReport,
  VERIFIER_NAME,
  verifyTenant,
  validateExpectations,
} from "./verifier";

interface Arguments {
  projectId: string;
  tenantId: string;
  expectationsPath: string;
  outputPath?: string;
}

function usage(): string {
  return [
    `Uso: npx tsx scripts/p0-01/verify-tenant.ts --project-id <id> --tenant-id <id> --expectations <archivo.json> [--output <archivo.json>]`,
    "",
    "El comando es siempre de solo lectura. Requiere FIREBASE_SERVICE_ACCOUNT(_PATH), GOOGLE_APPLICATION_CREDENTIALS o ambos emuladores activos.",
  ].join("\n");
}

function parseArguments(argv: string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help") {
      console.log(usage());
      process.exit(0);
    }
    if (!key?.startsWith("--")) throw new Error("ARGUMENT_INVALID");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error("ARGUMENT_VALUE_REQUIRED");
    values.set(key.slice(2), value);
    index += 1;
  }
  const projectId = values.get("project-id");
  const tenantId = values.get("tenant-id");
  const expectationsPath = values.get("expectations");
  if (!projectId || !tenantId || !expectationsPath) throw new Error("ARGUMENT_REQUIRED");
  return { projectId, tenantId, expectationsPath, outputPath: values.get("output") };
}

function loadServiceAccount(): object {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (inline && inline.trim().length > 2) {
    try {
      return JSON.parse(inline) as object;
    } catch {
      throw new Error("SERVICE_ACCOUNT_JSON_INVALID");
    }
  }
  const candidates = [process.env.FIREBASE_SERVICE_ACCOUNT_PATH, process.env.GOOGLE_APPLICATION_CREDENTIALS, "./service-account.local.json"]
    .filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, "utf8")) as object;
  }
  throw new Error("SERVICE_ACCOUNT_REQUIRED");
}

function initializeReadOnlyFirebase(projectId: string): void {
  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (Boolean(firestoreEmulator) !== Boolean(authEmulator)) throw new Error("EMULATOR_CONFIGURATION_INCOMPLETE");
  if (getApps().length > 0) return;
  if (firestoreEmulator && authEmulator) initializeApp({ projectId });
  else initializeApp({ projectId, credential: cert(loadServiceAccount()) });
}

function createSource(db: Firestore): ReadOnlyCertificationSource {
  return {
    async getDocument(documentPath: string): Promise<DocumentView | null> {
      const snapshot = await db.doc(documentPath).get();
      return snapshot.exists ? { id: snapshot.id, data: snapshot.data() as Record<string, unknown> } : null;
    },
    async listDocuments(collectionName, filters): Promise<DocumentView[]> {
      let query: FirebaseFirestore.Query = db.collection(collectionName);
      for (const filter of filters) query = query.where(filter.field, "==", filter.value);
      const snapshot = await query.get();
      return snapshot.docs.map((document) => ({ id: document.id, data: document.data() as Record<string, unknown> }));
    },
    async getAuthUser(uid: string): Promise<AuthUserView | null> {
      try {
        const user = await getAuth().getUser(uid);
        return { uid: user.uid, disabled: user.disabled, customClaims: user.customClaims ?? {} };
      } catch (error) {
        if ((error as { code?: string }).code === "auth/user-not-found") return null;
        throw error;
      }
    },
  };
}

function minimalFailure(projectId: string, tenantId: string, code: string): CertificationReport {
  const now = new Date().toISOString();
  return {
    tool: { name: VERIFIER_NAME, schemaVersion: 1 },
    execution: { mode: "READ_ONLY", projectId, empresaId: tenantId, startedAt: now, completedAt: now },
    automatedVerdict: "BLOCKED",
    overall: "BLOCKED",
    checks: [{ code, status: "BLOCKED", summary: "La ejecución no pudo comenzar; no se realizaron escrituras." }],
    manualGates: [],
  };
}

function writeReport(report: CertificationReport, outputPath: string | undefined, tenantId: string): string {
  const target = outputPath ?? path.join("artifacts", "p0-01", `${tenantId}-${Date.now()}.json`);
  const absolute = path.resolve(target);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  const evidenceHash = createHash("sha256").update(JSON.stringify(report)).digest("hex");
  fs.writeFileSync(absolute, `${JSON.stringify({ ...report, evidenceHash }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return absolute;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const parsed = JSON.parse(fs.readFileSync(args.expectationsPath, "utf8")) as unknown;
  const expectations = validateExpectations(parsed);
  if (!expectations.valid) throw new Error(`EXPECTATIONS_INVALID:${expectations.errors.join(",")}`);
  if (expectations.value.empresaId !== args.tenantId) throw new Error("TENANT_EXPECTATIONS_MISMATCH");
  initializeReadOnlyFirebase(args.projectId);
  const report = await verifyTenant(createSource(getFirestore()), expectations.value, { projectId: args.projectId });
  const reportPath = writeReport(report, args.outputPath, args.tenantId);
  console.log(`P0-01 ${report.overall} — automatizado=${report.automatedVerdict}`);
  console.log(`Evidencia local: ${reportPath}`);
  process.exitCode = report.overall === "PASS" ? 0 : 1;
}

main().catch((error: unknown) => {
  const args = process.argv.slice(2);
  const projectId = args[args.indexOf("--project-id") + 1] ?? "unknown";
  const tenantId = args[args.indexOf("--tenant-id") + 1] ?? "unknown";
  const code = error instanceof Error ? error.message.split(":", 1)[0] : "EXECUTION_FAILED";
  const report = minimalFailure(projectId, tenantId, code || "EXECUTION_FAILED");
  try {
    const reportPath = writeReport(report, undefined, tenantId);
    console.error(`P0-01 BLOCKED — evidencia local: ${reportPath}`);
  } catch {
    console.error("P0-01 BLOCKED — no se pudo crear la evidencia local.");
  }
  process.exitCode = 1;
});
