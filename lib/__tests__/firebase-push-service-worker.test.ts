import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Script } from "node:vm";
import { leerContenidoPush } from "../fcm-notification-content";
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
    assert.doesNotThrow(() => new Script(script));
  });

  it("falla cerrado si falta configuración Firebase pública", () => {
    assert.throws(
      () => crearFirebasePushServiceWorker({ ...configStaging, projectId: undefined }),
      /FIREBASE_PUSH_CONFIG_INCOMPLETA/,
    );
  });

  it("presenta una sola notificación de fondo para payloads notification o data-only", async () => {
    const script = crearFirebasePushServiceWorker(configStaging);
    const notifications: Array<{ title: string; options: Record<string, unknown> }> = [];
    const handlers: Record<string, (value: any) => unknown> = {};
    const firebase = {
      apps: [] as unknown[],
      initializeApp(config: typeof configStaging) { this.apps.push({ config }); },
      messaging() {
        return { onBackgroundMessage(handler: (payload: any) => unknown) { handlers.background = handler; } };
      },
    };
    const context = {
      importScripts() {},
      firebase,
      self: {
        registration: { showNotification(title: string, options: Record<string, unknown>) { notifications.push({ title, options }); } },
        addEventListener(name: string, handler: (value: any) => unknown) { handlers[name] = handler; },
      },
      clients: {},
      URL,
    };

    new Script(script).runInNewContext(context);
    await handlers.background({
      notification: { title: "Firebase la muestra", body: "No duplicar" },
      data: { url: "/admin/agenda" },
    });
    assert.equal(notifications.length, 0);

    await handlers.background({ data: { title: "Recordatorio", body: "Atender pedido", url: "/admin/agenda" } });
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.title, "Recordatorio");
    assert.equal(notifications[0]?.options.body, "Atender pedido");
    assert.equal(notifications[0]?.options.icon, "/placeholder-logo.png");
    assert.equal((notifications[0]?.options.data as { url?: string }).url, "/admin/agenda");
  });

  it("lee contenido notification heredado y data-only para el handler foreground", () => {
    assert.deepEqual(leerContenidoPush({ data: { title: "Agenda", body: "Pedido para hoy" } }), {
      title: "Agenda", body: "Pedido para hoy",
    });
    assert.deepEqual(leerContenidoPush({ notification: { title: "Venta", body: "Pendiente" } }), {
      title: "Venta", body: "Pendiente",
    });
    assert.equal(leerContenidoPush({ data: { title: "incompleto" } }), null);
  });
});
