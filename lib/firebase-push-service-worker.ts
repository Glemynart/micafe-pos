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

  if (payload && payload.notification) {
    if (payload.notification.title) title = payload.notification.title;
    if (payload.notification.body) body = payload.notification.body;
  }

  if (payload && payload.data && payload.data.url) {
    url = payload.data.url;
  }

  var notificationOptions = {
    body: body,
    icon: '/placeholder-logo.png',
    data: { url: url }
  };

  self.registration.showNotification(title, notificationOptions);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  var targetUrl = (event.notification.data && event.notification.data.url) || '/admin';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        var clientUrl = new URL(client.url);
        if (clientUrl.pathname.startsWith('/admin') && 'focus' in client) {
          client.focus();
          client.navigate(targetUrl);
          return;
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
`;
}
