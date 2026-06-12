importScripts('/firebase-app-compat.js');
importScripts('/firebase-messaging-compat.js');

const firebaseConfig = {
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
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  var title = 'CafePOS';
  if (payload && payload.notification && payload.notification.title) {
    title = payload.notification.title;
  }
  
  var body = '';
  if (payload && payload.notification && payload.notification.body) {
    body = payload.notification.body;
  }

  var notificationOptions = {
    body: body,
    icon: '/cafe-atrato-icon.png'
  };
  
  self.registration.showNotification(title, notificationOptions);
});
