import { chromium, type BrowserContext } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CanalE2E } from "./web";

/** Contexto persistente: prueba el ciclo de reinicio sin asumir instalación ni Service Worker. */
export async function abrirPwa(userDataDir?: string): Promise<CanalE2E> {
  const directorio = userDataDir ?? await mkdtemp(join(tmpdir(), "r1a-e2e-pwa-"));
  const context: BrowserContext = await chromium.launchPersistentContext(directorio, { headless: true });
  return {
    page: await context.newPage(), context, cerrar: () => context.close(),
    reiniciar: async () => { await context.close(); return abrirPwa(directorio); },
  };
}
