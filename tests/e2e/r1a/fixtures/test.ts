import { appendFileSync, writeFileSync } from "node:fs";
import { test as base, expect, type Browser, type TestInfo } from "@playwright/test";
import type { CanalE2E } from "../drivers/web";
import { abrirWeb } from "../drivers/web";
import { abrirPwa } from "../drivers/pwa";
import { abrirElectron } from "../drivers/electron";

type Fixtures = { canal: CanalE2E };
const finalizarRegistro = new WeakMap<CanalE2E, () => void>();

export async function crearCanal(projectName: string, browser: Browser, testInfo: TestInfo): Promise<CanalE2E> {
  const log = testInfo.outputPath("runtime.log");
  writeFileSync(log, `${new Date().toISOString()} [test:start] ${testInfo.title}\n`);
  let eventos = 0;
  const registrar = (mensaje: string) => {
    eventos += 1;
    appendFileSync(log, `${new Date().toISOString()} ${mensaje}\n`);
  };
  const finalizar = () => {
    if (eventos === 0) registrar("[test:no-events] No se registraron eventos de navegador, p\u00e1gina ni Electron.");
    appendFileSync(log, `${new Date().toISOString()} [test:end] ${testInfo.title}\n`);
  };

  try {
    const canal = projectName === "electron"
      ? await abrirElectron(registrar)
      : projectName === "pwa" ? await abrirPwa() : await abrirWeb(browser);
    canal.page.on("console", (evento) => registrar(`[browser:${evento.type()}] ${evento.text()}`));
    canal.page.on("pageerror", (error) => registrar(`[browser:pageerror] ${error.stack ?? error.message}`));
    finalizarRegistro.set(canal, finalizar);
    return canal;
  } catch (error) {
    registrar(`[test:setup-error] ${error instanceof Error ? error.message : String(error)}`);
    finalizar();
    throw error;
  }
}

export const test = base.extend<Fixtures>({
  canal: async ({ browser }, use, testInfo) => {
    const canal = await crearCanal(testInfo.project.name, browser as Browser, testInfo);
    try {
      await use(canal);
    } finally {
      try {
        await canal.cerrar();
      } finally {
        finalizarRegistro.get(canal)?.();
      }
    }
  },
});

export { expect };
