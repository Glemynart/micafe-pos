export const FIREBASE_PUSH_SERVICE_WORKER_SCOPE = "/firebase-push/";

export function registrarFirebasePushServiceWorker(
  serviceWorker: Pick<ServiceWorkerContainer, "register">,
): Promise<ServiceWorkerRegistration> {
  return serviceWorker.register("/firebase-push-sw.js", {
    scope: FIREBASE_PUSH_SERVICE_WORKER_SCOPE,
  });
}
