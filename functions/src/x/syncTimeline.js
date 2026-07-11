const { normalizeTimelineResponse } = require("./normalize");
const { loadHardFilterRuleSet, applyHardFilter } = require("./hardFilter");
const { fetchHomeTimeline, fetchListTimeline, logUsage } = require("./xApiClient");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { assertRuntimeOperationAllowed } = require("../environmentSafety");

const MANUAL_MAX_PAGES = 2;

async function syncTimeline({ db, admin, firebaseUid, sourceType, listId = null, connection, accessToken }) {
  assertRuntimeOperationAllowed(process.env);
  const runRef = db.collection("searchRuns").doc();
  const runId = runRef.id;
  const stateId = sourceType === "home_timeline" ? `${firebaseUid}_home` : `${firebaseUid}_list_${listId}`;
  const stateRef = db.collection("timelineSyncStates").doc(stateId);
  const lockOwner = `${runId}_${Date.now()}`;
  const now = Timestamp.now();
  const lockUntil = Timestamp.fromDate(new Date(Date.now() + 3 * 60 * 1000));

  await db.runTransaction(async (tx) => {
    const stateSnap = await tx.get(stateRef);
    const lockDate = stateSnap.exists ? stateSnap.data().lockUntil?.toDate?.() : null;
    if (lockDate && lockDate.getTime() > Date.now()) {
      throw Object.assign(new Error("SYNC_ALREADY_RUNNING"), { code: "SYNC_ALREADY_RUNNING" });
    }
    tx.set(stateRef, {
      firebaseUid,
      sourceType,
      listId,
      lastStartedAt: now,
      lockUntil,
      lockOwner,
      updatedAt: now,
    }, { merge: true });
  });

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
    newestId: null,
    oldestId: null,
    status: "running",
    errorCode: null,
    errorMessageSafe: null,
    createdAt: now,
    updatedAt: now,
  });

  try {
    const stateSnap = await stateRef.get();
    const sinceId = stateSnap.data()?.latestSinceId || null;
    const ruleSet = await loadHardFilterRuleSet(db);
    let paginationToken = null;
    let newestId = null;
    let oldestId = null;
    let fetchedCount = 0;
    let savedCount = 0;
    let duplicateCount = 0;
    let excludedCount = 0;
    let pagesFetched = 0;
    const exclusionSummary = {};
    const savedPostIds = [];

    for (let page = 0; page < MANUAL_MAX_PAGES; page += 1) {
      const response = sourceType === "home_timeline"
        ? await fetchHomeTimeline({ accessToken, xUserId: connection.xUserId, sinceId, paginationToken })
        : await fetchListTimeline({ accessToken, listId, sinceId, paginationToken });

      pagesFetched += 1;
      fetchedCount += response.meta?.result_count || response.data?.length || 0;
      newestId = newestId || response.meta?.newest_id || null;
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
        if (result.duplicate) duplicateCount += 1;
        if (hardFilter.passed) {
          savedCount += 1;
          savedPostIds.push(post.postId);
        } else {
          excludedCount += 1;
          for (const reason of hardFilter.exclusionReasons) {
            exclusionSummary[reason] = (exclusionSummary[reason] || 0) + 1;
          }
        }
      }

      paginationToken = response.meta?.next_token || null;
      if (!paginationToken) break;
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
      newestId,
      oldestId,
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
      lastErrorCode: null,
      lockUntil: null,
      lockOwner: null,
      updatedAt: completedAt,
    }, { merge: true });

    return {
      success: true,
      runId,
      fetchedCount,
      savedCount,
      duplicateCount,
      excludedCount,
      newestId,
      hasMore: Boolean(paginationToken),
      exclusionSummary,
      savedPostIds,
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
      updatedAt: failedAt,
    }, { merge: true });
    await stateRef.set({
      lastErrorCode: code,
      lastErrorAt: failedAt,
      lockUntil: null,
      lockOwner: null,
      updatedAt: failedAt,
    }, { merge: true });
    throw error;
  }
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

module.exports = { syncTimeline };
