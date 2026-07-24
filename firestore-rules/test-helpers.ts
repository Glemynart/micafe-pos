import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import type { Fixture } from "./fixtures";

export const RULES_TEST_PROJECT_ID = "demo-mt-u4-rules";
const DEFAULT_FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";

let environment: RulesTestEnvironment | undefined;

/** Carga las Rules locales en el Firestore Emulator iniciado por test:rules. */
export async function rulesTestEnvironment(): Promise<RulesTestEnvironment> {
  if (!environment) {
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? DEFAULT_FIRESTORE_EMULATOR_HOST).split(":");

    environment = await initializeTestEnvironment({
      projectId: RULES_TEST_PROJECT_ID,
      firestore: {
        host,
        port: Number(port),
        rules: await readFile(path.resolve(process.cwd(), "firestore.rules"), "utf8"),
      },
    });
  }

  return environment;
}

/** Construye un contexto anónimo o autenticado exclusivamente desde fixtures de claims. */
export async function contextFor(fixture: Fixture): Promise<RulesTestContext> {
  const env = await rulesTestEnvironment();
  return fixture
    ? env.authenticatedContext(fixture.uid, fixture.claims)
    : env.unauthenticatedContext();
}

/** Limpia por completo los datos del proyecto demo entre casos de prueba. */
export async function clearRulesData(): Promise<void> {
  const env = await rulesTestEnvironment();
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    await Promise.all([
      context.firestore().doc("empresas/empresa-a").set({ estado: "trial" }),
      context.firestore().doc("empresas/empresa-b").set({ estado: "trial" }),
    ]);
  });
}

/** Siembra datos sin Rules para preparar precondiciones de un caso de prueba. */
export async function seedDocument(path: string, data: Record<string, unknown>): Promise<void> {
  const env = await rulesTestEnvironment();
  await env.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set(data);
  });
}

/** Simula una escritura de backend/Admin SDK, que no se evalúa contra Rules. */
export async function writeAsBackend(path: string, data: Record<string, unknown>): Promise<void> {
  await seedDocument(path, data);
}

/** Cierra contextos y conexiones del SDK para que el runner pueda finalizar limpiamente. */
export async function cleanupRulesTestEnvironment(): Promise<void> {
  if (environment) {
    await environment.cleanup();
    environment = undefined;
  }
}

export const expectAllowed = assertSucceeds;
export const expectDenied = assertFails;
