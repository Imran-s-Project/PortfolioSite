/**
 * Browser-side Firebase (Auth, Firestore, App Check). Only ever imported by client components.
 * Images are not stored in Firebase: uploads go to ImgBB (src/features/admin/imgbb.ts).
 * App Check starts together with the app, before any other service is touched, so every request carries a token.
 */
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { appCheckDebugToken, appCheckSiteKey, firebaseConfig, useEmulators } from '@/config/firebase';

let app: FirebaseApp | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

function startAppCheck(a: FirebaseApp): void {
  if (typeof window === 'undefined') return;
  // Local development: set NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN=true, copy the token printed in the console into
  // Firebase console → App Check → Apps → Manage debug tokens.
  if (appCheckDebugToken) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken === 'true' ? true : appCheckDebugToken;
  if (!appCheckSiteKey) return; // not configured yet — see docs/FIREBASE_SETUP.md
  try {
    initializeAppCheck(a, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  } catch (err) {
    console.warn('[firebase] App Check could not start', err);
  }
}

export function getFirebaseApp(): FirebaseApp {
  if (app) return app;
  const existing = getApps()[0];
  app = existing ?? initializeApp(firebaseConfig);
  if (!existing) startAppCheck(app);
  return app;
}

export function getDb(): Firestore {
  if (!db) {
    db = getFirestore(getFirebaseApp());
    if (useEmulators) {
      try {
        connectFirestoreEmulator(db, '127.0.0.1', 8080);
      } catch {
        /* already connected (hot reload) */
      }
    }
  }
  return db;
}

export function getAuthClient(): Auth {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
    if (useEmulators) {
      try {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      } catch {
        /* already connected */
      }
    }
  }
  return auth;
}
