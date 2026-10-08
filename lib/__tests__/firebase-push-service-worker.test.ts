import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Script } from "node:vm";
import { leerContenidoPush } from "../fcm-notification-content";
import { registrarFirebasePushServiceWorker } from "../firebase-push-registration";
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
  it("mantiene el worker FCM en un scope separado del worker PWA raíz", async () => {
    let registeredScript = "";
    let registeredScope = "";
    const registration = {} as ServiceWorkerRegistration;
    const serviceWorker = {
      async register(script: string, options?: RegistrationOptions) {
        registeredScript = script;
        registeredScope = options?.scope ?? "";
        return registration;
      },
    } as unknown as Pick<ServiceWorkerContainer, "register">;

    assert.equal(await registrarFirebasePushServiceWorker(serviceWorker), registration);
    assert.equal(registeredScript, "/firebase-push-sw.js");
    assert.equal(registeredScope, "/firebase-push/");
  });

  it("espera a que el worker registrado esté activo antes de devolver el registro", async () => {
    const stateListeners: EventListener[] = [];
    let state: ServiceWorkerState = "installing";
    const installingWorker = {
      get state() { return state; },
      addEventListener(_type: string, listener: EventListener) {
        stateListeners.push(listener);
      },
      removeEventListener() {},
    } as unknown as ServiceWorker;
    const registration = {
      active: null,
      installing: installingWorker,
      waiting: null,
      scope: "https://bodega.example/firebase-push/",
    } as unknown as ServiceWorkerRegistration;
    const serviceWorker = {
      async register() { return registration; },
    } as unknown as Pick<ServiceWorkerContainer, "register">;

    let settled = false;
    const pendingRegistration = registrarFirebasePushServiceWorker(serviceWorker);
    void pendingRegistration.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);

    state = "activated";
    (registration as { active: ServiceWorker | null }).active = installingWorker;
    stateListeners.forEach((listener) => listener(new Event("statechange")));

    assert.equal(await pendingRegistration, registration);
    assert.equal(settled, true);
  });

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
    let finishNotification!: () => void;
    const notificationDelivery = new Promise<void>((resolve) => { finishNotification = resolve; });
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
        registration: { showNotification(title: string, options: Record<string, unknown>) { notifications.push({ title, options }); return notificationDelivery; } },
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

    const delivery = handlers.background({ data: { title: "Recordatorio", body: "Atender pedido", url: "/admin/agenda" } });
    assert.equal(delivery, notificationDelivery);
    finishNotification();
    await delivery;
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.title, "Recordatorio");
    assert.equal(notifications[0]?.options.body, "Atender pedido");
    assert.equal(notifications[0]?.options.icon, "/placeholder-logo.png");
    assert.equal((notifications[0]?.options.data as { url?: string }).url, "/admin/agenda");
  });

  it("reutiliza y espera la navegación de una pestaña POS al pulsar la notificación", async () => {
    const script = crearFirebasePushServiceWorker(configStaging);
    const handlers: Record<string, (value: any) => unknown> = {};
    const calls: string[] = [];
    let finishNavigation!: () => void;
    const navigation = new Promise((resolve) => { finishNavigation = () => resolve(client); });
    const client = {
      url: "https://bodega.example/pos",
      focus() {
        calls.push("focus");
        return Promise.resolve(this);
      },
      navigate(url: string) {
        calls.push(`navigate:${url}`);
        return navigation;
      },
    };
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
        location: { origin: "https://bodega.example" },
        registration: { showNotification() {} },
        addEventListener(name: string, handler: (value: any) => unknown) { handlers[name] = handler; },
      },
      clients: {
        async matchAll() { calls.push("matchAll"); return [client]; },
        async openWindow(url: string) { calls.push(`openWindow:${url}`); },
      },
      URL,
    };

    new Script(script).runInNewContext(context);
    let waitUntilPromise!: Promise<unknown>;
    handlers.notificationclick({
      notification: { close() { calls.push("close"); }, data: { url: "/pos" } },
      waitUntil(promise: Promise<unknown>) { waitUntilPromise = promise; },
    });

    assert.equal(typeof waitUntilPromise?.then, "function");
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(calls, ["close", "matchAll", "focus", "navigate:https://bodega.example/pos"]);

    let settled = false;
    void waitUntilPromise.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);

    finishNavigation();
    await waitUntilPromise;
    assert.equal(settled, true);
    assert.equal(calls.some((call) => call.startsWith("openWindow:")), false);
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
