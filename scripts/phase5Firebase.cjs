const admin = require("../functions/node_modules/firebase-admin");

const DEMO_PROJECT = "demo-x-reply-intelligence";

function requireEmulator(env = process.env) {
  const projectId = env.FIREBASE_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT;
  if (projectId !== DEMO_PROJECT || !env.FIRESTORE_EMULATOR_HOST) throw new Error("Phase 5データ操作はdemo projectのFirestore Emulator限定です。");
  return projectId;
}

function getDb(env = process.env) {
  const projectId = requireEmulator(env);
  if (!admin.apps.length) admin.initializeApp({ projectId });
  return admin.firestore();
}

function serialize(value) {
  if (value && typeof value.toDate === "function") return { __timestamp: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  return value;
}

function deserialize(value) {
  if (Array.isArray(value)) return value.map(deserialize);
  if (value && typeof value === "object" && Object.keys(value).length === 1 && value.__timestamp) return admin.firestore.Timestamp.fromDate(new Date(value.__timestamp));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, deserialize(item)]));
  return value;
}

module.exports = { admin, DEMO_PROJECT, requireEmulator, getDb, serialize, deserialize };
