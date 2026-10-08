import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { crearFirebasePushServiceWorker } from "../firebase-push-service-worker";

const configStaging = {
  apiKey: "staging-api-key",
  authDomain: "micafe-pos-staging.firebaseapp.com",
  projectId: "micafe-pos-staging",
  storageBucket: "micafe-pos-staging.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:staging",
};

describe("configuración del service worker FCM", () => {
  it("inicializa el worker con el mismo proyecto Firebase que recibe la app", () => {
    const script = crearFirebasePushServiceWorker(configStaging);

    assert.ok(script.includes(JSON.stringify(configStaging)));
    assert.ok(script.includes('messaging.onBackgroundMessage'));
    assert.ok(script.includes('clients.openWindow(targetUrl)'));
    assert.ok(!script.includes('projectId: "micafe-pos"'));
  });

  it("falla cerrado si falta configuración Firebase pública", () => {
    assert.throws(
      () => crearFirebasePushServiceWorker({ ...configStaging, projectId: undefined }),
      /FIREBASE_PUSH_CONFIG_INCOMPLETA/,
    );
  });
});
