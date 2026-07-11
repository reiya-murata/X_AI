const { getDb, requireEmulator } = require("../phase5Firebase.cjs");

const MIGRATION = Object.freeze({ id: "2026-07-workflow-status-v1", fromVersion: 0, toVersion: 1, collection: "candidatePosts", rollback: "workflowStatusを削除せず、旧statusを読み込みfallbackとして維持する。", idempotent: true });
const legacy = { candidate: "discovered", opened: "ready", draft_ready: "ready", manual_review: "needs_review", filtered_out: "dismissed", rejected: "dismissed" };

async function runMigrationDryRun() {
  requireEmulator();
  const snap = await getDb().collection(MIGRATION.collection).get();
  const plannedChanges = [];
  let skippedCount = 0;
  for (const doc of snap.docs) {
    const row = doc.data();
    if (row.workflowStatus) { skippedCount += 1; continue; }
    plannedChanges.push({ id: doc.id, from: row.status || null, to: legacy[row.status] || "discovered", set: { workflowVersion: 1, workflowStatus: legacy[row.status] || "discovered", statusUpdatedAt: "serverTimestamp" } });
  }
  const result = { ok: true, dryRun: true, migration: MIGRATION, changedCount: plannedChanges.length, skippedCount, errorCount: 0, plannedChanges: plannedChanges.slice(0, 100) };
  console.log(JSON.stringify(result, null, 2));
  return result;
}
if (require.main === module) runMigrationDryRun().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { MIGRATION, runMigrationDryRun };
