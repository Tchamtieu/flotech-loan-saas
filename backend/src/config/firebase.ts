import admin from 'firebase-admin';
import { env } from './env.js';

export interface DecodedFirebaseIdentity {
  uid: string;
  email?: string;
  name?: string;
}

export interface FirebaseVerifierPort {
  verifyIdToken(idToken: string, checkRevoked?: boolean): Promise<DecodedFirebaseIdentity>;
  verifyAppCheckToken(appCheckToken: string): Promise<void>;
}

let firebaseApp: admin.app.App | null = null;

export function getFirebaseAdminApp(): admin.app.App {
  if (firebaseApp) {
    return firebaseApp;
  }

  if (admin.apps.length > 0 && admin.apps[0]) {
    firebaseApp = admin.apps[0];
    return firebaseApp;
  }

  firebaseApp = admin.initializeApp({
    projectId: env.FIREBASE_PROJECT_ID,
    storageBucket: env.FIREBASE_STORAGE_BUCKET,
  });

  return firebaseApp;
}

const defaultFirebaseVerifier: FirebaseVerifierPort = {
  async verifyIdToken(idToken: string, checkRevoked = true): Promise<DecodedFirebaseIdentity> {
    const decoded = await getFirebaseAdminApp().auth().verifyIdToken(idToken, checkRevoked);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: typeof decoded['name'] === 'string' ? decoded['name'] : undefined,
    };
  },
  async verifyAppCheckToken(appCheckToken: string): Promise<void> {
    await getFirebaseAdminApp().appCheck().verifyToken(appCheckToken);
  },
};

let activeFirebaseVerifier: FirebaseVerifierPort = defaultFirebaseVerifier;

/**
 * Returns the active Firebase Auth & App Check verifier.
 */
export function getFirebaseVerifier(): FirebaseVerifierPort {
  return activeFirebaseVerifier;
}

/**
 * Allows automated integration tests (`NODE_ENV === 'test'`) to inject a controlled
 * Firebase token & App Check verifier while exercising real PostgreSQL queries and middleware.
 */
export function setFirebaseVerifierForTesting(verifier: FirebaseVerifierPort | null): void {
  if (env.NODE_ENV !== 'test') {
    throw new Error('SECURITY_VIOLATION: Firebase verifier override is only permitted in NODE_ENV=test.');
  }
  activeFirebaseVerifier = verifier ?? defaultFirebaseVerifier;
}
