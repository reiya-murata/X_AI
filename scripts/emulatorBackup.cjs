const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { getDb, requireEmulator, serialize } = require("./phase5Firebase.cjs");
const { getReleaseInfo } = require("./releaseInfo.cjs");
const { SCHEMA_REGISTRY_VERSION } = require("../functions/src/schema/registry");

const COLLECTIONS = ["candidatePosts", "replyDrafts", "operationLogs", "replyUsageFeedback", "replyOutcomeMetrics", "postedReplies", "recentContent"];

async function createBackup(outputDir) {
  const projectId = requireEmulator();
  const db = getDb();
  const target = outputDir || path.join(process.cwd(), ".phase5-backups", new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(target, { recursive: true });
  const documents = {};
  for (const collection of COLLECTIONS) {
    const snap = await db.collection(collection).get();
    documents[collection] = snap.docs.map((doc) => ({ id: doc.id, data: scrub(collection, serialize(doc.data())) }));
  }
  const dataText = JSON.stringify(documents, null, 2);
  fs.writeFileSync(path.join(target, "data.json"), dataText, { mode: 0o600 });
  const release = getReleaseInfo();
  const manifest = { formatVersion: 1, projectId, schemaVersion: SCHEMA_REGISTRY_VERSION, releaseCandidateVersion: release.releaseCandidateVersion, gitCommit: release.gitCommitHash, createdAt: new Date().toISOString(), collections: Object.fromEntries(Object.entries(documents).map(([key, value]) => [key, value.length])), documentCount: Object.values(documents).reduce((sum, rows) => sum + rows.length, 0), checksum: sha256(dataText), sensitiveCollectionsExcluded: ["xConnections", "xOAuthStates"] };
  fs.writeFileSync(path.join(target, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ ok: true, backupDir: target, manifest }, null, 2));
  return { target, manifest, documents };
}
function scrub(collection, data) { if (collection === "operationLogs") { delete data.actorUid; } return data; }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
if (require.main === module) createBackup(process.argv[2]).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { createBackup, COLLECTIONS, sha256 };
