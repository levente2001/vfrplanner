import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { initializeFirestore, type Firestore } from "firebase/firestore/lite";
import { firebaseConfig, isFirebaseConfigured } from "./config";

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

export function getFirebaseServices() {
  if (!isFirebaseConfigured()) return null;
  app ??= initializeApp(firebaseConfig);
  auth ??= getAuth(app);
  db ??= initializeFirestore(app, {});
  return { app, auth, db };
}
