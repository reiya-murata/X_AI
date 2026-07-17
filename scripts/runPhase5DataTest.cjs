const net = require("node:net");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const env = { ...process.env, FIREBASE_PROJECT_ID: "demo-x-reply-intelligence", GCLOUD_PROJECT: "demo-x-reply-intelligence", GOOGLE_CLOUD_PROJECT: "demo-x-reply-intelligence", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8082" };
function isOpen() { return new Promise((resolve) => { const socket = net.connect(8082, "127.0.0.1"); socket.once("connect", () => { socket.end(); resolve(true); }); socket.once("error", () => { socket.destroy(); resolve(false); }); }); }
(async () => {
  const open = await isOpen();
  const command = open ? ["node", ["scripts/testBackupRestore.cjs"]] : ["node", ["scripts/firebaseLocalExec.cjs", "emulators:exec", "--only", "firestore", "node scripts/testBackupRestore.cjs"]];
  const result = spawnSync(command[0], command[1], { cwd: root, env, stdio: "inherit" });
  process.exitCode = result.status || 0;
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
