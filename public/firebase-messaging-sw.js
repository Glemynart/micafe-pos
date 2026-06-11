importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// La config se inyecta desde el cliente al registrar el SW
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    firebase.initializeApp(event.data.config);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(function(payload) {
      const notificationTitle = payload.notification?.title || 'CaféPOS';
      const notificationOptions = {
        body: payload.notification?.body,
        icon: '/cafe-atrato-icon.png',
      };
      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  }
});
