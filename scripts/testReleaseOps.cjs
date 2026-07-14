const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { getReleaseInfo } = require("./releaseInfo.cjs");

const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const info = getReleaseInfo({ RELEASE_CANDIDATE_VERSION: "phase5.3-rc1" });

assert.equal(info.releaseCandidateVersion, "phase5.3-rc1");
assert.match(info.gitCommitHash, /^[0-9a-f]+|unknown$/);
assert.ok(Array.isArray(info.unconfirmedItems) && info.unconfirmedItems.length >= 5);
assert.equal(packageJson.scripts["release:status"], "node scripts/releaseStatus.cjs");
assert.equal(packageJson.scripts["release:check"], "node scripts/releaseCheck.cjs");

console.log(JSON.stringify({ ok: true, releaseCandidateVersion: info.releaseCandidateVersion, unconfirmedItems: info.unconfirmedItems.length }));
