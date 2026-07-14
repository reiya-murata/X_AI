import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} from "firebase/functions";
import { connectFirebaseEmulators } from "./firebaseEmulators";
import { buildClientEnvironment, evaluateClientEnvironment } from "../environmentSafety";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "emulator-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "x-reply-intelligence.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" ? "demo-x-reply-intelligence" : "x-reply-intelligence"),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "x-reply-intelligence.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:000000000000:web:0000000000000000000000",
};

const requestedFirebase =
  import.meta.env.VITE_USE_FIREBASE === "true" || import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
export const clientEnvironment = buildClientEnvironment(import.meta.env, window.location.hostname);
export const environmentSafety = evaluateClientEnvironment(clientEnvironment);
export const firebaseEnabled = requestedFirebase && environmentSafety.ok;

const app = firebaseEnabled ? initializeApp(firebaseConfig) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const functions = app ? getFunctions(app, "asia-northeast1") : null;

if (firebaseEnabled && import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectFirebaseEmulators({
    auth,
    db,
    functions,
    connectAuthEmulator,
    connectFirestoreEmulator,
    connectFunctionsEmulator,
  });
}

export const runtimeInfo = {
  firebase: firebaseEnabled,
  firebaseTarget: import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" ? "Emulator" : "Production",
  dataSource: firebaseEnabled ? "Firestore" : "Local Demo",
  xApi: import.meta.env.VITE_USE_X_API_MOCK === "false" ? "Real" : "Mock",
  projectId: firebaseConfig.projectId,
  environmentSafety,
  appEnv: clientEnvironment.appEnv,
  functionsEnv: clientEnvironment.functionsEnv,
  openAi: clientEnvironment.openAiMock ? "Mock" : "Real",
  automaticPosting: false,
  releaseCandidateVersion: import.meta.env.VITE_RELEASE_CANDIDATE_VERSION || "phase5.3-rc1",
  gitCommitHash: import.meta.env.VITE_RELEASE_GIT_COMMIT || "unknown",
  buildTimestamp: import.meta.env.VITE_RELEASE_BUILD_TIMESTAMP || new Date().toISOString(),
  workingTreeDirty: import.meta.env.VITE_RELEASE_WORKTREE_DIRTY === "true",
  buildStatus: import.meta.env.VITE_RELEASE_BUILD_STATUS || "未確定ビルド",
  unconfirmedItems: (() => {
    try {
      return JSON.parse(import.meta.env.VITE_RELEASE_UNCONFIRMED_ITEMS || "[]");
    } catch {
      return [];
    }
  })(),
};

export function isLocalEmulatorMode() {
  return import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true" && firebaseConfig.projectId.startsWith("demo-");
}

export function shouldAutoLoginLocalAdmin() {
  if (import.meta.env.VITE_LOCAL_AUTO_LOGIN !== "true") return false;
  if (!isLocalEmulatorMode()) return false;
  const host = window.location.hostname;
  return host === "127.0.0.1" || host === "localhost";
}

export function getLocalAdminCredentials() {
  return {
    email: import.meta.env.VITE_LOCAL_ADMIN_EMAIL || "dev-admin@local.test",
    password: import.meta.env.VITE_LOCAL_ADMIN_PASSWORD || "local-dev-only",
  };
}

let localAdminBootstrapAttempted = false;

export function shouldUseLocalQualityMode() {
  return import.meta.env.VITE_LOCAL_QUALITY_MODE === "true" && shouldAutoLoginLocalAdmin();
}

async function runWithStageTimeout(stage, fn, timeoutMs = 12000) {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timeoutId = window.setTimeout(() => {
          reject(new Error(`local auth stage timeout: ${stage}`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

export async function forceLocalAdminSession({ onStage } = {}) {
  if (!auth) throw new Error("Firebaseが未設定です。");
  const { email, password } = getLocalAdminCredentials();
  const emitStage = (stage) => {
    if (typeof onStage === "function") onStage(stage);
  };
  emitStage("auth_wait");
  const current = await runWithStageTimeout("auth_wait", async () => auth.currentUser, 6000);
  if (current) {
    let currentToken = null;
    try {
      emitStage("token_refresh");
      currentToken = await runWithStageTimeout("token_refresh", async () => current.getIdTokenResult(true), 6000);
      if (current.email === email && currentToken.claims.admin === true) {
        emitStage("admin_claim_check");
        return { changed: false, user: current, email, admin: true };
      }
    } catch {
      currentToken = null;
    }
    emitStage("sign_out");
    await runWithStageTimeout("sign_out", async () => signOut(auth), 6000);
  }
  emitStage("sign_in");
  const credential = await runWithStageTimeout("sign_in", async () => signInWithEmailAndPassword(auth, email, password), 12000);
  emitStage("token_refresh");
  const token = await runWithStageTimeout("token_refresh", async () => credential.user.getIdTokenResult(true), 12000);
  if (token.claims.admin !== true) {
    throw new Error("dev-admin@local.test に admin claim が設定されていません。");
  }
  emitStage("admin_claim_check");
  return { changed: true, user: credential.user, email, admin: true };
}

export function markLocalAdminBootstrapAttempted(value) {
  localAdminBootstrapAttempted = Boolean(value);
}

export function hasLocalAdminBootstrapAttempted() {
  return localAdminBootstrapAttempted;
}

export function watchAuth(callback) {
  if (!auth) {
    callback({ user: null, admin: false, loading: false, error: null });
    return () => {};
  }
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, admin: false, loading: false, error: null });
      return;
    }
    try {
      const token = await user.getIdTokenResult(true);
      callback({ user, admin: token.claims.admin === true, loading: false, error: null });
    } catch (error) {
      callback({ user, admin: false, loading: false, error });
    }
  });
}

export async function loginWithEmail(email, password) {
  if (!auth) throw new Error("Firebaseが未設定です。");
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  if (!auth) return;
  await signOut(auth);
}

export async function callFunction(name, data = {}) {
  if (!functions) throw new Error("Firebaseが未設定です。");
  const fn = httpsCallable(functions, name);
  const result = await fn(data);
  return result.data;
}
