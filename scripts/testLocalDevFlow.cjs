const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.match(pkg.scripts["dev:local"], /devLocal\.cjs/);
  assert.match(pkg.scripts["dev:local-ui"], /--port 5174/);
  assert.match(pkg.scripts["dev:local-ui"], /--strictPort/);
  assert.match(pkg.scripts["emulators"], /\.firebase-emulator-data\/manual/);
  assert.match(pkg.scripts["seed:local-admin"], /seedLocalAdmin\.cjs/);

  console.log(JSON.stringify({
    ok: true,
    devPort: 5174,
    strictPort: true,
    emulatorDataDir: ".firebase-emulator-data/manual",
  }, null, 2));
}

main();
