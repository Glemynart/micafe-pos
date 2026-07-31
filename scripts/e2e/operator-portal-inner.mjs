import { spawnSync } from "node:child_process";

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["playwright", "test", "-c", "playwright.operator-portal.config.ts"], {
  cwd: process.cwd(), env: process.env, stdio: "inherit", shell: process.platform === "win32",
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
