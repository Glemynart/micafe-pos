import { createHash } from "node:crypto";
import { closeSync, openSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DianaCatalogOfflinePlan } from "./catalog-review-validation-core.js";

function comparisonPath(filePath: string): string {
  const normalized = path.normalize(filePath);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

export function writeDianaCatalogOfflinePlan(
  plan: DianaCatalogOfflinePlan,
  outputPath: string,
  protectedInputPaths: readonly string[],
): string {
  const resolvedOutputPath = path.resolve(outputPath);
  const outputDirectory = realpathSync(path.dirname(resolvedOutputPath));
  const canonicalOutputPath = path.join(outputDirectory, path.basename(resolvedOutputPath));
  const targetComparisonPath = comparisonPath(canonicalOutputPath);
  for (const inputPath of protectedInputPaths) {
    const canonicalInputPath = realpathSync(inputPath);
    if (comparisonPath(canonicalInputPath) === targetComparisonPath) {
      throw new Error("La ruta de salida no puede coincidir con el archivo fuente o de revisión.");
    }
  }

  const content = Buffer.from(JSON.stringify(plan, null, 2) + String.fromCharCode(10), "utf8");
  const fileDescriptor = openSync(canonicalOutputPath, "wx", 0o600);
  try {
    writeFileSync(fileDescriptor, content);
  } finally {
    closeSync(fileDescriptor);
  }
  return createHash("sha256").update(content).digest("hex");
}
