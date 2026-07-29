import { _electron, type ElectronApplication } from "playwright";
import type { CanalE2E } from "./web";

export async function abrirElectron(registrarLog?: (mensaje: string) => void): Promise<CanalE2E> {
  const app: ElectronApplication = await _electron.launch({
    args: ["."],
    env: { ...process.env, NODE_ENV: "development", NEXT_PUBLIC_USE_EMULATORS: "1" },
  });
  const proceso = app.process();
  proceso.stdout?.on("data", (dato: Buffer) => registrarLog?.(`[electron:stdout] ${dato.toString()}`));
  proceso.stderr?.on("data", (dato: Buffer) => registrarLog?.(`[electron:stderr] ${dato.toString()}`));
  const page = await app.firstWindow();
  return {
    page, context: page.context(), cerrar: () => app.close(),
    reiniciar: async () => { await app.close(); return abrirElectron(registrarLog); },
  };
}
