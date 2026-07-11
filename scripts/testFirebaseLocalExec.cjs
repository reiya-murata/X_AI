const assert = require("node:assert/strict");
const path = require("node:path");
const { buildFirebaseEnv, getLocalFirebaseHome } = require("./firebaseLocalExec.cjs");

function main() {
  const repoRoot = path.resolve(__dirname, "..");
  const env = buildFirebaseEnv({ PATH: "/usr/bin" }, repoRoot);
  const firebaseHome = getLocalFirebaseHome(repoRoot);

  assert.equal(env.HOME, firebaseHome);
  assert.equal(env.XDG_CONFIG_HOME, path.join(firebaseHome, "config"));
  assert.equal(env.XDG_CACHE_HOME, path.join(firebaseHome, "cache"));
  assert.equal(env.npm_config_update_notifier, "false");
  assert.ok(env.HOME.startsWith(repoRoot));
  assert.ok(!env.HOME.includes("/Users/reiya/.config"));

  console.log(JSON.stringify({
    ok: true,
    firebaseHome,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    xdgCacheHome: env.XDG_CACHE_HOME,
  }, null, 2));
}

main();
