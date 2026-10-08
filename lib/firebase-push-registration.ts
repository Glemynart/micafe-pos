export const FIREBASE_PUSH_SERVICE_WORKER_SCOPE = "/firebase-push/";

export function registrarFirebasePushServiceWorker(
  serviceWorker: Pick<ServiceWorkerContainer, "register">,
): Promise<ServiceWorkerRegistration> {
  return serviceWorker
    .register("/firebase-push-sw.js", {
      scope: FIREBASE_PUSH_SERVICE_WORKER_SCOPE,
    })
    .then(esperarFirebasePushServiceWorkerActivo);
}

function esperarFirebasePushServiceWorkerActivo(
  registration: ServiceWorkerRegistration,
): Promise<ServiceWorkerRegistration> {
  if (registration.active?.state === "activated") {
    return Promise.resolve(registration);
  }

  const worker = registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) {
    return Promise.reject(new Error("FIREBASE_PUSH_SERVICE_WORKER_NOT_ACTIVE"));
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => worker.removeEventListener("statechange", onStateChange);
    const onStateChange = () => {
      if (registration.active?.state === "activated") {
        cleanup();
        resolve(registration);
      } else if (worker.state === "redundant") {
        cleanup();
        reject(new Error("FIREBASE_PUSH_SERVICE_WORKER_ACTIVATION_FAILED"));
      }
    };

    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}
