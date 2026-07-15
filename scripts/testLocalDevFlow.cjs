const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildEmulatorEnv, loadRootEnv } = require("./devLocal.cjs");

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.match(pkg.scripts["dev:local"], /devLocal\.cjs/);
  assert.match(pkg.scripts["dev:local-ui"], /--port 5174/);
  assert.match(pkg.scripts["dev:local-ui"], /--strictPort/);
  assert.match(pkg.scripts["dev:local:real"], /ALLOW_REAL_OPENAI_WITH_EMULATOR=true/);
  assert.match(pkg.scripts["dev:local:real"], /VITE_ALLOW_REAL_OPENAI_WITH_EMULATOR=true/);
  assert.match(pkg.scripts["emulators"], /\.firebase-emulator-data\/manual/);
  assert.match(pkg.scripts["seed:local-admin"], /seedLocalAdmin\.cjs/);

  const rootEnv = loadRootEnv();
  const emulatorEnv = buildEmulatorEnv(rootEnv);
  assert.ok(
    (rootEnv.X_CLIENT_ID && rootEnv.X_CLIENT_ID.length > 0) || (rootEnv.X_OAUTH_CLIENT_ID && rootEnv.X_OAUTH_CLIENT_ID.length > 0),
    "root .env must provide an X client id key",
  );
  assert.ok(
    (rootEnv.X_CLIENT_SECRET && rootEnv.X_CLIENT_SECRET.length > 0) || (rootEnv.X_OAUTH_CLIENT_SECRET && rootEnv.X_OAUTH_CLIENT_SECRET.length > 0),
    "root .env must provide an X client secret key",
  );
  assert.ok(emulatorEnv.X_CLIENT_ID && emulatorEnv.X_CLIENT_ID.length > 0, "devLocal must pass X_CLIENT_ID");
  assert.ok(emulatorEnv.X_CLIENT_SECRET && emulatorEnv.X_CLIENT_SECRET.length > 0, "devLocal must pass X_CLIENT_SECRET");
  assert.ok(emulatorEnv.X_OAUTH_REDIRECT_URI && emulatorEnv.X_OAUTH_REDIRECT_URI.length > 0, "devLocal must pass X_OAUTH_REDIRECT_URI");
  assert.ok(emulatorEnv.APP_BASE_URL && emulatorEnv.APP_BASE_URL.length > 0, "devLocal must pass APP_BASE_URL");
  assert.equal(emulatorEnv.ALLOW_REAL_OPENAI_WITH_EMULATOR, "false");
  assert.equal(emulatorEnv.VITE_ALLOW_REAL_OPENAI_WITH_EMULATOR, "false");

  console.log(JSON.stringify({
    ok: true,
    devPort: 5174,
    strictPort: true,
    emulatorDataDir: ".firebase-emulator-data/manual",
    envLoaded: true,
  }, null, 2));
}

main();
