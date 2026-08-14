export const FIRESTORE_ADMIN_API_ORIGIN = "https://firestore.googleapis.com/v1";

function encodePath(value: string): string {
  return value.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export type RecoveryApiResponse = {
  ok: boolean;
  status: number | null;
  body: unknown;
  error?: string;
};

function parseBody(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

async function request(
  method: "GET" | "POST",
  path: string,
  accessToken: string,
  body?: Record<string, unknown>,
): Promise<RecoveryApiResponse> {
  if (!accessToken.trim()) {
    return { ok: false, status: null, body: null, error: "FIREBASE_ACCESS_TOKEN está vacío." };
  }

  try {
    const response = await fetch(FIRESTORE_ADMIN_API_ORIGIN + "/" + path, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + accessToken,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const rawBody = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body: parseBody(rawBody),
      ...(!response.ok
        ? { error: "Firestore Admin API respondió HTTP " + response.status + "." }
        : {}),
    };
  } catch (error: unknown) {
    return {
      ok: false,
      status: null,
      body: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function describeRecoveryBackup(
  sourceBackup: string,
  accessToken: string,
): Promise<RecoveryApiResponse> {
  return request("GET", sourceBackup, accessToken);
}

export function requestRecoveryRestore(
  projectId: string,
  sourceBackup: string,
  destinationDatabase: string,
  accessToken: string,
): Promise<RecoveryApiResponse> {
  return request(
    "POST",
    "projects/" + projectId + "/databases:restore",
    accessToken,
    { databaseId: destinationDatabase, backup: sourceBackup },
  );
}

export function getRecoveryDatabase(
  projectId: string,
  databaseId: string,
  accessToken: string,
): Promise<RecoveryApiResponse> {
  return request(
    "GET",
    "projects/" + encodePath(projectId) + "/databases/" + encodeURIComponent(databaseId),
    accessToken,
  );
}

export function getRecoveryDocument(
  projectId: string,
  databaseId: string,
  collectionId: string,
  documentId: string,
  accessToken: string,
): Promise<RecoveryApiResponse> {
  return request(
    "GET",
    "projects/" + encodePath(projectId)
      + "/databases/" + encodeURIComponent(databaseId)
      + "/documents/" + encodePath(collectionId)
      + "/" + encodePath(documentId),
    accessToken,
  );
}
