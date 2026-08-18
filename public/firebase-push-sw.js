importScripts('/firebase-app-compat.js');
importScripts('/firebase-messaging-compat.js');

var firebaseConfig = {
  apiKey: "AIzaSyCVTjnTrEpRCSHWdN0g5-TKJfVDNUIOvD8",
  authDomain: "micafe-pos.firebaseapp.com",
  projectId: "micafe-pos",
  storageBucket: "micafe-pos.firebasestorage.app",
  messagingSenderId: "882525811433",
  appId: "1:882525811433:web:27a44f97b72df9ec4bb678"
};

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
