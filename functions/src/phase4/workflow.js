const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { assertRuntimeOperationAllowed } = require("../environmentSafety");
const { writeSafeOperationLog } = require("../logging/safeOperationLog");

const WORKFLOW_VERSION = 1;
const HISTORY_LIMIT = 30;

const LEGACY_STATUS_MAP = Object.freeze({
  candidate: "discovered",
  opened: "ready",
  draft_ready: "ready",
  manual_review: "needs_review",
  filtered_out: "dismissed",
  rejected: "dismissed",
});

const TRANSITIONS = Object.freeze({
  discovered: ["queued", "dismissed", "archived"],
  queued: ["generating", "dismissed", "archived"],
  generating: ["ready", "needs_review", "generation_failed"],
  ready: ["edited", "intent_opened", "dismissed", "queued", "archived"],
  needs_review: ["edited", "intent_opened", "dismissed", "queued", "archived"],
  edited: ["intent_opened", "dismissed", "queued", "archived"],
  intent_opened: ["sent_manual", "not_sent", "edited", "archived"],
  sent_manual: ["archived"],
  not_sent: ["edited", "queued", "dismissed", "archived"],
  dismissed: ["queued", "archived"],
  generation_failed: ["queued", "dismissed", "archived"],
  archived: ["queued"],
});

function normalizeCandidateStatus(status, candidate = {}) {
  if (TRANSITIONS[status]) return status;
  if (LEGACY_STATUS_MAP[status]) return LEGACY_STATUS_MAP[status];
  if (candidate.aiProcessing?.status === "generating") return "generating";
  if (candidate.aiProcessing?.status === "manual_review") return "needs_review";
  if (candidate.aiProcessing?.status === "draft_ready") return "ready";
  return "discovered";
}

function assertTransition(from, to) {
  if (!TRANSITIONS[to]) throw new HttpsError("invalid-argument", "候補ステータスが不正です。");
  if (from === to) return;
  if (!(TRANSITIONS[from] || []).includes(to)) {
    throw new HttpsError("failed-precondition", `「${from}」から「${to}」へは変更できません。`);
  }
}

async function transitionCandidate({ db, candidatePostId, to, actorUid, safeMetadata = {}, extra = {}, operationId = null, correlationId = null }) {
  assertRuntimeOperationAllowed(process.env);
  const ref = db.collection("candidatePosts").doc(candidatePostId);
  const result = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "候補が見つかりません。");
    const candidate = snap.data();
    const from = normalizeCandidateStatus(candidate.workflowStatus || candidate.status, candidate);
    assertTransition(from, to);
    if (from === to) return { from, to, duplicate: true };
    const history = Array.isArray(candidate.statusHistory) ? candidate.statusHistory.slice(-(HISTORY_LIMIT - 1)) : [];
    history.push({ from, to, at: new Date().toISOString(), actorUid: actorUid || null });
    transaction.set(ref, {
      workflowVersion: WORKFLOW_VERSION,
      workflowStatus: to,
      statusUpdatedAt: FieldValue.serverTimestamp(),
      statusHistory: history,
      updatedAt: FieldValue.serverTimestamp(),
      ...extra,
    }, { merge: true });
    return { from, to, duplicate: false };
  });
  if (!result.duplicate) await writeSafeOperationLog({ db, actorUid, actionType: `status_${to}`, candidatePostId, safeMetadata: { ...safeMetadata, from: result.from, to }, operationId, correlationId });
  return { ok: true, ...result };
}

async function saveWorkflowDraft({ db, admin, candidatePostId, replyDraftId, editedText, actorUid }) {
  const text = String(editedText || "").trim();
  if (!text || text.length > 280) throw new HttpsError("invalid-argument", "返信文は1〜280文字で入力してください。");
  const draftRef = db.collection("replyDrafts").doc(replyDraftId);
  const draft = await draftRef.get();
  if (!draft.exists || draft.data().candidatePostId !== candidatePostId) throw new HttpsError("not-found", "返信案が見つかりません。");
  const originalText = selectedDraftText(draft.data());
  await draftRef.set({ editedText: text, finalReplyText: text, editCharacterCount: characterDiff(originalText, text), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const candidateSnap = await db.collection("candidatePosts").doc(candidatePostId).get();
  const current = normalizeCandidateStatus(candidateSnap.data()?.workflowStatus || candidateSnap.data()?.status, candidateSnap.data() || {});
  if (["ready", "needs_review", "not_sent"].includes(current)) {
    await transitionCandidate({ db, admin, candidatePostId, to: "edited", actorUid, safeMetadata: { replyDraftId } });
  } else {
    await writeSafeOperationLog({ db, actorUid, actionType: "reply_edited", candidatePostId, replyDraftId });
  }
  return { ok: true, finalReplyText: text, editCharacterCount: characterDiff(originalText, text) };
}

async function recordIntentOpened({ db, admin, candidatePostId, replyDraftId, finalReplyText, actorUid, operationId = null, correlationId = null }) {
  const text = String(finalReplyText || "").trim();
  if (!text) throw new HttpsError("invalid-argument", "返信文がありません。");
  return transitionCandidate({
    db, admin, candidatePostId, to: "intent_opened", actorUid,
    safeMetadata: { replyDraftId },
    extra: { intentOpenedAt: FieldValue.serverTimestamp(), pendingSendConfirmation: true, latestReplyDraftId: replyDraftId || null, finalReplyText: text }, operationId, correlationId,
  });
}

async function recordManualSendResult({ db, admin, candidatePostId, sent, actorUid, finalReplyText, replyUrl, memo, notSentReason, feedback, operationId = null, correlationId = null }) {
  const to = sent ? "sent_manual" : "not_sent";
  const extra = sent ? {
    sentAt: FieldValue.serverTimestamp(),
    finalReplyText: String(finalReplyText || "").trim(),
    replyUrl: safeUrl(replyUrl),
    sendMemo: shortText(memo, 300),
    pendingSendConfirmation: false,
  } : {
    notSentAt: FieldValue.serverTimestamp(),
    notSentReason: allowedNotSentReason(notSentReason),
    sendMemo: shortText(memo, 300),
    pendingSendConfirmation: false,
  };
  const result = await transitionCandidate({ db, admin, candidatePostId, to, actorUid, safeMetadata: { feedback: allowedFeedback(feedback), notSentReason: extra.notSentReason || null }, extra, operationId, correlationId });
  if (feedback) await saveUsageFeedback({ db, candidatePostId, actorUid, feedback, memo });
  return result;
}

async function saveUsageFeedback({ db, candidatePostId, actorUid, feedback, shortReason = "", memo = "" }) {
  assertRuntimeOperationAllowed(process.env);
  const value = allowedFeedback(feedback);
  if (!value) throw new HttpsError("invalid-argument", "利用結果を確認してください。");
  const id = `${candidatePostId}_${Date.now()}`;
  await db.collection("replyUsageFeedback").doc(id).set({ schemaVersion: 1, candidatePostId, feedback: value, shortReason: shortText(shortReason, 120), memo: shortText(memo, 300), actorUid, createdAt: FieldValue.serverTimestamp() });
  await writeSafeOperationLog({ db, actorUid, actionType: "usage_feedback_saved", candidatePostId, safeMetadata: { feedback: value } });
  return { ok: true, id };
}

async function saveOutcomeMetrics({ db, candidatePostId, actorUid, metrics }) {
  assertRuntimeOperationAllowed(process.env);
  const payload = {
    schemaVersion: 1,
    candidatePostId,
    likes: nonNegativeInt(metrics.likes), replies: nonNegativeInt(metrics.replies), reposts: nonNegativeInt(metrics.reposts),
    profileVisits: triState(metrics.profileVisits), followed: triState(metrics.followed), inquiryOccurred: triState(metrics.inquiryOccurred),
    observedAt: metrics.observedAt ? new Date(metrics.observedAt) : FieldValue.serverTimestamp(), memo: shortText(metrics.memo, 300), actorUid,
    createdAt: FieldValue.serverTimestamp(),
  };
  const ref = db.collection("replyOutcomeMetrics").doc();
  await ref.set(payload);
  await writeSafeOperationLog({ db, actorUid, actionType: "outcome_recorded", candidatePostId, safeMetadata: { likes: payload.likes, replies: payload.replies, reposts: payload.reposts } });
  return { ok: true, id: ref.id };
}

async function getOperationsSummary({ db }) {
  const [candidateSnap, feedbackSnap] = await Promise.all([
    db.collection("candidatePosts").limit(500).get(),
    db.collection("replyUsageFeedback").limit(500).get().catch(() => ({ docs: [] })),
  ]);
  const rows = candidateSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const status = (name) => rows.filter((row) => normalizeCandidateStatus(row.workflowStatus || row.status, row) === name).length;
  const sent = status("sent_manual");
  const generated = rows.filter((row) => ["ready", "needs_review", "edited", "intent_opened", "sent_manual", "not_sent", "archived"].includes(normalizeCandidateStatus(row.workflowStatus || row.status, row))).length;
  const feedbacks = feedbackSnap.docs.map((doc) => doc.data());
  const countFeedback = (value) => feedbacks.filter((row) => row.feedback === value).length;
  return {
    ok: true, totalCandidates: rows.length, generated, needsReview: status("needs_review"), edited: status("edited"), intentOpened: status("intent_opened") + sent + status("not_sent"),
    sentManual: sent, notUsed: status("not_sent") + status("dismissed"), candidateToSendRate: rate(sent, rows.length),
    adoptedRate: rate(countFeedback("adopted"), feedbacks.length), editedAndUsedRate: rate(countFeedback("edited_and_used"), feedbacks.length),
    insufficientData: rows.length < 5,
  };
}

function selectedDraftText(draft) { const key = draft.selectedCandidateKey || draft.recommendedCandidateKey || "A"; return (draft.candidates || []).find((item) => item.candidateKey === key)?.text || draft.candidates?.[0]?.text || ""; }
function characterDiff(a, b) { let same = 0; const max = Math.min(a.length, b.length); while (same < max && a[same] === b[same]) same += 1; return (a.length - same) + (b.length - same); }
function shortText(value, max) { return String(value || "").replace(/[\r\n]+/g, " ").slice(0, max); }
function safeUrl(value) { const text = String(value || "").trim(); return /^https:\/\/(x\.com|twitter\.com)\//.test(text) ? text.slice(0, 500) : ""; }
function nonNegativeInt(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0; }
function triState(value) { return ["yes", "no", "unknown"].includes(value) ? value : "unknown"; }
function allowedFeedback(value) { return ["adopted", "edited_and_used", "not_used"].includes(value) ? value : null; }
function allowedNotSentReason(value) { return ["revise_text", "post_too_old", "relationship_concern", "already_replied", "other"].includes(value) ? value : "other"; }
function rate(n, d) { return d ? Math.round((n / d) * 1000) / 10 : null; }

module.exports = { TRANSITIONS, normalizeCandidateStatus, assertTransition, transitionCandidate, saveWorkflowDraft, recordIntentOpened, recordManualSendResult, saveUsageFeedback, saveOutcomeMetrics, getOperationsSummary, characterDiff };
