const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const LOCAL_DEMO_PROJECT_ID = "demo-x-reply-intelligence";

function getRepoRoot() {
  return path.resolve(__dirname, "..");
}

function getLocalFirebaseHome(repoRoot = getRepoRoot()) {
  return path.join(repoRoot, ".firebase-home");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getLocalProjectId(baseEnv = process.env) {
  return baseEnv.FIREBASE_PROJECT_ID || baseEnv.GCLOUD_PROJECT || baseEnv.GOOGLE_CLOUD_PROJECT || LOCAL_DEMO_PROJECT_ID;
}

function hasProjectArg(args) {
  return args.some((arg) => arg === "--project" || arg.startsWith("--project="));
}

function shouldInjectProjectId(args, baseEnv = process.env) {
  if (hasProjectArg(args)) return false;
  const projectId = getLocalProjectId(baseEnv);
  return Boolean(projectId);
}

function buildFirebaseEnv(baseEnv = process.env, repoRoot = getRepoRoot()) {
  const firebaseHome = getLocalFirebaseHome(repoRoot);
  const xdgConfigHome = path.join(firebaseHome, "config");
  const xdgCacheHome = path.join(firebaseHome, "cache");
  const javaHome = baseEnv.JAVA_HOME || "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home";
  ensureDir(firebaseHome);
  ensureDir(xdgConfigHome);
  ensureDir(xdgCacheHome);
  return {
    ...baseEnv,
    HOME: firebaseHome,
    XDG_CONFIG_HOME: xdgConfigHome,
    XDG_CACHE_HOME: xdgCacheHome,
    JAVA_HOME: javaHome,
    npm_config_update_notifier: "false",
  };
}

function resolveFirebaseBinary(repoRoot = getRepoRoot()) {
  const binaryName = process.platform === "win32" ? "firebase.cmd" : "firebase";
  const localBinary = path.join(repoRoot, "node_modules", ".bin", binaryName);
  return fs.existsSync(localBinary) ? localBinary : null;
}

function runFirebaseCommand(args, options = {}) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error("firebase command arguments are required.");
  }
  const repoRoot = options.cwd || getRepoRoot();
  const env = buildFirebaseEnv(options.env || process.env, repoRoot);
  const binary = resolveFirebaseBinary(repoRoot);
  if (!binary) {
    throw new Error("firebase-tools is not installed locally. Run npm install to provide a repo-local Firebase CLI.");
  }
  const finalArgs = shouldInjectProjectId(args, env)
    ? ["--project", getLocalProjectId(env), ...args]
    : args;
  return spawnSync(binary, finalArgs, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
    shell: false,
  });
}

function main() {
  const args = process.argv.slice(2);
  const result = runFirebaseCommand(args);
  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    return;
  }
  if (typeof result.status === "number") {
    process.exitCode = result.status;
    return;
  }
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  buildFirebaseEnv,
  getLocalFirebaseHome,
  getLocalProjectId,
  resolveFirebaseBinary,
  runFirebaseCommand,
};
