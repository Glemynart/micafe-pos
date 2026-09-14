import { spawnSync } from "node:child_process"

const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", ["playwright", "test", "-c", "playwright.bodega.config.ts"], {
  cwd: process.cwd(), env: process.env, stdio: "inherit", shell: process.platform === "win32",
})
if (result.error) console.error(result.error)
process.exitCode = result.status ?? (result.error ? 1 : 0)
