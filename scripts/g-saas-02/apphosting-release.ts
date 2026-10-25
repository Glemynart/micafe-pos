import type {
  AppHostingBuildObservation,
  AppHostingObservation,
  AppHostingTrafficSplitObservation,
} from "./release-evidence-core";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface AppHostingCollectionOptions {
  projectId: string;
  locationId: string;
  backendId: string;
  accessToken: string;
  fetcher?: FetchLike;
}

interface ReadResult {
  value: Record<string, unknown> | null;
  error?: string;
}

const APPHOSTING_PROJECT_NUMBERS: Readonly<Record<string, string>> = {
  "micafe-pos": "882525811433",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resourcePath(options: Pick<AppHostingCollectionOptions, "projectId" | "locationId" | "backendId">): string {
  return `projects/${options.projectId}/locations/${options.locationId}/backends/${options.backendId}`;
}

function apiUrl(resource: string, fields: string, query: Record<string, string> = {}): string {
  const url = new URL(`https://firebaseapphosting.googleapis.com/v1/${resource}`);
  url.searchParams.set("fields", fields);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url.toString();
}

async function readJson(
  url: string,
  accessToken: string,
  fetcher: FetchLike,
  description: string,
): Promise<ReadResult> {
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return { value: null, error: `${description} no pudo leerse (${response.status}).` };
    const body: unknown = await response.json();
    if (!isRecord(body)) return { value: null, error: `${description} devolvió una respuesta no interpretable.` };
    return { value: body };
  } catch {
    return { value: null, error: `${description} no pudo completar la lectura solicitada.` };
  }
}

function canonicalChildResourceName(
  name: unknown,
  options: Pick<AppHostingCollectionOptions, "projectId" | "locationId" | "backendId">,
  kind: "builds" | "rollouts",
): string | null {
  // Traffic may reference a child using the numeric project number, while rollout/build responses use the project ID.
  // Canonicalize only after matching the requested region and backend so those representations join safely.
  if (typeof name !== "string") return null;
  const match = /^projects\/([^/]+)\/locations\/([^/]+)\/backends\/([^/]+)\/(builds|rollouts)\/([^/]+)$/.exec(name);
  if (!match) return null;
  const [, projectRef, locationId, backendId, resourceKind, resourceId] = match;
  if (projectRef !== options.projectId && APPHOSTING_PROJECT_NUMBERS[options.projectId] !== projectRef) return null;
  if (locationId !== options.locationId || backendId !== options.backendId || resourceKind !== kind) return null;
  return `${resourcePath(options)}/${kind}/${resourceId}`;
}

function parseTrafficSplits(
  value: unknown,
  options: Pick<AppHostingCollectionOptions, "projectId" | "locationId" | "backendId">,
): AppHostingTrafficSplitObservation[] {
  if (!isRecord(value) || !Array.isArray(value.splits)) return [];
  return value.splits.flatMap((split): AppHostingTrafficSplitObservation[] => {
    if (!isRecord(split) || typeof split.build !== "string" || typeof split.percent !== "number") return [];
    return [{ build: split.build, canonicalBuild: canonicalChildResourceName(split.build, options, "builds"), percent: split.percent }];
  });
}

function imageDigest(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.match(/@sha256:([0-9a-f]{64})$/i)?.[1]?.toLowerCase() ?? null;
}

function codebaseSha(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.codebase)) return null;
  const hash = value.codebase.hash;
  return typeof hash === "string" && /^[0-9a-f]{40}$/i.test(hash) ? hash.toLowerCase() : null;
}

async function listRollouts(
  options: Pick<AppHostingCollectionOptions, "projectId" | "locationId" | "backendId">,
  backendPath: string,
  accessToken: string,
  fetcher: FetchLike,
  servingBuildNames: ReadonlySet<string>,
): Promise<{ states: Map<string, string>; error?: string }> {
  const states = new Map<string, string>();
  let pageToken: string | undefined;
  let pagesRead = 0;
  do {
    const query: Record<string, string> = { pageSize: "100" };
    if (pageToken) query.pageToken = pageToken;
    const response = await readJson(
      apiUrl(`${backendPath}/rollouts`, "rollouts(name,build,state),nextPageToken", query),
      accessToken,
      fetcher,
      "La lista de rollouts de App Hosting",
    );
    if (!response.value) return { states, error: response.error };
    const rollouts = Array.isArray(response.value.rollouts) ? response.value.rollouts : [];
    for (const item of rollouts) {
      if (!isRecord(item)
        || !canonicalChildResourceName(item.name, options, "rollouts")
        || typeof item.build !== "string"
        || typeof item.state !== "string") continue;
      const canonicalBuild = canonicalChildResourceName(item.build, options, "builds");
      if (!canonicalBuild || !servingBuildNames.has(canonicalBuild)) continue;
      if (item.state === "SUCCEEDED") states.set(canonicalBuild, item.state);
    }
    pageToken = typeof response.value.nextPageToken === "string" ? response.value.nextPageToken : undefined;
    pagesRead += 1;
    if ([...servingBuildNames].every((name) => states.has(name))) break;
  } while (pageToken && pagesRead < 100);

  if (pageToken && pagesRead >= 100 && [...servingBuildNames].some((name) => !states.has(name))) {
    return { states, error: "La lista de rollouts de App Hosting superó el límite de páginas de lectura." };
  }
  return { states };
}

export async function collectAppHostingReleaseEvidence(
  options: AppHostingCollectionOptions,
): Promise<{ observation: AppHostingObservation | null; error?: string }> {
  const { projectId, locationId, backendId, accessToken } = options;
  const fetcher = options.fetcher ?? fetch;
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(projectId)
    || !/^[a-z0-9][a-z0-9-]*$/.test(locationId)
    || !/^[a-z][a-z0-9-]{0,62}$/.test(backendId)) {
    return { observation: null, error: "El proyecto, región o backend de App Hosting tiene un formato no permitido." };
  }
  if (!accessToken.trim()) return { observation: null };

  const backendPath = resourcePath(options);
  const backend = await readJson(
    apiUrl(backendPath, "name,uri,reconciling"),
    accessToken,
    fetcher,
    "El backend de App Hosting",
  );
  if (!backend.value) return { observation: null, error: backend.error };

  const traffic = await readJson(
    apiUrl(`${backendPath}/traffic`, "name,current(splits(build,percent)),reconciling,updateTime"),
    accessToken,
    fetcher,
    "El tráfico de App Hosting",
  );
  if (!traffic.value) return { observation: null, error: traffic.error };

  const backendName = typeof backend.value.name === "string" ? backend.value.name : "";
  const trafficName = typeof traffic.value.name === "string" ? traffic.value.name : "";
  const currentTrafficSplits = parseTrafficSplits(traffic.value.current, options);
  const servingBuildNames = new Set(currentTrafficSplits
    .filter((split) => split.percent > 0 && split.canonicalBuild !== null)
    .map((split) => split.canonicalBuild as string));
  const expectedBackendPath = backendPath;
  if (backendName !== expectedBackendPath || trafficName !== `${expectedBackendPath}/traffic`) {
    return { observation: null, error: "App Hosting devolvió recursos que no corresponden al backend solicitado." };
  }
  if (currentTrafficSplits.some((split) => split.percent > 0 && split.canonicalBuild === null)) {
      return { observation: null, error: "El tráfico de App Hosting referencia un build fuera del backend solicitado." };
  }

  const rolloutResult = await listRollouts(options, backendPath, accessToken, fetcher, servingBuildNames);
  if (rolloutResult.error) return { observation: null, error: rolloutResult.error };

  const builds = await Promise.all([...servingBuildNames].map(async (name): Promise<AppHostingBuildObservation> => {
    const result = await readJson(
      apiUrl(name, "name,source(codebase(hash)),state,image"),
      accessToken,
      fetcher,
      "El build activo de App Hosting",
    );
    if (!result.value) throw new Error(result.error ?? "El build activo de App Hosting no pudo leerse.");
    const resourceName = typeof result.value.name === "string" ? result.value.name : "";
    if (canonicalChildResourceName(resourceName, options, "builds") !== name) {
      throw new Error("App Hosting devolvió un build distinto del solicitado.");
    }
    return {
      name,
      resourceName,
      state: typeof result.value.state === "string" ? result.value.state : "UNKNOWN",
      sourceSha: codebaseSha(result.value.source),
      imageDigest: imageDigest(result.value.image),
      rolloutState: rolloutResult.states.get(name) ?? null,
    };
  })).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "El build activo de App Hosting no pudo leerse." }));
  if (!Array.isArray(builds)) return { observation: null, error: builds.error };

  return {
    observation: {
      projectId,
      locationId,
      backendId,
      backendName,
      backendUri: typeof backend.value.uri === "string" ? backend.value.uri : null,
      backendReconciled: backend.value.reconciling === false,
      trafficReconciled: traffic.value.reconciling === false,
      trafficUpdateTime: typeof traffic.value.updateTime === "string" ? traffic.value.updateTime : null,
      currentTrafficSplits,
      builds,
    },
  };
}
