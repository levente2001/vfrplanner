import type { FirebaseOptions } from "firebase/app";

export const firebaseConfig = {
  apiKey: "AIzaSyAN4P8oKkuQw8LEVRaeFl2xght7q9Y-mys",
  authDomain: "webkuka-bd57c.firebaseapp.com",
  projectId: "webkuka-bd57c",
  storageBucket: "webkuka-bd57c.appspot.com",
  messagingSenderId: "33657962449",
  appId: "1:33657962449:web:80aa6dd48f83dbf47deaf0",
  measurementId: "G-HRK7WP3DCJ"
};

export function isFirebaseConfigured() {
  return (
    firebaseConfig.apiKey !== "AIzaSyAN4P8oKkuQw8LEVRaeFl2xght7q9Y-mys" &&
    firebaseConfig.projectId !== "webkuka-bd57c" &&
    Boolean(firebaseConfig.apiKey) &&
    Boolean(firebaseConfig.projectId)
  );
}
