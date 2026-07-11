async function logAiUsage({ db, admin, firebaseUid, candidatePostId, replyDraftId = null, operation, model, requestCount = 1, inputTokens = null, outputTokens = null, totalTokens = null, responseId = null, openAiRequestId = null, success, errorCode = null, durationMs = 0, promptVersion = null }) {
  await db.collection("aiUsageLogs").add({
    firebaseUid,
    candidatePostId,
    replyDraftId,
    operation,
    model,
    requestCount,
    inputTokens,
    outputTokens,
    totalTokens,
    responseId,
    openAiRequestId,
    success,
    errorCode,
    durationMs,
    promptVersion,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

module.exports = { logAiUsage };
