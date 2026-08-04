import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const result = spawnSync(process.execPath, ["--import", "tsx", "storage-rules/run-tests.ts"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

const status = result.status === 0 ? "PASS" : "FAIL";
const evidence = {
  suite: "P2-03-storage-tenant-aware",
  status,
  projectId: "demo-p2-03-storage",
  emulatorOnly: true,
  productionWrites: false,
  boundaries: ["storage.rules", "Storage upload references", "Storage Emulator"],
  firestoreEventsChanged: false,
  generatedAt: new Date().toISOString(),
};

const outputDir = path.resolve(process.cwd(), "artifacts/e2e/p2-03");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "storage-rules.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
