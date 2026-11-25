/**
 * Firebase web-app configuration. These identifiers are public by design (they ship in every browser bundle);
 * access control is enforced by Security Rules + App Check, never by hiding them.
 * Environment variables win; the fallbacks are this project's public web config so a deploy without env still works.
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyBymkP9fJNuTluDeUk-fzHjjeA2TePzKXk',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'imransiteinfo.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? 'imransiteinfo',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'imransiteinfo.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '983681810895',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '1:983681810895:web:48a8ebf68acc74d61752ba',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? 'G-TXKQF2TKBX'
} as const;

export const appCheckSiteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? '';
export const appCheckDebugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN ?? '';
export const analyticsEnabled = process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true';
export const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';
