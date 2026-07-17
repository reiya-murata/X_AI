const { spawn } = require("node:child_process");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const demoProjectId = "demo-x-reply-intelligence";
const emulatorDataDir = path.join(repoRoot, ".firebase-emulator-data", "manual");
const ports = [9097, 8082, 5003];
const rootEnvPath = path.join(repoRoot, ".env");
const emulatorImportMetadataCandidates = [
  path.join(emulatorDataDir, "firebase-export-metadata.json"),
  path.join(emulatorDataDir, "firestore_export", "firebase-export-metadata.json"),
  path.join(emulatorDataDir, "auth_export", "firebase-export-metadata.json"),
  path.join(emulatorDataDir, "database_export", "firebase-export-metadata.json"),
];

function assertNodeVersion() {
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 20) {
    throw new Error(`Node 20以上が必要です。現在: ${process.versions.node}`);
  }
}

function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`ポート ${port} が使用中です。5174を空けてから再実行してください。`)));
    server.once("listening", () => server.close(() => resolve()));
    server.listen(port, "127.0.0.1");
  });
}

function spawnCmd(command, args, env, options = {}) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    ...options,
  });
  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  return child;
}

function parseEnvContent(content) {
  const parsed = {};
  const lines = content.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex < 0) continue;
    const key = line.slice(0, eqIndex).trim();
    if (!key) continue;
    let value = line.slice(eqIndex + 1);
    const commentIndex = value.match(/(^|\s)#/);
    if (commentIndex) {
      value = value.slice(0, commentIndex.index).trimEnd();
    }
    value = value.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function loadRootEnv() {
  if (!fs.existsSync(rootEnvPath)) return {};
  const content = fs.readFileSync(rootEnvPath, "utf8");
  return parseEnvContent(content);
}

function buildEmulatorEnv(rootEnv = loadRootEnv()) {
  const envValue = (keys, fallback = "") => {
    const keyList = Array.isArray(keys) ? keys : [keys];
    const value = keyList
      .map((key) => process.env[key] ?? rootEnv[key])
      .find((candidate) => typeof candidate === "string" && candidate.length > 0);
    return typeof value === "string" && value.length > 0 ? value : fallback;
  };
  const envFlag = (key, fallback) => {
    const value = process.env[key] ?? rootEnv[key];
    if (value === "true" || value === "false") return value;
    return fallback;
  };

  return {
    FIREBASE_PROJECT_ID: demoProjectId,
    GCLOUD_PROJECT: demoProjectId,
    GOOGLE_CLOUD_PROJECT: demoProjectId,
    FIREBASE_CONFIG: getFirebaseConfig(demoProjectId),
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9097",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8082",
    X_API_MOCK_MODE: envFlag("X_API_MOCK_MODE", "true"),
    OPENAI_MOCK_MODE: envFlag("OPENAI_MOCK_MODE", "true"),
    VITE_OPENAI_MOCK_MODE: envFlag("VITE_OPENAI_MOCK_MODE", envFlag("OPENAI_MOCK_MODE", "true")),
    ALLOW_REAL_OPENAI_WITH_EMULATOR: envFlag("ALLOW_REAL_OPENAI_WITH_EMULATOR", "false"),
    VITE_ALLOW_REAL_OPENAI_WITH_EMULATOR: envFlag("VITE_ALLOW_REAL_OPENAI_WITH_EMULATOR", envFlag("ALLOW_REAL_OPENAI_WITH_EMULATOR", "false")),
    ENABLE_REAL_OPENAI_TESTS: envFlag("ENABLE_REAL_OPENAI_TESTS", "false"),
    VITE_ENABLE_REAL_OPENAI_TESTS: envFlag("VITE_ENABLE_REAL_OPENAI_TESTS", envFlag("ENABLE_REAL_OPENAI_TESTS", "false")),
    VITE_USE_FIREBASE: "true",
    VITE_USE_FIREBASE_EMULATORS: "true",
    VITE_USE_MOCK_DATA: "false",
    VITE_USE_X_API_MOCK: envFlag("VITE_USE_X_API_MOCK", "true"),
    VITE_FIREBASE_PROJECT_ID: demoProjectId,
    VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9097",
    VITE_FIRESTORE_EMULATOR_HOST: "127.0.0.1",
    VITE_FIRESTORE_EMULATOR_PORT: "8082",
    VITE_FUNCTIONS_EMULATOR_HOST: "127.0.0.1",
    VITE_FUNCTIONS_EMULATOR_PORT: "5003",
    APP_BASE_URL: envValue("APP_BASE_URL", "http://localhost:5174"),
    X_CLIENT_ID: envValue(["X_CLIENT_ID", "X_OAUTH_CLIENT_ID"]),
    X_CLIENT_SECRET: envValue(["X_CLIENT_SECRET", "X_OAUTH_CLIENT_SECRET"]),
    X_OAUTH_REDIRECT_URI: envValue("X_OAUTH_REDIRECT_URI", "http://localhost:5174/__/functions/xOAuthCallback"),
  };
}

function getFirebaseConfig(projectId) {
  return JSON.stringify({
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  });
}

function hasEmulatorImportMetadata() {
  return emulatorImportMetadataCandidates.some((candidate) => fs.existsSync(candidate));
}

async function waitForPorts(nextPorts) {
  for (const port of nextPorts) {
    await waitForPort(port);
  }
}

function waitForPort(port) {
  const deadline = Date.now() + 120000;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.end();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`ポート ${port} の待機がタイムアウトしました。`));
          return;
        }
        setTimeout(tick, 1000);
      });
    };
    tick();
  });
}

async function main() {
  assertNodeVersion();
  await assertPortFree(5174);
  fs.mkdirSync(emulatorDataDir, { recursive: true });
  const emulatorEnv = buildEmulatorEnv();

  const children = [];
  const shutdown = () => {
    for (const child of children) {
      if (child && !child.killed) child.kill("SIGINT");
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  try {
    const emulator = spawnCmd(
      "node",
      [
        "scripts/firebaseLocalExec.cjs",
        "emulators:start",
        "--only",
        "auth,firestore,functions",
        ...(hasEmulatorImportMetadata() ? ["--import=.firebase-emulator-data/manual"] : []),
        "--export-on-exit=.firebase-emulator-data/manual",
      ],
      emulatorEnv,
    );
    children.push(emulator);
    emulator.once("exit", (code) => {
      if (code && code !== 0) {
        console.error(`Emulatorが終了しました: ${code}`);
        process.exitCode = code;
      }
    });

    await waitForPorts(ports);

    const seedAdmin = spawnCmd("node", ["scripts/seedLocalAdmin.cjs"], emulatorEnv);
    children.push(seedAdmin);
    await onceExit(seedAdmin, "ローカルadmin seed");

    const seedData = spawnCmd("node", ["functions/scripts/seedEmulator.js"], emulatorEnv);
    children.push(seedData);
    await onceExit(seedData, "fixture seed");

    const uiEnv = {
      ...emulatorEnv,
      VITE_LOCAL_AUTO_LOGIN: "true",
      VITE_LOCAL_QUALITY_MODE: "true",
      VITE_DEFAULT_TAB: "dashboard",
      VITE_ENABLE_QUALITY_LAB: "false",
    };
    const vite = spawnCmd(
      path.join(repoRoot, "node_modules", ".bin", "vite"),
      ["--host", "0.0.0.0", "--port", "5174", "--strictPort"],
      uiEnv,
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    children.push(vite);

    vite.once("exit", (code) => {
      shutdown();
      if (code && code !== 0) process.exitCode = code;
    });

    await new Promise((resolve) => {
      vite.once("exit", resolve);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    shutdown();
  }
}

function onceExit(child, label) {
  return new Promise((resolve, reject) => {
    child.once("exit", (code) => {
      if (code && code !== 0) {
        reject(new Error(`${label}が失敗しました: ${code}`));
        return;
      }
      resolve();
    });
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildEmulatorEnv,
  loadRootEnv,
  parseEnvContent,
};
