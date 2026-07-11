const crypto = require("node:crypto");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");

const HISTORY_COLLECTION = "replyDraftHumanEvaluations";
const IDEMPOTENCY_COLLECTION = "replyDraftHumanEvaluationFingerprints";
const IDEMPOTENCY_WINDOW_MS = 15_000;
const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function saveHumanEvaluation({ db, data, evaluationOrigin = "legacy_unknown" }) {
  const payload = normalizeStoredEvaluation(data);
  payload.evaluationOrigin = evaluationOrigin;
  const fingerprint = hashFingerprint(payload);
  const fingerprintRef = db.collection(IDEMPOTENCY_COLLECTION).doc(fingerprint);
  let result = { duplicate: false, evaluationId: null };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(fingerprintRef);
    const now = Timestamp.now();
    if (snap.exists) {
      const lastSavedAt = snap.data().lastSavedAt;
      const lastMs = lastSavedAt?.toMillis ? lastSavedAt.toMillis() : new Date(lastSavedAt || 0).getTime();
      if (Number.isFinite(lastMs) && Date.now() - lastMs < IDEMPOTENCY_WINDOW_MS) {
        result = { duplicate: true, evaluationId: snap.data().evaluationId || null };
        return;
      }
    }
    const historyRef = db.collection(HISTORY_COLLECTION).doc();
    const stored = {
      ...payload,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      evaluatedAt: payload.evaluatedAt || now,
      changeSummary: payload.changeSummary || null,
      evaluationOrigin: payload.evaluationOrigin || "legacy_unknown",
    };
    tx.set(historyRef, stored, { merge: true });
    tx.set(fingerprintRef, {
      evaluationId: historyRef.id,
      fingerprint,
      fixtureId: payload.fixtureId,
      candidateId: payload.candidateId,
      sourceType: payload.sourceType,
      evaluationOrigin: payload.evaluationOrigin || "legacy_unknown",
      lastSavedAt: now,
      expiresAt: Timestamp.fromMillis(now.toMillis() + IDEMPOTENCY_RETENTION_MS),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    result = { duplicate: false, evaluationId: historyRef.id };
  });

  return result;
}

function normalizeStoredEvaluation(input) {
  const evaluatedAt = input.evaluatedAt ? new Date(input.evaluatedAt) : null;
  const goodTags = Array.isArray(input.goodTags) ? input.goodTags : [];
  const badTags = Array.isArray(input.badTags) ? input.badTags : [];
  return {
    fixtureId: String(input.fixtureId || input.candidatePostId || "unknown"),
    candidateId: String(input.candidateId || input.candidateKey || "A"),
    candidateKey: String(input.candidateKey || input.candidateId || "A"),
    originalReplyText: String(input.originalReplyText || ""),
    humanEditedText: String(input.humanEditedText || ""),
    overallDecision: String(input.overallDecision || "pending"),
    evaluationScores: input.scores || {},
    goodTags,
    badTags,
    evaluatorNotes: String(input.evaluatorNotes || ""),
    sourceType: String(input.sourceType || "fixture"),
    evaluationOrigin: String(input.evaluationOrigin || "legacy_unknown"),
    generationVersion: String(input.generationVersion || ""),
    promptVersion: String(input.promptVersion || ""),
    contextSelectorVersion: String(input.contextSelectorVersion || ""),
    codeCheckVersion: String(input.codeCheckVersion || ""),
    model: input.model || null,
    responseId: input.responseId || null,
    apiCallCount: Number(input.apiCallCount || 0),
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    latencyMs: input.latencyMs ?? null,
    humanMemo: String(input.humanMemo || ""),
    feedbackTags: Array.isArray(input.feedbackTags) ? input.feedbackTags : [],
    changeSummary: input.changeSummary || null,
    evaluatedAt: evaluatedAt ? Timestamp.fromDate(evaluatedAt) : FieldValue.serverTimestamp(),
  };
}

function hashFingerprint(payload) {
  const basis = JSON.stringify({
    fixtureId: payload.fixtureId,
    candidateId: payload.candidateId,
    originalReplyText: payload.originalReplyText,
    humanEditedText: payload.humanEditedText,
    overallDecision: payload.overallDecision,
    scores: payload.evaluationScores,
    goodTags: payload.goodTags,
    badTags: payload.badTags,
    evaluatorNotes: payload.evaluatorNotes,
    sourceType: payload.sourceType,
    evaluationOrigin: payload.evaluationOrigin,
    generationVersion: payload.generationVersion,
    promptVersion: payload.promptVersion,
    contextSelectorVersion: payload.contextSelectorVersion,
    codeCheckVersion: payload.codeCheckVersion,
  });
  return crypto.createHash("sha256").update(basis).digest("hex");
}

async function cleanupExpiredEvaluationFingerprints({ db, now = Timestamp.now(), limit = 250 } = {}) {
  const snap = await db.collection(IDEMPOTENCY_COLLECTION)
    .where("expiresAt", "<=", now)
    .limit(limit)
    .get();
  if (snap.empty) return { deletedCount: 0 };
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return { deletedCount: snap.size };
}

module.exports = { saveHumanEvaluation, normalizeStoredEvaluation, hashFingerprint, cleanupExpiredEvaluationFingerprints, HISTORY_COLLECTION, IDEMPOTENCY_COLLECTION, IDEMPOTENCY_RETENTION_MS };
