const { normalizeTimelineResponse } = require("./normalize");
const { loadHardFilterRuleSet, applyHardFilter } = require("./hardFilter");
const { fetchHomeTimeline, fetchListTimeline, logUsage, getValidXAccessToken } = require("./xApiClient");
const { writeSafeOperationLog } = require("../logging/safeOperationLog");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { assertRuntimeOperationAllowed } = require("../environmentSafety");

const COOLDOWN_MINUTES = 5;

async function syncTimeline({ db, admin, firebaseUid, sourceType, listId = null, connection, accessToken }) {
  assertRuntimeOperationAllowed(process.env);
  const runRef = db.collection("searchRuns").doc();
  const runId = runRef.id;
  const stateId = sourceType === "home_timeline" ? `${firebaseUid}_home` : `${firebaseUid}_list_${listId}`;
  const stateRef = db.collection("timelineSyncStates").doc(stateId);
  const lockOwner = `${runId}_${Date.now()}`;
  const now = Timestamp.now();
  const lockUntil = Timestamp.fromDate(new Date(Date.now() + 3 * 60 * 1000));
  const cooldownUntil = Timestamp.fromDate(new Date(Date.now() + COOLDOWN_MINUTES * 60 * 1000));

  await db.runTransaction(async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const lockDate = stateSnap.exists ? stateSnap.data().lockUntil?.toDate?.() : null;
    const cooldownDate = stateSnap.exists ? stateSnap.data().cooldownUntil?.toDate?.() : null;
    if (lockDate && lockDate.getTime() > Date.now()) {
      throw Object.assign(new Error("SYNC_ALREADY_RUNNING"), { code: "SYNC_ALREADY_RUNNING" });
    }
    if (cooldownDate && cooldownDate.getTime() > Date.now()) {
      throw Object.assign(new Error("SYNC_COOLDOWN"), { code: "SYNC_COOLDOWN" });
    }
    tx.set(stateRef, {
      firebaseUid,
      sourceType,
      listId,
      lastStartedAt: now,
      lockUntil,
      lockOwner,
      cooldownUntil,
      updatedAt: now,
    }, { merge: true });
  });

  const stateSnap = await stateRef.get();
  const syncPlan = buildSyncPlan(stateSnap.data()?.latestSinceId || null);
  const sinceId = syncPlan.sinceId;
  const previousSinceIdPresent = syncPlan.previousSinceIdPresent;
  const requestedMaxResults = syncPlan.requestedMaxResults;
  const syncMode = syncPlan.syncMode;

  await runRef.set({
    runId,
    firebaseUid,
    sourceType,
    listId,
    startedAt: now,
    completedAt: null,
    fetchedCount: 0,
    savedCount: 0,
    duplicateCount: 0,
    excludedCount: 0,
    exclusionSummary: {},
    pagesFetched: 0,
    apiCallCount: 0,
    requestedMaxResults,
    syncMode,
    sinceIdUsed: sinceId,
    previousSinceIdPresent,
    cooldownUntil,
    newestId: null,
    oldestId: null,
    status: "running",
    errorCode: null,
    errorMessageSafe: null,
    createdAt: now,
    updatedAt: now,
  });

  let newestId = null;
  let oldestId = null;
  let fetchedCount = 0;
  let savedCount = 0;
  let duplicateCount = 0;
  let excludedCount = 0;
  let pagesFetched = 0;
  let actualApiCalls = 0;
  const exclusionSummary = {};
  const savedPostIds = [];
  const seenPostIds = new Set();

  try {
    const ruleSet = await loadHardFilterRuleSet(db);
    const { response, apiCalls } = await fetchTimelineOnce({
      sourceType,
      accessToken,
      xUserId: connection.xUserId,
      listId,
      sinceId,
      requestedMaxResults,
      retry401: true,
      onRetryRefresh: () => getValidXAccessToken({ db, admin, firebaseUid, forceRefresh: true }),
    });
    actualApiCalls += apiCalls;

    pagesFetched += 1;
    fetchedCount += response.meta?.result_count || response.data?.length || 0;
    newestId = response.meta?.newest_id || sinceId || null;
    oldestId = response.meta?.oldest_id || oldestId;
    await logUsage({
      db,
      admin,
      firebaseUid,
      runId,
      endpoint: sourceType === "home_timeline" ? "home_timeline" : "list_timeline",
      fetchedPostCount: response.data?.length || 0,
      fetchedUserCount: response.includes?.users?.length || 0,
      fetchedMediaCount: response.includes?.media?.length || 0,
      success: true,
      statusCode: 200,
    });

    const normalizedPosts = normalizeTimelineResponse(response);
    for (const post of normalizedPosts) {
      if (!post.postId || seenPostIds.has(post.postId)) {
        duplicateCount += 1;
        continue;
      }
      seenPostIds.add(post.postId);
      const existing = await db.collection("candidatePosts").doc(post.postId).get();
      const existingStatus = existing.data()?.status;
      const alreadyProcessed = ["posted", "skipped"].includes(existingStatus);
      const hardFilter = applyHardFilter({ post, ownXUserId: connection.xUserId, ruleSet, alreadyProcessed });
      const result = await saveCandidatePost({
        db,
        admin,
        post,
        sourceType,
        runId,
        hardFilter,
        existing,
      });
      if (result.duplicate) {
        duplicateCount += 1;
      } else if (hardFilter.passed) {
        savedCount += 1;
        savedPostIds.push(post.postId);
      } else {
        excludedCount += 1;
        for (const reason of hardFilter.exclusionReasons) {
          exclusionSummary[reason] = (exclusionSummary[reason] || 0) + 1;
        }
      }
    }

    const completedAt = FieldValue.serverTimestamp();
    await runRef.set({
      completedAt,
      fetchedCount,
      savedCount,
      duplicateCount,
      excludedCount,
      exclusionSummary,
      pagesFetched,
      apiCallCount: actualApiCalls,
      newestId,
      oldestId,
      cooldownUntil,
      status: "completed",
      updatedAt: completedAt,
    }, { merge: true });

    await stateRef.set({
      latestSinceId: newestId || sinceId || null,
      lastNewestId: newestId,
      lastCompletedAt: completedAt,
      lastSuccessfulAt: completedAt,
      lastResultCount: fetchedCount,
      lastSavedCount: savedCount,
      lastExcludedCount: excludedCount,
      lastDuplicateCount: duplicateCount,
      lastApiCallCount: actualApiCalls,
      lastRequestedMaxResults: requestedMaxResults,
      lastSyncMode: syncMode,
      previousSinceIdPresent,
      sinceIdUsed: sinceId,
      lastErrorCode: null,
      lockUntil: null,
      lockOwner: null,
      cooldownUntil,
      updatedAt: completedAt,
    }, { merge: true });

    await writeSafeOperationLog({
      db,
      actorUid: firebaseUid,
      actionType: "candidate_fetched",
      safeMetadata: {
        action: "candidate_fetched",
        source: sourceType,
        requestedMaxResults,
        actualApiCalls,
        fetchedCount,
        savedCount,
        duplicateCount,
        excludedCount,
        sinceIdUsed: Boolean(sinceId),
        previousSinceIdPresent,
        syncMode,
        cooldownApplied: true,
        result: "success",
        correlationId: runId,
      },
      operationId: runId,
    });

    return {
      success: true,
      runId,
      fetchedCount,
      savedCount,
      duplicateCount,
      excludedCount,
      newestId,
      hasMore: false,
      exclusionSummary,
      savedPostIds,
      apiCallCount: actualApiCalls,
      requestedMaxResults,
      syncMode,
      sinceIdUsed: sinceId,
      previousSinceIdPresent,
    };
  } catch (error) {
    const code = error.code || "UNKNOWN_ERROR";
    console.error("syncTimeline failed", { code, message: error.message });
    const failedAt = FieldValue.serverTimestamp();
    await runRef.set({
      completedAt: failedAt,
      status: "failed",
      errorCode: code,
      errorMessageSafe: code,
      cooldownUntil,
      updatedAt: failedAt,
    }, { merge: true });
    await stateRef.set({
      lastErrorCode: code,
      lastErrorAt: failedAt,
      lastDuplicateCount: duplicateCount,
      lockUntil: null,
      lockOwner: null,
      cooldownUntil,
      updatedAt: failedAt,
    }, { merge: true });
    await writeSafeOperationLog({
      db,
      actorUid: firebaseUid,
      actionType: "candidate_fetched",
      safeMetadata: {
        action: "candidate_fetched",
        source: sourceType,
        requestedMaxResults,
        actualApiCalls: Number.isFinite(actualApiCalls) ? actualApiCalls : 0,
        fetchedCount,
        savedCount,
        duplicateCount,
        excludedCount,
        sinceIdUsed: Boolean(sinceId),
        previousSinceIdPresent,
        syncMode,
        cooldownApplied: true,
        result: "failed",
        errorCode: code,
        correlationId: runId,
      },
      operationId: runId,
    }).catch(() => {});
    throw error;
  }
}

async function fetchTimelineOnce({ sourceType, accessToken, xUserId, listId, sinceId, requestedMaxResults, retry401, onRetryRefresh }) {
  const fetcher = sourceType === "home_timeline"
    ? () => fetchHomeTimeline({ accessToken, xUserId, sinceId, maxResults: requestedMaxResults })
    : () => fetchListTimeline({ accessToken, listId, sinceId, maxResults: requestedMaxResults });
  try {
    const response = await fetcher();
    return { response, apiCalls: 1 };
  } catch (error) {
    const status = error?.status || error?.response?.status;
    if (retry401 && status === 401) {
      const refreshedAccessToken = await onRetryRefresh();
      const retryResponse = sourceType === "home_timeline"
        ? await fetchHomeTimeline({ accessToken: refreshedAccessToken, xUserId, sinceId, maxResults: requestedMaxResults })
        : await fetchListTimeline({ accessToken: refreshedAccessToken, listId, sinceId, maxResults: requestedMaxResults });
      return { response: retryResponse, apiCalls: 2 };
    }
    throw error;
  }
}

function buildSyncPlan(latestSinceId) {
  const sinceId = latestSinceId ? String(latestSinceId) : null;
  const previousSinceIdPresent = Boolean(sinceId);
  return {
    sinceId,
    previousSinceIdPresent,
    requestedMaxResults: previousSinceIdPresent ? 20 : 50,
    syncMode: previousSinceIdPresent ? "incremental" : "initial",
  };
}

async function saveCandidatePost({ db, post, sourceType, runId, hardFilter, existing }) {
  const ref = db.collection("candidatePosts").doc(post.postId || "invalid_post_id");
  const existingData = existing.exists ? existing.data() : null;
  const now = FieldValue.serverTimestamp();
  const createdAt = post.createdAt ? Timestamp.fromDate(new Date(post.createdAt)) : null;
  const expiresAt = post.createdAt
    ? Timestamp.fromDate(new Date(new Date(post.createdAt).getTime() + 6 * 60 * 60 * 1000))
    : null;
  const stickyStatus = ["opened", "skipped", "posted"].includes(existingData?.status);
  const status = stickyStatus ? existingData.status : hardFilter.passed ? "candidate" : "filtered_out";
  const existingSourceTypes = existingData?.sourceTypes || [];
  const existingRunIds = existingData?.sourceRunIds || [];

  await ref.set({
    ...post,
    createdAt,
    sourceTypes: Array.from(new Set([...existingSourceTypes, sourceType])),
    sourceRunIds: Array.from(new Set([...existingRunIds, runId])).slice(-20),
    hardFilter,
    status,
    firstDiscoveredAt: existingData?.firstDiscoveredAt || now,
    lastDiscoveredAt: now,
    lastMetricsUpdatedAt: now,
    expiresAt,
    updatedAt: now,
  }, { merge: true });

  return { duplicate: existing.exists };
}

module.exports = { syncTimeline, buildSyncPlan, fetchTimelineOnce };
