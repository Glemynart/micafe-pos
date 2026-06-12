importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCVTjnTrEpRCSHWdN0g5-TKJfVDNUIOvD8",
  authDomain: "micafe-pos.firebaseapp.com",
  projectId: "micafe-pos",
  storageBucket: "micafe-pos.firebasestorage.app",
  messagingSenderId: "882525811433",
  appId: "1:882525811433:web:27a44f97b72df9ec4bb678"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification?.title || 'CaféPOS';
  const notificationOptions = {
    body: payload.notification?.body,
    icon: '/cafe-atrato-icon.png',
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});
