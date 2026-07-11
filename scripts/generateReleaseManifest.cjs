const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { getReleaseInfo } = require("./releaseInfo.cjs");
const { SCHEMA_REGISTRY_VERSION, definitions } = require("../functions/src/schema/registry");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
function sha(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function files(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.name === "release-manifest.json" ? [] : entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]); }
function npmVersion() { const result = spawnSync("npm", ["--version"], { encoding: "utf8" }); return result.status === 0 ? result.stdout.trim() : "unknown"; }
function generate() {
  if (!fs.existsSync(dist)) throw new Error("distがありません。先にbuildしてください。");
  const release = getReleaseInfo();
  const manifest = { releaseCandidateVersion: release.releaseCandidateVersion, gitCommit: release.gitCommitHash, dirty: release.workingTreeDirty, buildTimestamp: release.buildTimestamp, nodeVersion: process.version, npmVersion: npmVersion(), packageVersion: require("../package.json").version, schemaRegistryVersion: SCHEMA_REGISTRY_VERSION, schemaVersions: Object.fromEntries(Object.entries(definitions).map(([key, value]) => [key, value.version])), assetFiles: Object.fromEntries(files(dist).map((file) => [path.relative(dist, file), sha(file)])), environmentMode: process.env.APP_ENV || process.env.NODE_ENV || "build", mockState: process.env.OPENAI_MOCK_MODE === "true" ? "enabled" : "not-embedded", automaticPosting: false };
  fs.writeFileSync(path.join(dist, "release-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ok: true, file: "dist/release-manifest.json", assetCount: Object.keys(manifest.assetFiles).length }, null, 2));
  return manifest;
}
if (require.main === module) { try { generate(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { generate };
