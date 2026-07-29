import type { Browser, BrowserContext, Page } from "@playwright/test";

export interface CanalE2E { page: Page; context: BrowserContext; cerrar(): Promise<void>; reiniciar?(): Promise<CanalE2E>; }

export async function abrirWeb(browser: Browser): Promise<CanalE2E> {
  const context = await browser.newContext();
  return { page: await context.newPage(), context, cerrar: () => context.close() };
}
