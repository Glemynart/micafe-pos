type PushPayloadContent = {
  notification?: { title?: string | null; body?: string | null } | null;
  data?: Record<string, string | undefined> | null;
};

export function leerContenidoPush(payload: PushPayloadContent): { title: string; body: string } | null {
  const title = payload.notification?.title || payload.data?.title;
  const body = payload.notification?.body || payload.data?.body;
  return title && body ? { title, body } : null;
}
