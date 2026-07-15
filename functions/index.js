const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { z } = require("zod");
const { buildSeedDocuments } = require("./src/seed");
const { generateLocalReplyTest } = require("./src/replyEngine");
const {
  encryptText,
  decryptText,
  hashValue,
  randomUrlSafe,
  createCodeChallenge,
} = require("./src/security/tokenEncryption");
const {
  REQUIRED_SCOPES,
  isMockMode,
  exchangeCodeForToken,
  fetchMe,
  getValidXAccessToken,
} = require("./src/x/xApiClient");
const { mockConnection } = require("./src/x/mockFixtures");
const { syncTimeline } = require("./src/x/syncTimeline");
const { safeMessage } = require("./src/x/errors");
const { requireAdmin } = require("./src/auth/requireAdmin");
const { deprecatedAiCallable } = require("./src/phase3/deprecatedCallables");
const {
  processCandidateWithAi,
  processCandidateBatchWithAi,
  saveReplyDraftSelection,
} = require("./src/phase3/analysis");
const { normalizeHumanQualityEvaluation } = require("./src/phase3/humanEvaluation");
const { saveHumanEvaluation, cleanupExpiredEvaluationFingerprints } = require("./src/phase3/humanEvaluationStore");
const { evaluateServerEnvironment } = require("./src/environmentSafety");
const {
  transitionCandidate,
  saveWorkflowDraft,
  recordIntentOpened,
  recordManualSendResult,
  saveUsageFeedback,
  saveOutcomeMetrics,
  getOperationsSummary,
} = require("./src/phase4/workflow");

admin.initializeApp();

const db = admin.firestore();

const GenerateReplySchema = z.object({
  originalPostText: z.string().min(1).max(2000),
});

const FetchWatchListSchema = z.object({
  listId: z.string().regex(/^\d+$/),
});

const SaveWatchListSchema = z.object({
  listId: z.string().regex(/^\d+$/),
  name: z.string().min(1).max(80),
  enabled: z.boolean(),
});

exports.seedIdentityDefaults = onCall({ region: "asia-northeast1" }, async (request) => {
  requireAdmin(request);
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  const docs = buildSeedDocuments();

  for (const item of docs) {
    const ref = db.collection(item.collection).doc(item.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) {
      batch.set(ref, { ...item.data, createdAt: now, updatedAt: now });
    }
  }

  await batch.commit();
  return { ok: true, insertedIfMissing: docs.length };
});

exports.generateReplyTest = onCall({ region: "asia-northeast1" }, async (request) => {
  requireAdmin(request);
  const parsed = GenerateReplySchema.safeParse(request.data);
  if (!parsed.success) {
    throw new HttpsError("invalid-argument", "元投稿本文を確認してください。");
  }

  return generateLocalReplyTest(parsed.data.originalPostText);
});

exports.beginXOAuth = onCall({ region: "asia-northeast1" }, async (request) => {
  const adminUser = requireAdmin(request);
  if (isMockMode()) {
    return { authorizationUrl: `${appBaseUrl()}/?x_oauth=mock_success`, mock: true };
  }

  const state = randomUrlSafe(32);
  const codeVerifier = randomUrlSafe(64);
  const stateHash = hashValue(state);
  const redirectUri = process.env.X_OAUTH_REDIRECT_URI || callbackUrl();
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000));

  await cleanupOldOAuthStates(adminUser.uid);
  await db.collection("xOAuthStates").doc(stateHash).set({
    stateHash,
    firebaseUid: adminUser.uid,
    encryptedCodeVerifier: encryptText(codeVerifier),
    requestedScopes: REQUIRED_SCOPES,
    redirectUri,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
    usedAt: null,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID || process.env.X_OAUTH_CLIENT_ID || "",
    redirect_uri: redirectUri,
    scope: REQUIRED_SCOPES.join(" "),
    state,
    code_challenge: createCodeChallenge(codeVerifier),
    code_challenge_method: "S256",
  });

  return { authorizationUrl: `https://x.com/i/oauth2/authorize?${params.toString()}` };
});

exports.xOAuthCallback = onRequest({ region: "asia-northeast1" }, async (req, res) => {
  console.log("xOAuthCallback:start", {
    hasCode: Boolean(req.query.code),
    hasState: Boolean(req.query.state),
    host: req.headers.host || null,
  });
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");
  if (!code || !state) {
    console.log("xOAuthCallback:missing_params");
    res.redirect(`${appBaseUrl()}/?x_oauth_error=X_OAUTH_CODE_MISSING`);
    return;
  }

  const stateHash = hashValue(state);
  const stateRef = db.collection("xOAuthStates").doc(stateHash);
  const stateSnap = await stateRef.get();
  if (!stateSnap.exists || stateSnap.data().usedAt) {
    console.log("xOAuthCallback:state_invalid");
    res.redirect(`${appBaseUrl()}/?x_oauth_error=X_OAUTH_STATE_INVALID`);
    return;
  }
  const stateData = stateSnap.data();
  if (stateData.expiresAt.toDate().getTime() < Date.now()) {
    console.log("xOAuthCallback:state_expired");
    res.redirect(`${appBaseUrl()}/?x_oauth_error=X_OAUTH_STATE_EXPIRED`);
    return;
  }

  try {
    const codeVerifier = decryptText(stateData.encryptedCodeVerifier);
    const token = await exchangeCodeForToken({ code, codeVerifier, redirectUri: stateData.redirectUri });
    const me = await fetchMe(token.access_token);
    const expiresAt = new Date(Date.now() + Number(token.expires_in || 7200) * 1000);
    await db.collection("xConnections").doc(stateData.firebaseUid).set({
      firebaseUid: stateData.firebaseUid,
      status: "connected",
      xUserId: me.data.id,
      username: me.data.username,
      displayName: me.data.name,
      profileImageUrl: me.data.profile_image_url || null,
      encryptedAccessToken: encryptText(token.access_token),
      encryptedRefreshToken: token.refresh_token ? encryptText(token.refresh_token) : null,
      scopes: String(token.scope || REQUIRED_SCOPES.join(" ")).split(" ").filter(Boolean),
      accessTokenExpiresAt: Timestamp.fromDate(expiresAt),
      refreshTokenUpdatedAt: token.refresh_token ? FieldValue.serverTimestamp() : null,
      lastRefreshedAt: null,
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      lastErrorCode: null,
      lastErrorAt: null,
    }, { merge: true });
    await stateRef.set({ usedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log("xOAuthCallback:success", { firebaseUid: stateData.firebaseUid, xUserId: me.data.id, username: me.data.username });
    res.redirect(`${appBaseUrl()}/?x_oauth=success`);
  } catch (error) {
    await stateRef.set({ usedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log("xOAuthCallback:failed", { code: error.code || "X_TOKEN_EXCHANGE_FAILED" });
    res.redirect(`${appBaseUrl()}/?x_oauth_error=${encodeURIComponent(error.code || "X_TOKEN_EXCHANGE_FAILED")}`);
  }
});

exports.getXConnectionStatus = onCall({ region: "asia-northeast1" }, async (request) => {
  const adminUser = requireAdmin(request);
  console.log("getXConnectionStatus:start", { uid: adminUser.uid, xApiMockMode: isMockMode() });
  if (isMockMode()) return mockConnection;

  const snap = await db.collection("xConnections").doc(adminUser.uid).get();
  console.log("getXConnectionStatus:firestore", {
    uid: adminUser.uid,
    exists: snap.exists,
    status: snap.exists ? snap.data()?.status || null : null,
    username: snap.exists ? snap.data()?.username || null : null,
    hasEncryptedAccessToken: snap.exists ? Boolean(snap.data()?.encryptedAccessToken) : false,
  });
  if (!snap.exists || snap.data().status !== "connected") {
    return emptyConnectionStatus(snap.data()?.lastErrorCode || null);
  }
  const data = snap.data();
  const home = await db.collection("timelineSyncStates").doc(`${adminUser.uid}_home`).get();
  const listStates = await db.collection("timelineSyncStates")
    .where("firebaseUid", "==", adminUser.uid)
    .where("sourceType", "==", "watch_list")
    .limit(1)
    .get();
  return {
    connected: true,
    xUserId: data.xUserId,
    username: data.username,
    displayName: data.displayName,
    profileImageUrl: data.profileImageUrl || null,
    scopes: data.scopes || [],
    accessTokenExpiresAt: data.accessTokenExpiresAt?.toDate?.().toISOString() || null,
    lastRefreshedAt: data.lastRefreshedAt?.toDate?.().toISOString() || null,
    lastHomeTimelineSyncAt: home.data()?.lastSuccessfulAt?.toDate?.().toISOString() || null,
    lastListTimelineSyncAt: listStates.docs[0]?.data()?.lastSuccessfulAt?.toDate?.().toISOString() || null,
    lastErrorCode: data.lastErrorCode || null,
  };
});

exports.disconnectX = onCall({ region: "asia-northeast1" }, async (request) => {
  const adminUser = requireAdmin(request);
  await db.collection("xConnections").doc(adminUser.uid).set({
    firebaseUid: adminUser.uid,
    status: "disconnected",
    encryptedAccessToken: FieldValue.delete(),
    encryptedRefreshToken: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

exports.saveWatchListSetting = onCall({ region: "asia-northeast1" }, async (request) => {
  const adminUser = requireAdmin(request);
  const parsed = SaveWatchListSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "監視リスト設定を確認してください。");
  const data = parsed.data;
  await db.collection("watchListSettings").doc(`${adminUser.uid}_${data.listId}`).set({
    firebaseUid: adminUser.uid,
    listId: data.listId,
    name: data.name,
    enabled: data.enabled,
    maxPagesPerSync: 2,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

exports.listCandidatePosts = onCall({ region: "asia-northeast1" }, async (request) => {
  requireAdmin(request);
  const passed = await db.collection("candidatePosts")
    .where("status", "in", ["candidate", "opened"])
    .orderBy("createdAt", "desc")
    .limit(80)
    .get();
  const excluded = await db.collection("candidatePosts")
    .where("status", "==", "filtered_out")
    .orderBy("lastDiscoveredAt", "desc")
    .limit(30)
    .get();
  return {
    candidates: passed.docs
      .map(toClientPost)
      .filter((post) => post.hardFilter?.passed === true)
      .filter((post) => !post.expiresAt || new Date(post.expiresAt).getTime() > Date.now())
      .slice(0, 50),
    excluded: excluded.docs.map(toClientPost),
  };
});

exports.getSyncOverview = onCall({ region: "asia-northeast1" }, async (request) => {
  const adminUser = requireAdmin(request);
  const states = await db.collection("timelineSyncStates")
    .where("firebaseUid", "==", adminUser.uid)
    .limit(20)
    .get();
  const runs = await db.collection("searchRuns")
    .where("firebaseUid", "==", adminUser.uid)
    .orderBy("startedAt", "desc")
    .limit(10)
    .get();
  return {
    scheduler: {
      schedulerEnabled: false,
      intervalMinutes: 60,
      maxPagesPerRun: 1,
    },
    states: states.docs.map((doc) => serializeTimestamps({ id: doc.id, ...doc.data() })),
    runs: runs.docs.map((doc) => serializeTimestamps({ id: doc.id, ...doc.data() })),
  };
});

exports.fetchHomeTimelineNow = onCall({ region: "asia-northeast1" }, async (request) => {
  const adminUser = requireAdmin(request);
  console.log("fetchHomeTimelineNow:start", { uid: adminUser.uid, xApiMockMode: isMockMode() });
  const connection = await getConnectionForSync(adminUser.uid);
  console.log("fetchHomeTimelineNow:connection", {
    uid: adminUser.uid,
    status: connection.status || null,
    username: connection.username || null,
    hasEncryptedAccessToken: Boolean(connection.encryptedAccessToken),
    hasEncryptedRefreshToken: Boolean(connection.encryptedRefreshToken),
    accessTokenExpiresAt: connection.accessTokenExpiresAt?.toDate?.()?.toISOString?.() || null,
  });
  const accessToken = await getValidXAccessToken({ db, admin, firebaseUid: adminUser.uid });
  console.log("fetchHomeTimelineNow:tokenReady", { uid: adminUser.uid, tokenSource: isMockMode() ? "mock" : "emulator_or_refresh" });
  try {
    const result = await syncTimeline({ db, admin, firebaseUid: adminUser.uid, sourceType: "home_timeline", connection, accessToken });
    console.log("fetchHomeTimelineNow:complete", {
      uid: adminUser.uid,
      fetchedCount: result.fetchedCount,
      savedCount: result.savedCount,
      excludedCount: result.excludedCount,
      duplicateCount: result.duplicateCount,
      hasMore: result.hasMore,
    });
    return result;
  } catch (error) {
    console.error("fetchHomeTimelineNow failed", { code: error.code, message: error.message });
    throw new HttpsError("failed-precondition", safeMessage(error.code), { code: error.code || "UNKNOWN_ERROR" });
  }
});

exports.fetchWatchListTimelineNow = onCall({ region: "asia-northeast1" }, async (request) => {
  const adminUser = requireAdmin(request);
  const parsed = FetchWatchListSchema.safeParse(request.data);
  if (!parsed.success) throw new HttpsError("invalid-argument", "監視リストIDを確認してください。");
  const setting = await db.collection("watchListSettings").doc(`${adminUser.uid}_${parsed.data.listId}`).get();
  if (!isMockMode() && (!setting.exists || setting.data().enabled !== true)) {
    throw new HttpsError("failed-precondition", safeMessage("X_LIST_NOT_CONFIGURED"), { code: "X_LIST_NOT_CONFIGURED" });
  }
  const connection = await getConnectionForSync(adminUser.uid);
  const accessToken = await getValidXAccessToken({ db, admin, firebaseUid: adminUser.uid });
  try {
    return await syncTimeline({ db, admin, firebaseUid: adminUser.uid, sourceType: "watch_list", listId: parsed.data.listId, connection, accessToken });
  } catch (error) {
    console.error("fetchWatchListTimelineNow failed", { code: error.code, message: error.message });
    throw new HttpsError("failed-precondition", safeMessage(error.code), { code: error.code || "UNKNOWN_ERROR" });
  }
});

exports.scheduledDiscoverCandidates = onSchedule(
  { schedule: "every 30 minutes", timeZone: "Asia/Tokyo", region: "asia-northeast1" },
  async () => {
    const runRef = db.collection("searchRuns").doc();
    await runRef.set({
      searchProfileId: "home-timeline-primary",
      source: "home_timeline",
      startedAt: FieldValue.serverTimestamp(),
      completedAt: FieldValue.serverTimestamp(),
      query: null,
      candidatePostIds: [],
      status: "completed",
      error: "Phase 2では本番Schedulerを有効化していません。手動取得を使用してください。",
      usage: { inputTokens: 0, outputTokens: 0, toolCalls: 0 },
    });
  },
);

exports.assessCandidateWithAi = onCall({ region: "asia-northeast1" }, async (request) => {
  requireAdmin(request);
  return deprecatedAiCallable("assessCandidateWithAi")();
});

exports.generateReplyDraftWithAi = onCall({ region: "asia-northeast1" }, async (request) => {
  requireAdmin(request);
  return deprecatedAiCallable("generateReplyDraftWithAi")();
});

exports.processCandidateWithAi = onCall({ region: "asia-northeast1" }, async (request) => {
  const adminUser = requireAdmin(request);
  return processCandidateWithAi({
    db,
    admin,
    candidatePostId: String(request.data?.candidatePostId || ""),
    firebaseUid: adminUser.uid,
    forceForBRank: Boolean(request.data?.forceForBRank),
  });
});

exports.processCandidateBatchWithAi = onCall({ region: "asia-northeast1" }, async (request) => {
  const adminUser = requireAdmin(request);
  return processCandidateBatchWithAi({
    db,
    admin,
    firebaseUid: adminUser.uid,
    limit: Number(request.data?.limit || 10),
  });
});

exports.regenerateReplyDraftWithAi = onCall({ region: "asia-northeast1" }, async (request) => {
  requireAdmin(request);
  return deprecatedAiCallable("regenerateReplyDraftWithAi")();
});

exports.saveReplyDraftSelection = onCall({ region: "asia-northeast1" }, async (request) => {
  requireAdmin(request);
  const data = request.data || {};
  return saveReplyDraftSelection({
    db,
    admin,
    candidatePostId: String(data.candidatePostId || ""),
    replyDraftId: String(data.replyDraftId || ""),
    selectedCandidateKey: String(data.selectedCandidateKey || ""),
    editedText: data.editedText ?? null,
    humanMemo: String(data.humanMemo || ""),
  });
});

exports.transitionCandidateWorkflow = onCall({ region: "asia-northeast1" }, async (request) => {
  const user = requireAdmin(request);
  return transitionCandidate({ db, admin, actorUid: user.uid, candidatePostId: String(request.data?.candidatePostId || ""), to: String(request.data?.to || ""), safeMetadata: request.data?.safeMetadata || {}, operationId: request.data?.operationId, correlationId: request.data?.correlationId });
});

exports.saveWorkflowReplyDraft = onCall({ region: "asia-northeast1" }, async (request) => {
  const user = requireAdmin(request);
  return saveWorkflowDraft({ db, admin, actorUid: user.uid, candidatePostId: String(request.data?.candidatePostId || ""), replyDraftId: String(request.data?.replyDraftId || ""), editedText: request.data?.editedText });
});

exports.recordReplyIntentOpened = onCall({ region: "asia-northeast1" }, async (request) => {
  const user = requireAdmin(request);
  return recordIntentOpened({ db, admin, actorUid: user.uid, candidatePostId: String(request.data?.candidatePostId || ""), replyDraftId: String(request.data?.replyDraftId || ""), finalReplyText: request.data?.finalReplyText, operationId: request.data?.operationId, correlationId: request.data?.correlationId });
});

exports.recordManualSendResult = onCall({ region: "asia-northeast1" }, async (request) => {
  const user = requireAdmin(request);
  const data = request.data || {};
  return recordManualSendResult({ db, admin, actorUid: user.uid, candidatePostId: String(data.candidatePostId || ""), sent: data.sent === true, finalReplyText: data.finalReplyText, replyUrl: data.replyUrl, memo: data.memo, notSentReason: data.notSentReason, feedback: data.feedback, operationId: data.operationId, correlationId: data.correlationId });
});

exports.saveReplyUsageFeedback = onCall({ region: "asia-northeast1" }, async (request) => {
  const user = requireAdmin(request);
  const data = request.data || {};
  return saveUsageFeedback({ db, actorUid: user.uid, candidatePostId: String(data.candidatePostId || ""), feedback: data.feedback, shortReason: data.shortReason, memo: data.memo });
});

exports.saveReplyOutcomeMetrics = onCall({ region: "asia-northeast1" }, async (request) => {
  const user = requireAdmin(request);
  return saveOutcomeMetrics({ db, actorUid: user.uid, candidatePostId: String(request.data?.candidatePostId || ""), metrics: request.data?.metrics || {} });
});

exports.getPhase4OperationsSummary = onCall({ region: "asia-northeast1" }, async (request) => {
  requireAdmin(request);
  return getOperationsSummary({ db });
});

exports.getProductionReadiness = onCall({ region: "asia-northeast1" }, async (request) => {
  const user = requireAdmin(request);
  const environment = evaluateServerEnvironment(process.env, process.env.APP_ENV === "production" ? "production" : "staging");
  let firestoreReadable = false;
  let xConnected = false;
  try {
    await db.collection("creatorProfiles").limit(1).get();
    firestoreReadable = true;
  } catch {
    firestoreReadable = false;
  }
  try {
    const connection = await db.collection("xConnections").doc(user.uid).get();
    xConnected = connection.exists && connection.data()?.status === "connected";
  } catch {
    xConnected = false;
  }
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    environment,
    connectivity: { auth: true, firestore: firestoreReadable, functions: true, xOAuth: xConnected },
    configuration: {
      openAiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      openAiQuota: "unconfirmed",
      openAiMock: environment.flags.openAiMock,
      xApiMock: environment.flags.xApiMock,
      automaticPosting: false,
      webIntentManualSend: true,
    },
    writeCounts: { firestore: 0, auth: 0, xPosts: 0 },
  };
});

exports.saveHumanQualityEvaluation = onCall({ region: "asia-northeast1" }, async (request) => {
  requireAdmin(request);
  const data = normalizeHumanQualityEvaluation(request.data || {});
  if (!data.candidatePostId || !data.replyDraftId) {
    throw new HttpsError("invalid-argument", "評価対象を確認してください。");
  }
  const result = await saveHumanEvaluation({ db, data, evaluationOrigin: "human_manual" });
  await cleanupExpiredEvaluationFingerprints({ db }).catch(() => {});
  return { ok: true, ...result };
});

async function cleanupOldOAuthStates(firebaseUid) {
  const oldStates = await db.collection("xOAuthStates")
    .where("firebaseUid", "==", firebaseUid)
    .where("usedAt", "==", null)
    .limit(10)
    .get();
  const batch = db.batch();
  oldStates.docs.forEach((doc) => batch.set(doc.ref, {
    usedAt: FieldValue.serverTimestamp(),
  }, { merge: true }));
  await batch.commit();
}

async function getConnectionForSync(firebaseUid) {
  if (isMockMode()) {
    return {
      xUserId: mockConnection.xUserId,
      username: mockConnection.username,
      displayName: mockConnection.displayName,
    };
  }
  const snap = await db.collection("xConnections").doc(firebaseUid).get();
  if (!snap.exists || snap.data().status !== "connected") {
    throw new HttpsError("failed-precondition", safeMessage("X_NOT_CONNECTED"), { code: "X_NOT_CONNECTED" });
  }
  return snap.data();
}

function emptyConnectionStatus(lastErrorCode) {
  return {
    connected: false,
    xUserId: null,
    username: null,
    displayName: null,
    profileImageUrl: null,
    scopes: [],
    accessTokenExpiresAt: null,
    lastRefreshedAt: null,
    lastHomeTimelineSyncAt: null,
    lastListTimelineSyncAt: null,
    lastErrorCode,
  };
}

function appBaseUrl() {
  return process.env.APP_BASE_URL || "http://localhost:5173";
}

function callbackUrl() {
  return process.env.X_OAUTH_REDIRECT_URI || `${appBaseUrl()}/__/functions/xOAuthCallback`;
}

function toClientPost(doc) {
  const data = doc.data();
  return serializeTimestamps({
    id: doc.id,
    postId: data.postId,
    postUrl: data.postUrl,
    authorId: data.authorId,
    authorUsername: data.authorUsername,
    authorName: data.authorName,
    authorDescription: data.authorDescription,
    authorProfileImageUrl: data.authorProfileImageUrl,
    text: data.text,
    language: data.language,
    createdAt: data.createdAt,
    conversationId: data.conversationId,
    referencedTweets: data.referencedTweets || [],
    metrics: data.metrics || {},
    authorMetrics: data.authorMetrics || {},
    media: data.media || [],
    sourceTypes: data.sourceTypes || [],
    hardFilter: data.hardFilter || { passed: false, exclusionReasons: [] },
    status: data.status,
    workflowStatus: data.workflowStatus || null,
    workflowVersion: data.workflowVersion || null,
    statusHistory: data.statusHistory || [],
    statusUpdatedAt: data.statusUpdatedAt,
    latestReplyDraftId: data.latestReplyDraftId || null,
    recommendedCandidateKey: data.recommendedCandidateKey || null,
    recommendedReplyText: data.recommendedReplyText || "",
    aiAssessment: data.aiAssessment || null,
    aiDecision: data.aiDecision || null,
    aiProcessing: data.aiProcessing || null,
    generationStatus: data.generationStatus || null,
    generationError: data.generationError || data.aiProcessing?.lastErrorMessageSafe || null,
    generationErrorCode: data.generationErrorCode || data.aiProcessing?.lastErrorCode || null,
    scores: data.scores || {},
    rank: data.rank || null,
    pendingSendConfirmation: data.pendingSendConfirmation === true,
    finalReplyText: data.finalReplyText || "",
    intentOpenedAt: data.intentOpenedAt,
    sentAt: data.sentAt,
    notSentAt: data.notSentAt,
    notSentReason: data.notSentReason || "",
    replyUrl: data.replyUrl || "",
    expiresAt: data.expiresAt,
    updatedAt: data.updatedAt,
  });
}

function serializeTimestamps(value) {
  if (Array.isArray(value)) return value.map(serializeTimestamps);
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeTimestamps(item)]));
  }
  return value;
}
