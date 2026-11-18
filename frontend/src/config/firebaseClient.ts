import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  getToken as getAppCheckTokenFromSdk,
  type AppCheck,
} from 'firebase/app-check';

/**
 * Public-only Firebase client configuration (Cloudflare Pages / Vite).
 * CRITICAL RULE 4: Never put database credentials or private API keys in frontend code.
 */
const firebaseConfig = {
  apiKey: import.meta.env['VITE_FIREBASE_API_KEY'],
  authDomain: import.meta.env['VITE_FIREBASE_AUTH_DOMAIN'],
  projectId: import.meta.env['VITE_FIREBASE_PROJECT_ID'],
  storageBucket: import.meta.env['VITE_FIREBASE_STORAGE_BUCKET'],
  appId: import.meta.env['VITE_FIREBASE_APP_ID'],
};

const recaptchaEnterpriseSiteKey = import.meta.env['VITE_RECAPTCHA_ENTERPRISE_SITE_KEY'];

export function isFirebaseClientConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.apiKey !== 'your_public_firebase_web_api_key' &&
      firebaseConfig.projectId
  );
}

let clientApp: FirebaseApp | null = null;
let clientAuth: Auth | null = null;
let clientStorage: FirebaseStorage | null = null;
let clientAppCheck: AppCheck | null = null;

export function getFirebaseClientApp(): FirebaseApp {
  if (!isFirebaseClientConfigured()) {
    throw new Error(
      'Firebase client SDK is not configured yet. Provide public VITE_FIREBASE_* environment variables in frontend/.env.'
    );
  }

  if (clientApp) {
    return clientApp;
  }

  const existing = getApps()[0];
  clientApp = existing ?? initializeApp(firebaseConfig);

  if (recaptchaEnterpriseSiteKey && recaptchaEnterpriseSiteKey !== 'your_public_recaptcha_site_key') {
    clientAppCheck = initializeAppCheck(clientApp, {
      provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  }

  return clientApp;
}

export function getFirebaseClientAuth(): Auth {
  if (!clientAuth) {
    clientAuth = getAuth(getFirebaseClientApp());
  }
  return clientAuth;
}

export function getFirebaseClientStorage(): FirebaseStorage {
  if (!clientStorage) {
    clientStorage = getStorage(getFirebaseClientApp());
  }
  return clientStorage;
}

export async function getActiveAppCheckToken(): Promise<string | undefined> {
  if (!clientAppCheck) {
    return undefined;
  }
  try {
    const result = await getAppCheckTokenFromSdk(clientAppCheck, false);
    return result.token;
  } catch {
    return undefined;
  }
}
