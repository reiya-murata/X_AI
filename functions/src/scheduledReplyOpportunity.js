const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { assertRuntimeOperationAllowed } = require("./environmentSafety");
const { loadHardFilterRuleSet, passesMinimumImpressions, passesMaxPostAge } = require("./x/hardFilter");
const { processCandidateWithAi } = require("./phase3/analysis");
const { loadPublicIdentity } = require("./identity/loadPublicIdentity");
const { pickScenario } = require("./phase3/mockFixtures");
const { writeSafeOperationLog } = require("./logging/safeOperationLog");

const CONFIG_ID = "scheduled-reply-opportunity-v1";
const STATE_ID = "global";
const DAILY_LIMIT = 8;
const WINDOW_MINUTES = 60;
const TOP_GENERATIONS = 1;
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 23;
const DEFAULT_UNCONFIRMED_LIMIT = 20;
const DEFAULT_QUALITY_SCORE_MINIMUM = 75;
const DEFAULT_WEIGHTS = Object.freeze({
  freshness: 0.3,
  engagementRate: 0.25,
  impressions: 0.2,
  relevance: 0.2,
  authorDiversity: 0.05,
});

async function getScheduledReplyOpportunityConfig(db) {
  const snap = await db.collection("scheduledReplyOpportunitySettings").doc(CONFIG_ID).get();
  return snap.exists ? normalizeConfig(snap.data()) : defaultConfig();
}

async function saveScheduledReplyOpportunityConfig(db, patch = {}) {
  const current = await getScheduledReplyOpportunityConfig(db);
  const merged = normalizeConfig({ ...current, ...patch });
  await db.collection("scheduledReplyOpportunitySettings").doc(CONFIG_ID).set({
    ...merged,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return merged;
}

function defaultConfig() {
  return {
    scheduledReplyOpportunityEnabled: false,
    minimumImpressions: 5000,
    maxPostAgeHours: 24,
    generationLimitPerRun: 1,
    dailyLimit: DAILY_LIMIT,
    authorCooldownHours: 24,
    postCooldownHours: 24,
    minOpportunityScore: DEFAULT_QUALITY_SCORE_MINIMUM,
    qualityScoreMinimum: DEFAULT_QUALITY_SCORE_MINIMUM,
    unconfirmedLimit: DEFAULT_UNCONFIRMED_LIMIT,
    operatingHoursStart: DEFAULT_START_HOUR,
    operatingHoursEnd: DEFAULT_END_HOUR,
    weights: { ...DEFAULT_WEIGHTS },
    version: 1,
  };
}

function normalizeConfig(input = {}) {
  const fallback = defaultConfig();
  const weights = input.weights && typeof input.weights === "object" ? input.weights : {};
  return {
    ...fallback,
    ...input,
    scheduledReplyOpportunityEnabled: input.scheduledReplyOpportunityEnabled === true,
    minimumImpressions: normalizeInteger(input.minimumImpressions, fallback.minimumImpressions),
    maxPostAgeHours: normalizeInteger(input.maxPostAgeHours, fallback.maxPostAgeHours),
    generationLimitPerRun: Math.max(1, normalizeInteger(input.generationLimitPerRun, fallback.generationLimitPerRun)),
    dailyLimit: Math.max(1, normalizeInteger(input.dailyLimit, fallback.dailyLimit)),
    authorCooldownHours: Math.max(1, normalizeInteger(input.authorCooldownHours, fallback.authorCooldownHours)),
    postCooldownHours: Math.max(1, normalizeInteger(input.postCooldownHours, fallback.postCooldownHours)),
    minOpportunityScore: normalizeInteger(input.minOpportunityScore ?? input.qualityScoreMinimum, fallback.minOpportunityScore),
    qualityScoreMinimum: normalizeInteger(input.qualityScoreMinimum ?? input.minOpportunityScore, fallback.qualityScoreMinimum),
    unconfirmedLimit: Math.max(1, normalizeInteger(input.unconfirmedLimit, fallback.unconfirmedLimit)),
    operatingHoursStart: normalizeHour(input.operatingHoursStart, fallback.operatingHoursStart),
    operatingHoursEnd: normalizeHour(input.operatingHoursEnd, fallback.operatingHoursEnd),
    weights: {
      freshness: normalizeWeight(weights.freshness, fallback.weights.freshness),
      engagementRate: normalizeWeight(weights.engagementRate, fallback.weights.engagementRate),
      impressions: normalizeWeight(weights.impressions, fallback.weights.impressions),
      relevance: normalizeWeight(weights.relevance, fallback.weights.relevance),
      authorDiversity: normalizeWeight(weights.authorDiversity, fallback.weights.authorDiversity),
    },
  };
}

function normalizeWeight(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : fallback;
}

function normalizeInteger(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? Math.round(num) : fallback;
}

function normalizeHour(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 && num <= 23 ? Math.round(num) : fallback;
}

async function runScheduledReplyOpportunity({ db, admin, now = new Date(), force = false } = {}) {
  assertRuntimeOperationAllowed(process.env);
  const config = await getScheduledReplyOpportunityConfig(db);
  if (!config.scheduledReplyOpportunityEnabled && !force) {
    return { ok: true, skipped: true, reason: "scheduled_reply_opportunity_disabled", config };
  }
  if (!force && !isWithinOperatingWindow(now, config)) {
    return { ok: true, skipped: true, reason: "outside_operating_window", config };
  }

  const nowMs = now.getTime();
  const jstKey = formatJst(now);
  const runKey = `${jstKey.date}T${jstKey.hour}`;
  const stateRef = db.collection("scheduledReplyOpportunityState").doc(STATE_ID);
  const runRef = db.collection("scheduledReplyOpportunityRuns").doc(runKey);
  const lockOwner = `${runKey}_${nowMs}`;
  const lockUntil = Timestamp.fromDate(new Date(nowMs + 5 * 60 * 1000));
  let state = null;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    state = snap.exists ? snap.data() : null;
    const lockDate = state?.lockUntil?.toDate?.();
    if (lockDate && lockDate.getTime() > nowMs) {
      throw new HttpsError("failed-precondition", "スケジュール実行が重複しています。");
    }
    if (state?.lastRunKey === runKey) {
      throw new HttpsError("failed-precondition", "同一時間帯の実行はすでに処理済みです。");
    }
    const lastRunAt = state?.lastRunAt?.toDate?.();
    if (lastRunAt && (nowMs - lastRunAt.getTime()) < WINDOW_MINUTES * 60 * 1000) {
      throw new HttpsError("failed-precondition", "直近60分以内に生成済みです。");
    }
    const dayKey = jstKey.date;
    const dayCount = state?.dailyCounts?.[dayKey] || 0;
    if (dayCount >= config.dailyLimit) {
      throw new HttpsError("failed-precondition", "日次上限に達しています。");
    }
    tx.set(stateRef, {
      lockOwner,
      lockUntil,
      lastRunKey: runKey,
      lastRunAt: Timestamp.fromDate(now),
      activeDayKey: dayKey,
      updatedAt: Timestamp.fromDate(now),
    }, { merge: true });
    tx.set(runRef, {
      runKey,
      dayKey,
      startedAt: Timestamp.fromDate(now),
      status: "running",
      configSnapshot: summarizeConfig(config),
      lockOwner,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    }, { merge: true });
  });

  try {
    const candidates = await loadEligibleCandidates({ db, config, nowMs });
    if (candidates.length === 0) {
      await finalizeRun({ db, stateRef, runRef, now, result: { status: "empty", selectedCount: 0, selected: [] } });
      return { ok: true, selectedCount: 0, opportunities: [] };
    }

    const selected = candidates.slice(0, config.generationLimitPerRun).slice(0, TOP_GENERATIONS);
    const opportunities = [];
    for (const candidate of selected) {
      const beforeDrafts = await db.collection("replyDrafts").where("candidatePostId", "==", candidate.postId).get().catch(() => ({ docs: [] }));
      const aiResult = await processCandidateWithAi({ db, admin, candidatePostId: candidate.postId, firebaseUid: candidate.firebaseUid || null });
      const draftId = aiResult.replyDraftId || beforeDrafts.docs[0]?.id || null;
      const scenario = pickScenario(candidate);
      const opportunity = {
        schemaVersion: 1,
        scheduledReplyOpportunityId: candidate.postId,
        candidatePostId: candidate.postId,
        candidateDocId: candidate.docId || candidate.postId,
        firebaseUid: candidate.firebaseUid || null,
        authorId: candidate.authorId || null,
        authorUsername: candidate.authorUsername || "",
        authorName: candidate.authorName || "",
        postText: candidate.text || "",
        postUrl: candidate.postUrl || "",
        sourceTypes: candidate.sourceTypes || [],
        createdAt: Timestamp.fromDate(now),
        updatedAt: Timestamp.fromDate(now),
        runKey,
        dayKey: jstKey.date,
        status: "reviewed",
        opportunityScore: candidate.opportunityScore,
        qualityScore: candidate.opportunityScore,
        scoreComponents: candidate.scoreComponents,
        selectionReason: candidate.selectedReason,
        selectedReason: candidate.selectedReason,
        excludedReasons: candidate.excludedReasons,
        replyDraftId: draftId,
        generatedReply: aiResult.decision?.replies?.[aiResult.recommendedCandidateKey || "A"]?.text || aiResult.decision?.replies?.A?.text || "",
        replyText: candidate.recommendedReplyText || "",
        replyDraft: aiResult.decision?.replies?.[aiResult.recommendedCandidateKey || "A"]?.text || aiResult.decision?.replies?.A?.text || "",
        generatedAt: Timestamp.fromDate(now),
        generationModel: aiResult.adapterOutput?.model || null,
        promptVersion: aiResult.adapterOutput?.promptVersion || null,
        idempotencyKey: `${candidate.postId}_${jstKey.date}_${jstKey.hour}`,
        generationResult: {
          finalRecommendation: aiResult.finalRecommendation || null,
          recommendedCandidateKey: aiResult.recommendedCandidateKey || null,
          mock: Boolean(aiResult.generationSkipped),
          scenario: scenario === undefined ? null : scenario,
        },
        notificationSentAt: null,
        dismissedAt: null,
        openedAt: null,
        sentConfirmedAt: null,
        skippedAt: null,
      };
      await db.collection("scheduledReplyOpportunities").doc(candidate.postId).set(opportunity, { merge: true });
      await writeSafeOperationLog({
        db,
        actorUid: candidate.firebaseUid || null,
        actionType: "scheduled_reply_opportunity_generated",
        candidatePostId: candidate.postId,
        replyDraftId: draftId,
        safeMetadata: {
          action: "scheduled_reply_opportunity_generated",
          result: "success",
        },
        correlationId: runKey,
        operationId: runKey,
      });
      opportunities.push({ ...opportunity, createdAt: now.toISOString(), updatedAt: now.toISOString() });
    }
    await finalizeRun({ db, stateRef, runRef, now, result: { status: "completed", selectedCount: opportunities.length, selected: opportunities } });
    return { ok: true, selectedCount: opportunities.length, opportunities };
  } catch (error) {
    await finalizeRun({ db, stateRef, runRef, now, result: { status: "failed", errorCode: error.code || "UNKNOWN", errorMessage: error.message || "unknown" } });
    throw error;
  }
}

async function loadEligibleCandidates({ db, config, nowMs }) {
  const snap = await db.collection("candidatePosts")
    .where("status", "in", ["candidate", "opened"])
    .orderBy("createdAt", "desc")
    .limit(120)
    .get();
  const ruleSet = await loadHardFilterRuleSet(db);
  const identity = await loadPublicIdentity(db).catch(() => null);
  const usedToday = await loadRecentOpportunityState(db);
  const candidates = [];
  for (const doc of snap.docs) {
    const candidate = normalizeCandidate(doc);
    if (!candidate) continue;
    if (candidate.latestReplyDraftId || candidate.aiProcessing?.status === "draft_ready" || candidate.aiProcessing?.status === "generating") {
      continue;
    }
    if (usedToday.postIds.has(candidate.postId)) {
      candidate.excludedReasons = ["already_generated"];
      continue;
    }
    if (usedToday.authorIds.has(candidate.authorId)) {
      candidate.excludedReasons = ["author_cooldown"];
      continue;
    }
    if (usedToday.recentPostIds.has(candidate.postId)) {
      candidate.excludedReasons = ["recently_generated"];
      continue;
    }
    const hardFilterPass = candidate.hardFilter?.passed === true
      && passesMinimumImpressions(candidate, config.minimumImpressions)
      && passesMaxPostAge(candidate, config.maxPostAgeHours);
    if (!hardFilterPass) continue;
    const score = computeOpportunityScore(candidate, { config, identity, ruleSet, nowMs, recentUsage: usedToday });
    if (score.total < config.qualityScoreMinimum) {
      continue;
    }
    candidate.opportunityScore = score.total;
    candidate.scoreComponents = score.components;
    candidate.selectedReason = score.selectedReason;
    candidate.excludedReasons = score.excludedReasons;
    candidates.push(candidate);
  }
  candidates.sort((a, b) => b.opportunityScore - a.opportunityScore || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  return candidates.slice(0, config.unconfirmedLimit);
}

async function loadRecentOpportunityState(db) {
  const snap = await db.collection("scheduledReplyOpportunities").orderBy("createdAt", "desc").limit(50).get().catch(() => ({ docs: [] }));
  const recentPostIds = new Set();
  const authorIds = new Set();
  const postIds = new Set();
  for (const doc of snap.docs || []) {
    const data = doc.data();
    if (!data) continue;
    postIds.add(data.candidatePostId);
    if (data.authorId) authorIds.add(data.authorId);
    recentPostIds.add(data.candidatePostId);
  }
  return { recentPostIds, authorIds, postIds };
}

function computeOpportunityScore(candidate, { config, identity, ruleSet, nowMs }) {
  const ageMinutes = Math.max(1, Math.round((nowMs - parseTime(candidate.createdAt)) / 60000));
  const freshnessScore = clamp01(1 - (ageMinutes / Math.max(60, config.maxPostAgeHours * 60)));
  const engagementRate = normalizeEngagementRate(candidate.metrics);
  const impressionScore = normalizeImpressionScore(candidate.metrics?.impressions, config.minimumImpressions);
  const relevanceScore = calculateRelevance(candidate, identity, ruleSet);
  const authorDiversity = candidate.authorId ? 1 : 0.5;
  const weights = config.weights;
  const weighted = (
    freshnessScore * weights.freshness
    + engagementRate * weights.engagementRate
    + impressionScore * weights.impressions
    + relevanceScore * weights.relevance
    + authorDiversity * weights.authorDiversity
  ) / sumWeights(weights);
  const total = Math.round(weighted * 100);
  return {
    total,
    components: {
      freshness: Math.round(freshnessScore * 100),
      engagementRate: Math.round(engagementRate * 100),
      impressionScore: Math.round(impressionScore * 100),
      relevance: Math.round(relevanceScore * 100),
      authorDiversity: Math.round(authorDiversity * 100),
    },
    selectedReason: buildSelectedReason(candidate, { freshnessScore, engagementRate, impressionScore, relevanceScore }),
    excludedReasons: candidate.excludedReasons || [],
  };
}

function buildSelectedReason(candidate, scores) {
  const reasons = [];
  if (scores.freshnessScore >= 0.7) reasons.push("新しい投稿");
  if (scores.engagementRate >= 0.3) reasons.push("反応率が高い");
  if (scores.impressionScore >= 0.5) reasons.push("表示回数が十分");
  if (scores.relevanceScore >= 0.4) reasons.push("発信テーマと近い");
  if (!reasons.length) reasons.push("総合スコアが高い");
  return reasons.slice(0, 3).join(" / ");
}

function calculateRelevance(candidate, identity, ruleSet) {
  const text = `${candidate.text || ""} ${candidate.authorName || ""} ${candidate.authorUsername || ""}`.toLowerCase();
  const keywords = [];
  if (identity?.experiences) {
    for (const item of identity.experiences) {
      for (const keyword of item.relatedKeywords || []) keywords.push(String(keyword).toLowerCase());
    }
  }
  if (identity?.opinions) {
    for (const item of identity.opinions) {
      if (item.statement) keywords.push(String(item.statement).toLowerCase());
      if (item.category) keywords.push(String(item.category).toLowerCase());
    }
  }
  const matches = keywords.filter((keyword) => keyword && text.includes(keyword)).length;
  const base = Math.min(1, matches / Math.max(4, keywords.length || 1));
  const ruleBoost = Array.isArray(ruleSet?.blockedAuthorIds) ? 0 : 0;
  return Math.max(0, Math.min(1, base + ruleBoost));
}

function normalizeEngagementRate(metrics = {}) {
  const likes = Number(metrics.likes || 0);
  const replies = Number(metrics.replies || 0);
  const reposts = Number(metrics.reposts || 0);
  const quotes = Number(metrics.quotes || 0);
  const impressions = Number(metrics.impressions || 0);
  if (!Number.isFinite(impressions) || impressions <= 0) return 0;
  return clamp01((likes + replies * 2 + reposts * 2 + quotes * 1.5) / impressions);
}

function normalizeImpressionScore(impressions, minimumImpressions) {
  const value = Number(impressions);
  if (!Number.isFinite(value) || value <= 0) return 0;
  const threshold = Math.max(1, Number(minimumImpressions) || 1);
  return clamp01(Math.log10(value) / Math.log10(Math.max(threshold * 10, 10)));
}

function sumWeights(weights) {
  return Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0) || 1;
}

function parseTime(value) {
  if (!value) return Date.now();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Date.now();
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeCandidate(doc) {
  const data = doc.data();
  if (!data?.postId || !data?.text) return null;
  return {
    docId: doc.id,
    firebaseUid: data.firebaseUid || null,
    postId: data.postId,
    authorId: data.authorId || "",
    authorUsername: data.authorUsername || "",
    authorName: data.authorName || "",
    text: data.text || "",
    postUrl: data.postUrl || "",
    sourceTypes: Array.isArray(data.sourceTypes) ? data.sourceTypes : [],
    createdAt: data.createdAt,
    metrics: data.metrics || {},
    hardFilter: data.hardFilter || { passed: false, exclusionReasons: [] },
    latestReplyDraftId: data.latestReplyDraftId || null,
    aiProcessing: data.aiProcessing || null,
    recommendedReplyText: data.recommendedReplyText || "",
  };
}

async function finalizeRun({ db, stateRef, runRef, now, result }) {
  const dayKey = formatJst(now).date;
  const dayCounts = await bumpDailyCount(db, dayKey, result.selectedCount || 0);
  const payload = {
    ...result,
    completedAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
    lockOwner: null,
    lockUntil: null,
    dayKey,
    dailyCounts: dayCounts,
  };
  await runRef.set(payload, { merge: true });
  await stateRef.set({
    lastRunAt: Timestamp.fromDate(now),
    lastRunKey: result.status === "empty" ? `${dayKey}T${formatJst(now).hour}` : result.status === "failed" ? null : `${dayKey}T${formatJst(now).hour}`,
    lastResultStatus: result.status,
    lastResultSelectedCount: result.selectedCount || 0,
    lockOwner: null,
    lockUntil: null,
    dailyCounts: dayCounts,
    updatedAt: Timestamp.fromDate(now),
  }, { merge: true });
}

async function bumpDailyCount(db, dayKey, selectedCount) {
  const stateRef = db.collection("scheduledReplyOpportunityState").doc(STATE_ID);
  const snap = await stateRef.get();
  const state = snap.exists ? snap.data() : {};
  const current = Number(state.dailyCounts?.[dayKey] || 0);
  const next = current + Number(selectedCount || 0);
  return { ...(state.dailyCounts || {}), [dayKey]: next };
}

function formatJst(date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: parts.hour };
}

function summarizeConfig(config) {
  return {
    scheduledReplyOpportunityEnabled: config.scheduledReplyOpportunityEnabled,
    minimumImpressions: config.minimumImpressions,
    maxPostAgeHours: config.maxPostAgeHours,
    generationLimitPerRun: config.generationLimitPerRun,
    dailyLimit: config.dailyLimit,
    authorCooldownHours: config.authorCooldownHours,
    postCooldownHours: config.postCooldownHours,
    minOpportunityScore: config.minOpportunityScore,
    qualityScoreMinimum: config.qualityScoreMinimum,
    unconfirmedLimit: config.unconfirmedLimit,
    operatingHoursStart: config.operatingHoursStart,
    operatingHoursEnd: config.operatingHoursEnd,
    weights: config.weights,
    version: config.version,
  };
}

function isWithinOperatingWindow(now = new Date(), config = defaultConfig()) {
  const hour = Number(now.toLocaleString("en-US", { hour: "2-digit", hour12: false, timeZone: "Asia/Tokyo" }));
  const start = normalizeHour(config.operatingHoursStart, DEFAULT_START_HOUR);
  const end = normalizeHour(config.operatingHoursEnd, DEFAULT_END_HOUR);
  if (Number.isNaN(hour)) return false;
  if (start === end) return true;
  if (start < end) return hour >= start && hour <= end;
  return hour >= start || hour <= end;
}

function buildOperatingWindowKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}${lookup.month}${lookup.day}_${lookup.hour}${lookup.minute}`;
}

async function updateScheduledReplyOpportunityDraft({ db, actorUid, draftId, replyDraft, replyText, qualityScore = null, status = null, selectionReason = null, actionType = "draft_edited" }) {
  const normalizedId = String(draftId || "").trim();
  if (!normalizedId) throw new HttpsError("invalid-argument", "返信下書きIDが必要です。");
  const ref = db.collection("scheduledReplyOpportunities").doc(normalizedId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "返信下書きが見つかりません。");
  const text = String(replyText ?? replyDraft ?? "").trim();
  if (text && text.length > 280) throw new HttpsError("invalid-argument", "返信文は280文字以内で入力してください。");
  const nextStatus = normalizeDraftStatus(status, snap.data().status);
  await ref.set({
    replyDraft: text || snap.data().replyDraft || "",
    replyText: text || snap.data().replyText || "",
    qualityScore: normalizeScore(qualityScore, snap.data().qualityScore),
    status: nextStatus,
    selectionReason: selectionReason || snap.data().selectionReason || "",
    reviewedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (actionType) {
    await writeSafeOperationLog({
      db,
      actorUid,
      actionType,
      candidatePostId: normalizedId,
      replyDraftId: normalizedId,
      safeMetadata: {
        action: actionType,
        result: "success",
        candidatePostId: normalizedId,
      },
      operationId: `${normalizedId}_${Date.now()}`,
    });
  }
  return { ok: true, draftId: normalizedId, status: nextStatus, replyDraft: text };
}

async function markScheduledReplyOpportunityOpened({ db, actorUid, draftId, replyText }) {
  const normalizedId = String(draftId || "").trim();
  if (!normalizedId) throw new HttpsError("invalid-argument", "返信下書きIDが必要です。");
  const ref = db.collection("scheduledReplyOpportunities").doc(normalizedId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "返信下書きが見つかりません。");
  const text = String(replyText || snap.data().replyDraft || snap.data().replyText || "").trim();
  await ref.set({
    replyDraft: text,
    replyText: text,
    status: "opened_in_x",
    openedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeSafeOperationLog({
    db,
    actorUid,
    actionType: "web_intent_opened",
    candidatePostId: normalizedId,
    replyDraftId: normalizedId,
    safeMetadata: { action: "web_intent_opened", result: "success", candidatePostId: normalizedId },
    operationId: `${normalizedId}_opened_${Date.now()}`,
  });
  return { ok: true, draftId: normalizedId, status: "opened_in_x", replyText: text };
}

async function dismissScheduledReplyOpportunity({ db, actorUid, draftId, reason = "other" }) {
  const normalizedId = String(draftId || "").trim();
  if (!normalizedId) throw new HttpsError("invalid-argument", "返信下書きIDが必要です。");
  const ref = db.collection("scheduledReplyOpportunities").doc(normalizedId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "返信下書きが見つかりません。");
  await ref.set({
    status: "dismissed",
    dismissedAt: FieldValue.serverTimestamp(),
    skippedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await writeSafeOperationLog({
    db,
    actorUid,
    actionType: "scheduled_reply_opportunity_dismissed",
    candidatePostId: normalizedId,
    replyDraftId: normalizedId,
    safeMetadata: { action: "scheduled_reply_opportunity_dismissed", result: "success", candidatePostId: normalizedId, source: reason },
    operationId: `${normalizedId}_dismiss_${Date.now()}`,
  });
  return { ok: true, draftId: normalizedId, status: "dismissed" };
}

function normalizeDraftStatus(status, fallback) {
  const allowed = new Set(["unread", "reviewed", "opened_in_x", "dismissed", "sent_confirmed", "expired"]);
  const value = String(status || "").trim();
  if (allowed.has(value)) return value;
  return allowed.has(fallback) ? fallback : "reviewed";
}

function normalizeScore(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return Number.isFinite(Number(fallback)) ? Number(fallback) : null;
  return Math.max(0, Math.min(100, Math.round(num)));
}

module.exports = {
  CONFIG_ID,
  STATE_ID,
  getScheduledReplyOpportunityConfig,
  saveScheduledReplyOpportunityConfig,
  runScheduledReplyOpportunity,
  defaultConfig,
  normalizeConfig,
  computeOpportunityScore,
  formatJst,
  normalizeEngagementRate,
  normalizeImpressionScore,
  isWithinOperatingWindow,
  buildOperatingWindowKey,
  updateScheduledReplyOpportunityDraft,
  markScheduledReplyOpportunityOpened,
  dismissScheduledReplyOpportunity,
};
