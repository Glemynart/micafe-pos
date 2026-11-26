const STAGING_PROJECT_ID = "micafe-pos-staging";
const STAGING_SERVICE_ACCOUNT = "saas-legal-runtime@micafe-pos-staging.iam.gserviceaccount.com";

/** Uses the dedicated legal runtime only in staging; production remains on its prior identity. */
export function obtenerCuentaRuntimeLegal(projectId: string | undefined): string {
  return projectId === STAGING_PROJECT_ID ? STAGING_SERVICE_ACCOUNT : "default";
}
