const assert = require("node:assert/strict");
const admin = require("firebase-admin");
const { assertEmulatorOnly } = require("./emulatorGuards");
const { transitionCandidate, saveWorkflowDraft, recordIntentOpened, recordManualSendResult, saveOutcomeMetrics, getOperationsSummary } = require("../src/phase4/workflow");

async function main() {
  assertEmulatorOnly();
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const db = admin.firestore();
  const candidatePostId = "phase4-e2e-candidate";
  const replyDraftId = "phase4-e2e-draft";
  await cleanup(db, candidatePostId, replyDraftId);
  await db.collection("candidatePosts").doc(candidatePostId).set({ postId: candidatePostId, text: "AI業務改善では生成後の確認と運用記録まで設計することが大切です。", status: "candidate", hardFilter: { passed: true }, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  await db.collection("replyDrafts").doc(replyDraftId).set({ replyDraftId, candidatePostId, recommendedCandidateKey: "A", candidates: [{ candidateKey: "A", text: "生成だけでなく、確認と改善の戻り道まで決めると運用しやすいですね。" }], createdAt: admin.firestore.FieldValue.serverTimestamp() });

  await transitionCandidate({ db, candidatePostId, to: "queued", actorUid: "phase4-admin" });
  await transitionCandidate({ db, candidatePostId, to: "generating", actorUid: "phase4-admin" });
  await transitionCandidate({ db, candidatePostId, to: "ready", actorUid: "phase4-admin", extra: { latestReplyDraftId: replyDraftId } });
  await saveWorkflowDraft({ db, admin, candidatePostId, replyDraftId, editedText: "生成だけでなく、確認と改善の戻り道まで決めると、現場でも運用しやすいですね。", actorUid: "phase4-admin" });
  await recordIntentOpened({ db, admin, candidatePostId, replyDraftId, finalReplyText: "生成だけでなく、確認と改善の戻り道まで決めると、現場でも運用しやすいですね。", actorUid: "phase4-admin" });
  await recordManualSendResult({ db, admin, candidatePostId, sent: true, finalReplyText: "生成だけでなく、確認と改善の戻り道まで決めると、現場でも運用しやすいですね。", feedback: "edited_and_used", actorUid: "phase4-admin" });
  await saveOutcomeMetrics({ db, candidatePostId, actorUid: "phase4-admin", metrics: { likes: 2, replies: 1, reposts: 0, profileVisits: "yes", followed: "unknown", inquiryOccurred: "no" } });
  const snap = await db.collection("candidatePosts").doc(candidatePostId).get();
  assert.equal(snap.data().workflowStatus, "sent_manual");
  assert.ok(snap.data().statusHistory.length <= 30);
  const summary = await getOperationsSummary({ db });
  assert.ok(summary.sentManual >= 1);
  await assert.rejects(() => transitionCandidate({ db, candidatePostId, to: "generating", actorUid: "phase4-admin" }), /変更できません/);
  console.log(JSON.stringify({ ok: true, finalStatus: snap.data().workflowStatus, summary, openAiApiCalls: 0, xApiCalls: 0, automaticPosts: 0, productionWrites: 0 }, null, 2));
  await cleanup(db, candidatePostId, replyDraftId);
}

async function cleanup(db, candidatePostId, replyDraftId) {
  const collections = ["operationLogs", "replyUsageFeedback", "replyOutcomeMetrics"];
  const batch = db.batch();
  batch.delete(db.collection("candidatePosts").doc(candidatePostId));
  batch.delete(db.collection("replyDrafts").doc(replyDraftId));
  for (const name of collections) {
    const snap = await db.collection(name).where("candidatePostId", "==", candidatePostId).get();
    snap.docs.forEach((doc) => batch.delete(doc.ref));
  }
  await batch.commit();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
