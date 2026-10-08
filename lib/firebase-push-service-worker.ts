type FirebasePushConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

const REQUIRED_CONFIG_KEYS = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId",
] as const;

export function crearFirebasePushServiceWorker(config: FirebasePushConfig): string {
  if (REQUIRED_CONFIG_KEYS.some((key) => !config[key]?.trim())) {
    throw new Error("FIREBASE_PUSH_CONFIG_INCOMPLETA");
  }

  const serializedConfig = JSON.stringify(Object.fromEntries(
    REQUIRED_CONFIG_KEYS.map((key) => [key, config[key]]),
  ));

  return `importScripts('/firebase-app-compat.js');
importScripts('/firebase-messaging-compat.js');

var firebaseConfig = ${serializedConfig};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
var messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title = 'POS Empresarial';
  var body = '';
  var url = '/admin';
  var hasNotificationPayload = Boolean(payload && payload.notification);

  if (payload && payload.notification) {
    if (payload.notification.title) title = payload.notification.title;
    if (payload.notification.body) body = payload.notification.body;
  }

  if (payload && payload.data) {
    if (payload.data.title) title = payload.data.title;
    if (payload.data.body) body = payload.data.body;
    if (payload.data.url) url = payload.data.url;
  }

  var notificationOptions = {
    body: body,
    icon: '/placeholder-logo.png',
    data: { url: url }
  };

  // FCM displays notification payloads automatically. Only data-only messages
  // need a custom notification here, otherwise the user would see two alerts.
  if (!hasNotificationPayload) {
    return self.registration.showNotification(title, notificationOptions);
  }
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var targetUrl = (event.notification.data && event.notification.data.url) || '/admin';
  var resolvedTargetUrl = new URL(targetUrl, self.location.origin);
  if (resolvedTargetUrl.origin !== self.location.origin) return;
  var targetPath = resolvedTargetUrl.pathname;
  var isAdminTarget = targetPath === '/admin' || targetPath.indexOf('/admin/') === 0;
  var isPosTarget = targetPath === '/pos' || targetPath.indexOf('/pos/') === 0;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        var clientUrl = new URL(client.url);
        var isAdminClient = clientUrl.pathname === '/admin' || clientUrl.pathname.indexOf('/admin/') === 0;
        var isPosClient = clientUrl.pathname === '/pos' || clientUrl.pathname.indexOf('/pos/') === 0;
        if (((isAdminTarget && isAdminClient) || (isPosTarget && isPosClient)) && 'focus' in client) {
          return client.focus().then(function(focusedClient) {
            if ('navigate' in focusedClient) return focusedClient.navigate(resolvedTargetUrl.href);
            return focusedClient;
          }).catch(function() {
            return clients.openWindow(targetUrl);
          });
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
`;
}
