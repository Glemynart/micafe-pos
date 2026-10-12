export function createRulesApiHeaders(projectId: string, accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "x-goog-user-project": projectId,
  };
}
