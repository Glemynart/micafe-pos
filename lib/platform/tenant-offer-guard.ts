export const FIREBASE_STAGING_PROJECT_ID = "micafe-pos-staging";

export function permiteGestionOfertasTenant(
  projectId: string | undefined,
  facultades: readonly string[] | undefined,
): boolean {
  return projectId === FIREBASE_STAGING_PROJECT_ID
    && facultades?.includes("COMERCIAL_GOBERNAR") === true;
}
