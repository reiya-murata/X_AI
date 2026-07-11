const { spawnSync } = require("node:child_process");
const path = require("node:path");
const net = require("node:net");
const steps = ["check:fast", "check:security", "test:phase38:quality", "test:phase38:history", "test:phase38:origin", "test:phase4", "test:phase4:e2e", "test:phase41:safety", "test:phase5:data", "test:phase5:a11y", "test:rules", "check:release"];
function isOpen() { return new Promise((resolve) => { const socket = net.connect(8081, "127.0.0.1"); socket.once("connect", () => { socket.end(); resolve(true); }); socket.once("error", () => { socket.destroy(); resolve(false); }); }); }
(async () => {
  const firestoreOpen = await isOpen();
  for (const configuredStep of steps) {
    const step = configuredStep === "test:phase4:e2e" && firestoreOpen ? "test:phase4:e2e:direct" : configuredStep;
    console.log(`\n==> ${step}`);
    const result = spawnSync("npm", ["run", step], { cwd: path.resolve(__dirname, ".."), stdio: "inherit", env: process.env });
    if (result.status !== 0) process.exit(result.status || 1);
  }
  console.log("\ncheck:full complete");
})().catch((error) => { console.error(error.message); process.exitCode = 1; });
