const { spawnSync } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");

const repoRoot = path.resolve(__dirname, "..");

const steps = [
  { label: "lint", command: "npm", args: ["run", "lint"] },
  { label: "build", command: "npm", args: ["run", "build"] },
  { label: "phase4", command: "npm", args: ["run", "test:phase4"] },
  {
    label: "phase4:e2e",
    command: "npm",
    args: ["run", "test:phase4:e2e"],
    env: {
      FIREBASE_PROJECT_ID: "demo-x-reply-intelligence",
      GCLOUD_PROJECT: "demo-x-reply-intelligence",
      GOOGLE_CLOUD_PROJECT: "demo-x-reply-intelligence",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8081",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9097",
      OPENAI_MOCK_MODE: "true",
      X_API_MOCK_MODE: "true",
    },
  },
  { label: "phase41:safety", command: "npm", args: ["run", "test:phase41:safety"] },
  { label: "firebase-isolation", command: "npm", args: ["run", "test:firebase-isolation"] },
  {
    label: "rules",
    command: "node",
    args: [
      "scripts/firebaseLocalExec.cjs",
      "emulators:exec",
      "--only",
      "firestore",
      "npm run test:rules",
    ],
    env: {
      FIREBASE_PROJECT_ID: "demo-x-reply-intelligence",
      GCLOUD_PROJECT: "demo-x-reply-intelligence",
      GOOGLE_CLOUD_PROJECT: "demo-x-reply-intelligence",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8081",
      OPENAI_MOCK_MODE: "true",
      X_API_MOCK_MODE: "true",
    },
  },
  {
    label: "preflight:production",
    command: "npm",
    args: ["run", "preflight:production"],
    env: {
      APP_ENV: "production",
      FUNCTIONS_ENV: "production",
      FIREBASE_PROJECT_ID: "x-reply-intelligence",
      GCLOUD_PROJECT: "x-reply-intelligence",
      GOOGLE_CLOUD_PROJECT: "x-reply-intelligence",
      OPENAI_MOCK_MODE: "false",
      X_API_MOCK_MODE: "true",
    },
  },
];

function runStep(label, command, args, env = {}) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (typeof result.status === "number" && result.status !== 0) {
    const error = new Error(`${label} failed with exit code ${result.status}`);
    error.exitCode = result.status;
    throw error;
  }
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const firestoreOpen = await isPortOpen(8081);
  for (const step of steps) {
    if (step.label === "phase4:e2e" && firestoreOpen) {
      runStep(step.label, "npm", ["run", "test:phase4:e2e:direct"], step.env);
      continue;
    }
    runStep(step.label, step.command, step.args, step.env);
  }
  console.log("\nrelease:check complete");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = error.exitCode || 1;
});
