const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const admin = require("firebase-admin");
const { assertEmulatorOnly } = require("./emulatorGuards");
const { cleanupExpiredEvaluationFingerprints } = require("../src/phase3/humanEvaluationStore");

function getPhase38QualitySnapshotPath() {
  return path.join(os.tmpdir(), "x-ai-phase38-quality", "phase38-quality-evaluations.json");
}

async function main() {
  assertEmulatorOnly();
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const db = admin.firestore();
  const result = await cleanupExpiredEvaluationFingerprints({ db });
  const snapshotPath = getPhase38QualitySnapshotPath();
  if (fs.existsSync(snapshotPath)) {
    fs.unlinkSync(snapshotPath);
  }
  console.log(JSON.stringify({
    ok: true,
    cleanedFingerprints: result.deletedCount,
    removedSnapshot: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
