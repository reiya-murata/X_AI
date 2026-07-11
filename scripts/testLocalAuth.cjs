const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

function runSeed(env) {
  return spawnSync("node", [path.join(__dirname, "seedLocalAdmin.cjs")], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function main() {
  const baseEnv = {
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9097",
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:8081",
    FIREBASE_PROJECT_ID: "demo-x-reply-intelligence",
    GCLOUD_PROJECT: "demo-x-reply-intelligence",
  };

  const noAuth = runSeed({ ...baseEnv, FIREBASE_AUTH_EMULATOR_HOST: "" });
  assert.notEqual(noAuth.status, 0);
  assert.match(`${noAuth.stderr}${noAuth.stdout}`, /FIREBASE_AUTH_EMULATOR_HOST/);

  const noFs = runSeed({ ...baseEnv, FIRESTORE_EMULATOR_HOST: "" });
  assert.notEqual(noFs.status, 0);
  assert.match(`${noFs.stderr}${noFs.stdout}`, /FIRESTORE_EMULATOR_HOST/);

  const noDemo = runSeed({ ...baseEnv, FIREBASE_PROJECT_ID: "x-reply-intelligence", GCLOUD_PROJECT: "x-reply-intelligence" });
  assert.notEqual(noDemo.status, 0);
  assert.match(`${noDemo.stderr}${noDemo.stdout}`, /demo-/);

  console.log(JSON.stringify({ ok: true }, null, 2));
}

main();
