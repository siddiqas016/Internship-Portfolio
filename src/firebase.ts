import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { firebaseConfig as defaultFirebaseConfig } from './firebase-config.ts';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function getActiveFirebaseConfig() {
  const saved = localStorage.getItem('platform_firebase_config');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.projectId && parsed.apiKey && !parsed.apiKey.includes('YOUR_API_KEY')) {
        return parsed;
      }
    } catch {
      // ignore
    }
  }
  return defaultFirebaseConfig;
}

export function isFirebaseConfigured(): boolean {
  const cfg = getActiveFirebaseConfig();
  return Boolean(
    cfg &&
    cfg.projectId &&
    cfg.projectId !== 'your-project-id' &&
    cfg.apiKey &&
    !cfg.apiKey.includes('YOUR_API_KEY') &&
    cfg.apiKey.length > 20 &&
    !cfg.apiKey.startsWith('AIzaSy_YOUR')
  );
}

const cfg = getActiveFirebaseConfig();
const existing = getApps();
export const app: FirebaseApp = existing.length > 0 ? existing[0] : initializeApp(cfg);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

export function initFirebase() {
  return { app, auth, db, storage };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid || null,
      email: auth?.currentUser?.email || null,
      emailVerified: auth?.currentUser?.emailVerified || null,
      isAnonymous: auth?.currentUser?.isAnonymous || null,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

export async function testConnection() {
  if (!db || !isFirebaseConfigured()) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client appears offline. Please check your Firebase configuration.');
    }
  }
}
