const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { getDb, admin } = require("./phase5Firebase.cjs");
const { createBackup } = require("./emulatorBackup.cjs");
const { restoreBackup } = require("./emulatorRestore.cjs");

async function main() {
  const db = getDb();
  const id = `phase5-recovery-${Date.now()}`;
  const draftId = `${id}-draft`;
  const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), "x-ai-phase5-backup-"));
  await db.collection("candidatePosts").doc(id).set({ schemaVersion: 1, postId: id, text: "復旧訓練用投稿", workflowVersion: 1, workflowStatus: "ready", statusUpdatedAt: admin.firestore.FieldValue.serverTimestamp(), statusHistory: [], latestReplyDraftId: draftId, finalReplyText: "復旧訓練用返信" });
  await db.collection("replyDrafts").doc(draftId).set({ schemaVersion: 1, replyDraftId: draftId, candidatePostId: id, isCurrent: true, candidates: [{ candidateKey: "A", text: "復旧訓練用返信" }] });
  const before = (await db.collection("candidatePosts").doc(id).get()).data();
  const backup = await createBackup(backupDir);
  assert.ok(backup.manifest.checksum);
  await db.collection("candidatePosts").doc(id).delete();
  await db.collection("replyDrafts").doc(draftId).delete();
  const dryRun = await restoreBackup(backupDir, { apply: false });
  assert.equal(dryRun.dryRun, true);
  process.env.CONFIRM_EMULATOR_RESTORE = "RESTORE_DEMO_DATA";
  await restoreBackup(backupDir, { apply: true });
  const restored = (await db.collection("candidatePosts").doc(id).get()).data();
  assert.equal(restored.workflowStatus, before.workflowStatus);
  assert.equal(restored.latestReplyDraftId, draftId);
  await db.collection("candidatePosts").doc(id).delete();
  await db.collection("replyDrafts").doc(draftId).delete();
  fs.rmSync(backupDir, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, backup: true, restoreDryRun: true, restoreApply: true, workflowRecovered: true, openAiApiCalls: 0, xApiCalls: 0, productionWrites: 0 }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
