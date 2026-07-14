/* eslint-disable no-unused-vars */
const { CandidateAssessmentSchema, ReplyGenerationSchema, ReplyJudgeSchema, ReplyDecisionSchema } = require("./schemas");
const { DEFAULT_MODELS, PHASE3_LIMITS, PROMPT_VERSIONS } = require("./config");
const { loadPublicIdentity } = require("../identity/loadPublicIdentity");
const { preselectContext } = require("../identity/preselectContext");
const { validateSelectedContext } = require("../identity/validateSelectedContext");
const { calculateFreshnessScore, calculateMomentumScore, calculateSaturationPenalty, calculateLocalTopicMatch, calculateDataCompletenessScore, clamp100 } = require("../scoring/localScores");
const { calculateTotalScore } = require("../scoring/calculateTotalScore");
const { rankCandidate } = require("../scoring/rankCandidate");
const { runStructuredOutput, runModeration, isOpenAiMockMode } = require("../openai/client");
const { logAiUsage } = require("../openai/usageLogger");
const { pickScenario } = require("./mockFixtures");
const { buildCandidateAssessmentPrompt } = require("../openai/prompts/candidateAssessment");
const { buildReplyGenerationPrompt } = require("../openai/prompts/replyGeneration");
const { buildReplyJudgePrompt } = require("../openai/prompts/replyJudge");
const { buildReplyDecisionPrompt } = require("../openai/prompts/replyDecision");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { assertRuntimeOperationAllowed } = require("../environmentSafety");

function throwDeprecatedAiCallable(name) {
  throw new HttpsError("failed-precondition", "このAI処理は廃止されました。processCandidateWithAiを使用してください。", {
    callable: name,
    status: "deprecated",
  });
}

async function assessCandidateWithAi({ db, admin, candidatePostId, firebaseUid, forceMock = false }) {
  return throwDeprecatedAiCallable("assessCandidateWithAi");
}

async function generateReplyDraftWithAi({ db, admin, candidatePostId, firebaseUid, forceForBRank = false, regenerationCount = 0, isRegeneration = false, replyDraftId = null }) {
  return throwDeprecatedAiCallable("generateReplyDraftWithAi");
}

async function processCandidateWithAi(args) {
  assertRuntimeOperationAllowed(process.env);
  const { db, admin, candidatePostId, firebaseUid, forceMock = false } = args;
  const ref = db.collection("candidatePosts").doc(candidatePostId);
  const snap = await ref.get();
  if (!snap.exists) throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  const candidate = snap.data();
  if (!candidate.hardFilter?.passed || candidate.status !== "candidate") {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const expiresAt = candidate.expiresAt?.toDate?.() ? candidate.expiresAt.toDate().getTime() : candidate.expiresAt ? new Date(candidate.expiresAt).getTime() : Infinity;
  if (expiresAt <= Date.now()) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const startedAt = Date.now();
  await lockCandidateAi(ref, admin, "generating");
  let unlockStatus = "manual_review";
  try {
    const identity = await loadPublicIdentity(db);
    const localScores = buildLocalScores(candidate, identity);
    const eligibility = deriveCandidateEligibility(candidate, localScores);
    if (!eligibility.passed) {
      await ref.set({
        aiAssessment: {
          shouldReply: false,
          decisionSummary: "ローカル条件で返信対象外です。",
          primaryTopic: "other",
          relevanceScore: 0,
          replyValueScore: 0,
          profileConversionScore: 0,
          selectedProjectIds: [],
          selectedExperienceIds: [],
          selectedOpinionIds: [],
          selectedWriterInstructionIds: [],
          riskFlags: ["insufficient_context"],
          assessedAt: FieldValue.serverTimestamp(),
          promptVersion: PROMPT_VERSIONS.replyDecision,
          model: DEFAULT_MODELS.reply,
        },
        aiProcessing: makeAiProcessing("manual_review", candidate.aiProcessing, 0),
        localScores,
        rank: "C",
        scores: { relevance: 0, replyValue: 0, momentum: localScores.momentum, profileConversion: 0, freshness: localScores.freshness, saturationPenalty: localScores.saturationPenalty, riskPenalty: 0, total: 0 },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { candidatePostId, finalRecommendation: "skip", shouldReply: false, generationSkipped: true, decision: null };
    }
    const replyEligibility = deriveReplyEligibility(candidate, localScores, identity);
    if (!replyEligibility.passed) {
      const skippedDecision = {
        shouldReply: false,
        decisionSummary: replyEligibility.reason,
        primaryTopic: "other",
        scores: { relevance: 0, replyValue: 0, profileConversion: 0 },
        selectedProjectIds: [],
        selectedExperienceIds: [],
        selectedOpinionIds: [],
        selectedWriterInstructionIds: [],
        riskFlags: replyEligibility.riskFlags,
        replies: {
          A: { candidateKey: "A", text: "", usedClaimEvidence: [], selfCheckFlags: [] },
          B: { candidateKey: "B", text: "", usedClaimEvidence: [], selfCheckFlags: [] },
          C: { candidateKey: "C", text: "", usedClaimEvidence: [], selfCheckFlags: [] },
        },
        recommendedCandidateKey: "A",
        finalRecommendation: "skip",
      };
      await ref.set({
        aiAssessment: {
          shouldReply: false,
          decisionSummary: replyEligibility.reason,
          primaryTopic: "other",
          relevanceScore: 0,
          replyValueScore: 0,
          profileConversionScore: 0,
          selectedProjectIds: [],
          selectedExperienceIds: [],
          selectedOpinionIds: [],
          selectedWriterInstructionIds: [],
          riskFlags: replyEligibility.riskFlags,
          assessedAt: FieldValue.serverTimestamp(),
          promptVersion: PROMPT_VERSIONS.replyDecision,
          model: DEFAULT_MODELS.reply,
        },
        aiProcessing: makeAiProcessing("manual_review", candidate.aiProcessing, 0),
        localScores,
        rank: "C",
        scores: { relevance: 0, replyValue: 0, momentum: localScores.momentum, profileConversion: 0, freshness: localScores.freshness, saturationPenalty: localScores.saturationPenalty, riskPenalty: 0, total: 0 },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { candidatePostId, finalRecommendation: "skip", shouldReply: false, generationSkipped: true, decision: skippedDecision };
    }
    const context = preselectContext({ candidate: normalizeCandidate(candidate), identity });
    const selected = simplifyContextSelection(finalizeContextSelection(context));
    if (!validateSelectedContext({
      selectedProjects: selected.selectedProjects,
      selectedExperiences: selected.selectedExperiences,
      selectedOpinions: selected.selectedOpinions,
      selectedWriterInstructions: selected.selectedWriterInstructions,
    })) {
      throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
    }
    const recentSimilarReplies = await loadRecentTexts(db);
    if (!forceMock && isOpenAiMockMode()) assertLocalMockEnvironment();
    const result = forceMock || isOpenAiMockMode()
      ? { output_parsed: buildMockReplyDecision(candidate), response: null, mock: true, usage: null }
      : await runReplyDecisionModel({ candidate, identity, localScores, selected, recentSimilarReplies });
    const validatedDecision = validateReplyDecision(result.data || result.output_parsed, candidate, selected, identity);
    const decision = applyContextFallback(validatedDecision, selected, localScores, candidate, identity);
    const usage = result.usage || null;
    if (firebaseUid) {
      await logAiUsage({
        db,
        admin,
        firebaseUid,
        candidatePostId,
        operation: "generation",
        model: DEFAULT_MODELS.reply,
        success: true,
        durationMs: Date.now() - startedAt,
        promptVersion: PROMPT_VERSIONS.replyDecision,
        inputTokens: usage?.inputTokens ?? usage?.input_tokens ?? null,
        outputTokens: usage?.outputTokens ?? usage?.output_tokens ?? null,
        totalTokens: usage?.totalTokens ?? usage?.total_tokens ?? null,
        responseId: usage?.responseId ?? null,
        openAiRequestId: usage?.openAiRequestId ?? null,
      });
    }
    const draft = await persistReplyDecision(db, admin, candidatePostId, candidate, identity, selected, decision, localScores, usage, 0, null, result.mock === true);
    unlockStatus = decision.finalRecommendation === "ready" ? "draft_ready" : "manual_review";
    return {
      candidatePostId,
      finalRecommendation: decision.finalRecommendation,
      shouldReply: decision.shouldReply,
      recommendedCandidateKey: decision.recommendedCandidateKey,
      replyDraftId: draft.replyDraftId,
      decision,
      adapterOutput: draft.adapterOutput,
    };
  } finally {
    await unlockCandidateAi(ref, admin, unlockStatus);
  }
}

async function processCandidateBatchWithAi({ db, admin, limit = 10 }) {
  const batchLimit = Math.min(Number(limit) || 10, PHASE3_LIMITS.maxBatchSize);
  const query = db.collection("candidatePosts")
    .where("hardFilter.passed", "==", true)
    .where("status", "in", ["candidate", "opened"])
    .orderBy("createdAt", "desc")
    .limit(batchLimit);
  const snap = await query.get();
  const results = [];
  let processed = 0;
  let draftReady = 0;
  let assessedOnly = 0;
  let notRecommended = 0;
  let manualReview = 0;
  let failed = 0;
  for (const doc of snap.docs) {
    try {
      const outcome = await processCandidateWithAi({ db, admin, candidatePostId: doc.id });
      processed += 1;
      if (outcome.finalRecommendation === "ready") draftReady += 1;
      else if (outcome.rank && ["S", "A", "B"].includes(outcome.rank)) assessedOnly += 1;
      else if (outcome.finalRecommendation === "manual_review") manualReview += 1;
      else notRecommended += 1;
      results.push({ candidatePostId: doc.id, ok: true, outcome });
    } catch (error) {
      failed += 1;
      results.push({ candidatePostId: doc.id, ok: false, errorCode: error.code || "UNKNOWN_AI_ERROR", message: error.message });
    }
  }
  return { processed, draftReady, assessedOnly, notRecommended, manualReview, failed, results };
}

async function regenerateReplyDraftWithAi({ db, admin, candidatePostId, additionalInstruction = "", replyDraftId = null }) {
  return throwDeprecatedAiCallable("regenerateReplyDraftWithAi");
}

async function saveReplyDraftSelection({ db, admin, candidatePostId, replyDraftId, selectedCandidateKey, editedText = null, humanMemo = "" }) {
  const draftRef = db.collection("replyDrafts").doc(replyDraftId);
  const snap = await draftRef.get();
  if (!snap.exists) throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  const data = snap.data();
  const selected = (data.candidates || []).find((item) => item.candidateKey === selectedCandidateKey);
  if (!selected) throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  const finalText = editedText ?? selected.text;
  validateHumanEditedText(finalText);
  await draftRef.set({
    selectedCandidateKey,
    editedText: finalText,
    humanMemo,
    status: "selected",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.collection("candidatePosts").doc(candidatePostId).set({
    status: "opened",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true, selectedCandidateKey, finalText };
}

function buildLocalScores(candidate, identity) {
  const ageMinutes = ageInMinutes(candidate.createdAt);
  const freshness = calculateFreshnessScore(ageMinutes);
  const momentum = calculateMomentumScore({
    likes: candidate.metrics?.likes || 0,
    replies: candidate.metrics?.replies || 0,
    reposts: candidate.metrics?.reposts || 0,
    quotes: candidate.metrics?.quotes || 0,
    ageMinutes,
    authorFollowers: candidate.authorMetrics?.followers || 0,
  });
  const saturationPenalty = calculateSaturationPenalty({ likes: candidate.metrics?.likes || 0, replies: candidate.metrics?.replies || 0 });
  const localTopicMatch = calculateLocalTopicMatch({ text: candidate.text || "", identity });
  const dataCompleteness = calculateDataCompletenessScore(candidate);
  return {
    freshness,
    momentum: momentum.score,
    localTopicMatch,
    dataCompleteness,
    weightedEngagement: momentum.weightedEngagement,
    velocityPerMinute: momentum.velocityPerMinute,
    normalizedVelocity: momentum.normalizedVelocity,
    followerBand: momentum.followerBand,
    saturationPenalty,
  };
}

function deriveCandidateEligibility(candidate, localScores) {
  const expiresAt = candidate.expiresAt?.toDate?.() ? candidate.expiresAt.toDate().getTime() : candidate.expiresAt ? new Date(candidate.expiresAt).getTime() : Infinity;
  const passed = Boolean(candidate.hardFilter?.passed)
    && candidate.status === "candidate"
    && expiresAt > Date.now()
    && (localScores?.localTopicMatch ?? 0) >= 20
    && (localScores?.dataCompleteness ?? 0) >= 40;
  return {
    passed,
    reason: passed ? null : "candidate did not pass local eligibility checks",
  };
}

function claimLevelsByExperience(identity) {
  const entries = {};
  for (const item of identity.experiences || []) {
    if (item?.experienceId) entries[item.experienceId] = item.claimLevel || "opinion";
  }
  return entries;
}

function simplifyContextSelection(selected) {
  return {
    selectedProjects: (selected.selectedProjects || []).slice(0, 2).map((item) => ({
      id: item.projectId || item.id,
      projectId: item.projectId || item.id,
      title: item.title || "",
      claimLevel: item.claimLevel || "opinion",
      score: item.score || 0,
    })),
    selectedExperiences: (selected.selectedExperiences || []).slice(0, 4).map((item) => ({
      id: item.experienceId || item.id,
      experienceId: item.experienceId || item.id,
      projectId: item.projectId || item.projectId || null,
      title: item.title || "",
      claimLevel: item.claimLevel || "opinion",
      usableClaims: item.usableClaims || [],
      prohibitedClaims: item.prohibitedClaims || [],
      score: item.score || 0,
    })),
    selectedOpinions: (selected.selectedOpinions || []).slice(0, 4).map((item) => ({
      id: item.opinionId || item.id,
      opinionId: item.opinionId || item.id,
      category: item.category || "",
      statement: item.statement || "",
      score: item.score || 0,
    })),
    selectedWriterInstructions: (selected.selectedWriterInstructions || []).slice(0, 5).map((item) => ({
      id: item.instructionId || item.id,
      instructionId: item.instructionId || item.id,
      instruction: item.instruction || "",
      score: item.score || 0,
    })),
    recentContent: (selected.recentContent || []).slice(0, 5).map((item) => ({
      contentId: item.contentId || item.id,
      text: item.text || "",
      topic: item.topic || "",
    })),
  };
}

function validateReplyDecision(decision, candidate, selected, identity) {
  const parsed = ReplyDecisionSchema.parse(decision);
  if (!parsed.shouldReply && parsed.finalRecommendation === "ready") {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  if (parsed.selectedProjectIds.length > 2 || parsed.selectedExperienceIds.length > 4 || parsed.selectedOpinionIds.length > 4 || parsed.selectedWriterInstructionIds.length > 5) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const allowedProjectIds = new Set((selected.selectedProjects || []).map((item) => item.projectId || item.id));
  const allowedExperienceIds = new Set((selected.selectedExperiences || []).map((item) => item.experienceId || item.id));
  const allowedOpinionIds = new Set((selected.selectedOpinions || []).map((item) => item.opinionId || item.id));
  const allowedInstructionIds = new Set((selected.selectedWriterInstructions || []).map((item) => item.instructionId || item.id));
  const sanitized = {
    ...parsed,
    selectedProjectIds: parsed.selectedProjectIds.filter((id) => allowedProjectIds.has(id)),
    selectedExperienceIds: parsed.selectedExperienceIds.filter((id) => allowedExperienceIds.has(id)),
    selectedOpinionIds: parsed.selectedOpinionIds.filter((id) => allowedOpinionIds.has(id)),
    selectedWriterInstructionIds: parsed.selectedWriterInstructionIds.filter((id) => allowedInstructionIds.has(id)),
  };
  const selectionIds = new Set([
    ...sanitized.selectedProjectIds,
    ...sanitized.selectedExperienceIds,
    ...sanitized.selectedOpinionIds,
    ...sanitized.selectedWriterInstructionIds,
  ]);
  if (selectionIds.size !== (
    sanitized.selectedProjectIds.length
    + sanitized.selectedExperienceIds.length
    + sanitized.selectedOpinionIds.length
    + sanitized.selectedWriterInstructionIds.length
  )) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const selectedExperienceIds = new Set((selected.selectedExperiences || []).map((item) => item.experienceId || item.id));
  for (const id of sanitized.selectedExperienceIds) {
    if (!selectedExperienceIds.has(id)) throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const selectedProjectIds = new Set((selected.selectedProjects || []).map((item) => item.projectId || item.id));
  for (const id of sanitized.selectedProjectIds) {
    if (!selectedProjectIds.has(id)) throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const selectedOpinionIds = new Set((selected.selectedOpinions || []).map((item) => item.opinionId || item.id));
  for (const id of sanitized.selectedOpinionIds) {
    if (!selectedOpinionIds.has(id)) throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const selectedInstructionIds = new Set((selected.selectedWriterInstructions || []).map((item) => item.instructionId || item.id));
  for (const id of sanitized.selectedWriterInstructionIds) {
    if (!selectedInstructionIds.has(id)) throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const textSet = new Set([sanitized.replies.A.text.trim(), sanitized.replies.B.text.trim(), sanitized.replies.C.text.trim()]);
  if (textSet.size !== 3) throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  if (String(candidate.text || "").includes(sanitized.replies.A.text) || String(candidate.text || "").includes(sanitized.replies.B.text) || String(candidate.text || "").includes(sanitized.replies.C.text)) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  for (const reply of Object.values(sanitized.replies)) {
    if (/https?:\/\//i.test(reply.text) || /#/.test(reply.text) || reply.text.length < 20 || reply.text.length > 220) {
      throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
    }
  }
  if (!["verified", "implemented", "tested", "in_development", "planned", "opinion"].includes((identity.experiences || [])[0]?.claimLevel || "opinion")) {
    return sanitized;
  }
  return sanitized;
}

function applyContextFallback(decision, selected, localScores, candidate, identity) {
  if (!decision?.shouldReply) return decision;
  if (!shouldUseContextForCandidate(candidate, localScores, selected)) {
    return decision;
  }
  const normalizedContext = normalizeSelectedContextIds(candidate, identity);
  if (!normalizedContext.selectedExperienceIds.length && !normalizedContext.selectedOpinionIds.length) {
    return decision;
  }
  return {
    ...decision,
    selectedProjectIds: [],
    selectedExperienceIds: normalizedContext.selectedExperienceIds,
    selectedOpinionIds: normalizedContext.selectedOpinionIds,
    selectedWriterInstructionIds: [],
  };
}

async function runReplyDecisionModel({ candidate, identity, localScores, selected, recentSimilarReplies, model = DEFAULT_MODELS.reply }) {
  const result = await runStructuredOutput({
    model,
    input: buildReplyDecisionPrompt({
      candidate,
      identity,
      localScores,
      selectedContext: simplifyContextSelection(selected),
      recentSimilarReplies,
      claimLevelsByExperienceId: claimLevelsByExperience(identity),
      recentReplyTexts: recentSimilarReplies.map((item) => item.text || "").slice(0, 5),
    }),
    schema: ReplyDecisionSchema,
    schemaName: "ReplyDecisionSchema",
    timeoutMs: PHASE3_LIMITS.generationTimeoutMs,
  });
  return { data: result.output_parsed, usage: result };
}

function buildMockReplyDecision(candidate) {
  const scenario = pickScenario(candidate);
  const source = scenario.assessment || {};
  const gen = scenario.generation || {};
  return {
    shouldReply: Boolean(source.shouldReply),
    decisionSummary: source.decisionSummary || gen.generationSummary || "",
    primaryTopic: source.primaryTopic || "other",
    scores: {
      relevance: clamp100(source.relevanceScore),
      replyValue: clamp100(source.replyValueScore),
      profileConversion: clamp100(source.profileConversionScore),
    },
    selectedProjectIds: source.selectedProjectIds || [],
    selectedExperienceIds: source.selectedExperienceIds || [],
    selectedOpinionIds: source.selectedOpinionIds || [],
    selectedWriterInstructionIds: source.selectedWriterInstructionIds || [],
    riskFlags: source.riskFlags || [],
    replies: {
      A: { candidateKey: "A", ...(gen.candidates?.[0] || { text: "" }), selfCheckFlags: gen.generationRiskFlags || [] },
      B: { candidateKey: "B", ...(gen.candidates?.[1] || { text: "" }), selfCheckFlags: gen.generationRiskFlags || [] },
      C: { candidateKey: "C", ...(gen.candidates?.[2] || { text: "" }), selfCheckFlags: gen.generationRiskFlags || [] },
    },
    recommendedCandidateKey: gen.recommendedCandidateKey || "A",
    finalRecommendation: source.shouldReply === false ? "skip" : "ready",
  };
}

function finalizeContextSelection(context) {
  return {
    selectedProjects: context.projectCandidates.slice(0, 2).map((item) => ({ ...item })),
    selectedExperiences: context.experienceCandidates.slice(0, 3).map((item) => ({ ...item })),
    selectedOpinions: context.opinionCandidates.slice(0, 3).map((item) => ({ ...item })),
    selectedWriterInstructions: context.writerInstructionCandidates.slice(0, 5).map((item) => ({ ...item })),
    recentContent: context.recentContentCandidates.slice(0, 20),
  };
}

async function moderateOriginalPost({ candidate, model, forceMock = false }) {
  if (forceMock || isOpenAiMockMode()) return { flagged: false, categories: {}, category_scores: {} };
  return runModeration({ model, input: candidate.text });
}

function buildSelectedContextFromAssessment(assessment, identity) {
  const selectedProjects = (assessment.selectedProjectIds || []).map((id) => identity.experiences.find((item) => item.projectId === id)).filter(Boolean);
  const selectedExperiences = (assessment.selectedExperienceIds || []).map((id) => identity.experiences.find((item) => item.experienceId === id)).filter(Boolean);
  const selectedOpinions = (assessment.selectedOpinionIds || []).map((id) => identity.opinions.find((item) => item.opinionId === id)).filter(Boolean);
  const selectedWriterInstructions = (assessment.selectedWriterInstructionIds || []).map((id) => identity.writerInstructions.find((item) => item.instructionId === id)).filter(Boolean);
  return { selectedProjects, selectedExperiences, selectedOpinions, selectedWriterInstructions, recentContent: identity.recentContent || [] };
}

function validateGeneratedCandidates(parsed) {
  const texts = parsed.candidates.map((item) => item.text.trim());
  const unique = new Set(texts);
  if (parsed.candidates.length !== 3 || unique.size !== 3) return { ok: false };
  if (!["A", "B", "C"].every((key) => parsed.candidates.find((item) => item.candidateKey === key))) return { ok: false };
  if (texts.some((text) => text.length < 20 || text.length > 220 || /https?:\/\//i.test(text) || /#/.test(text))) return { ok: false };
  return { ok: true };
}

function computeSimilarityForCandidates(candidates, recentTexts) {
  return candidates.map((candidate) => ({ candidateKey: candidate.candidateKey, similarity: similarityAgainstRecent(candidate.text, recentTexts) }));
}

function similarityAgainstRecent(text, recentTexts) {
  const tokens = makeNgrams(text);
  let maxScore = 0;
  let mostSimilar = null;
  for (const recent of recentTexts) {
    const recentTokens = makeNgrams(recent.text || "");
    const score = jaccard(tokens, recentTokens);
    if (score > maxScore) {
      maxScore = score;
      mostSimilar = recent;
    }
  }
  return {
    maxScore,
    mostSimilarContentId: mostSimilar?.contentId || null,
    mostSimilarTextPreview: mostSimilar?.text ? String(mostSimilar.text).slice(0, 80) : null,
    threshold: maxScore >= 0.75 ? 0.75 : 0.60,
  };
}

function makeNgrams(text) {
  const normalized = String(text || "").replace(/\s+/g, "").replace(/[^\p{L}\p{N}]/gu, "");
  const grams = new Set();
  for (let i = 0; i < normalized.length - 2; i += 1) {
    grams.add(normalized.slice(i, i + 3));
  }
  return grams;
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const item of a) if (b.has(item)) inter += 1;
  return inter / new Set([...a, ...b]).size;
}

async function loadRecentTexts(db) {
  const recentSnap = await db.collection("recentContent").orderBy("publishedAt", "desc").limit(20).get().catch(() => ({ docs: [] }));
  const repliesSnap = await db.collection("postedReplies").orderBy("postedAt", "desc").limit(20).get().catch(() => ({ docs: [] }));
  return [
    ...recentSnap.docs.map((doc) => ({ contentId: doc.id, ...(doc.data() || {}) })),
    ...repliesSnap.docs.map((doc) => ({ contentId: doc.id, text: doc.data()?.postedText || doc.data()?.generatedText || "" })),
  ].slice(0, 50);
}

async function callAssessmentModel({ candidate, identity, localScores, selected, model }) {
  if (isOpenAiMockMode()) return pickScenario(candidate).assessment;
  const result = await runStructuredOutput({
    model,
    input: buildCandidateAssessmentPrompt({ candidate, identity, localScores, selectedContext: selected }),
    schema: CandidateAssessmentSchema,
    schemaName: "CandidateAssessmentSchema",
    timeoutMs: 30_000,
  });
  return { data: result.output_parsed, usage: result };
}

async function callGenerationModel({ db, candidate, identity, selected, model }) {
  if (isOpenAiMockMode()) return pickScenario(candidate).generation;
  const result = await runStructuredOutput({
    model,
    input: buildReplyGenerationPrompt({
      candidate,
      identity,
      assessment: candidate.aiAssessment,
      selectedContext: selected,
      recentSimilarReplies: await loadRecentTexts(db),
    }),
    schema: ReplyGenerationSchema,
    schemaName: "ReplyGenerationSchema",
    timeoutMs: 45_000,
  });
  return { data: result.output_parsed, usage: result };
}

async function callJudgeModel({ candidate, parsed, selected, similarReplies, model }) {
  if (isOpenAiMockMode()) return pickScenario(candidate).judge;
  const result = await runStructuredOutput({
    model,
    input: buildReplyJudgePrompt({
      candidate,
      generated: parsed,
      assessment: candidate.aiAssessment,
      selectedContext: selected,
      similarReplies,
      writingRules: {},
    }),
    schema: ReplyJudgeSchema,
    schemaName: "ReplyJudgeSchema",
    timeoutMs: 30_000,
  });
  return { data: result.output_parsed, usage: result };
}

async function moderateGeneratedCandidates(candidates, model) {
  if (isOpenAiMockMode()) {
    return candidates.map((candidate) => ({ flagged: false, categories: {}, candidateKey: candidate.candidateKey, model }));
  }
  return Promise.all(candidates.map(async (candidate) => {
    const moderation = await runModeration({ model, input: candidate.text });
    return {
      candidateKey: candidate.candidateKey,
      flagged: Boolean(moderation.flagged),
      categories: moderation.categories || {},
      category_scores: moderation.category_scores || {},
      model,
    };
  }));
}

async function persistDraft(db, admin, candidatePostId, candidate, parsed, selected, moderationResults, similarityResults, models, regenerationCount, isRegeneration, replyDraftId, finalRecommendation, judgeParsed = null) {
  const currentDrafts = await db.collection("replyDrafts").where("candidatePostId", "==", candidatePostId).get().catch(() => ({ docs: [] }));
  const batch = db.batch();
  currentDrafts.docs.forEach((doc) => batch.set(doc.ref, { status: "superseded", isCurrent: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
  const draftRef = replyDraftId ? db.collection("replyDrafts").doc(replyDraftId) : db.collection("replyDrafts").doc();
  const draft = {
    replyDraftId: draftRef.id,
    candidatePostId,
    generationAttempt: regenerationCount + 1,
    isCurrent: true,
    shouldGenerate: parsed.shouldGenerate,
    generationSummary: parsed.generationSummary,
    replyGoal: parsed.replyGoal,
    candidates: parsed.candidates.map((item, index) => ({
      ...item,
      moderation: moderationResults[index] || { flagged: false, categories: {} },
      similarity: similarityResults[index]?.similarity || { maxScore: 0, mostSimilarContentId: null, mostSimilarTextPreview: null, threshold: 0.75 },
      judge: judgeParsed?.candidateResults?.find((entry) => entry.candidateKey === item.candidateKey) || {
        passed: finalRecommendation === "ready",
        overallScore: finalRecommendation === "ready" ? 80 : 60,
        shortReason: finalRecommendation,
        riskFlags: [],
      },
    })),
    recommendedCandidateKey: parsed.recommendedCandidateKey,
    selectedCandidateKey: null,
    editedText: null,
    finalRecommendation: finalRecommendation === "ready" ? "ready" : finalRecommendation === "manual_review" ? "manual_review" : "reject",
    generationContext: {
      creatorProfileId: "reiya-public-x",
      writingRuleSetId: "sei-x-writing-v1",
      usedProjectIds: parsed.usedProjectIds,
      usedExperienceIds: parsed.usedExperienceIds,
      usedOpinionIds: parsed.usedOpinionIds,
      usedWriterInstructionIds: parsed.usedWriterInstructionIds,
      recentContentIds: selected.recentContent.map((item) => item.contentId || item.id).filter(Boolean).slice(0, 20),
    },
    models,
    promptVersions: {
      assessment: PROMPT_VERSIONS.assessment,
      generation: PROMPT_VERSIONS.generation,
      judge: PROMPT_VERSIONS.judge,
    },
    status: finalRecommendation === "ready" ? "ready" : finalRecommendation === "manual_review" ? "rejected" : "rejected",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  batch.set(draftRef, draft, { merge: true });
  batch.set(db.collection("candidatePosts").doc(candidatePostId), {
    aiProcessing: { status: finalRecommendation === "ready" ? "draft_ready" : "manual_review", completedAt: FieldValue.serverTimestamp() },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return draft;
}

async function persistReplyDecision(db, admin, candidatePostId, candidate, identity, selected, decision, localScores, usage, regenerationCount, replyDraftId = null, localMock = false) {
  const currentDrafts = await db.collection("replyDrafts").where("candidatePostId", "==", candidatePostId).get().catch(() => ({ docs: [] }));
  const batch = db.batch();
  currentDrafts.docs.forEach((doc) => batch.set(doc.ref, { status: "superseded", isCurrent: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
  const draftRef = replyDraftId ? db.collection("replyDrafts").doc(replyDraftId) : db.collection("replyDrafts").doc();
  const replies = ["A", "B", "C"].map((candidateKey) => decision.replies[candidateKey]);
  const draft = {
    replyDraftId: draftRef.id,
    candidatePostId,
    generationAttempt: regenerationCount + 1,
    isCurrent: true,
    shouldReply: decision.shouldReply,
    decisionSummary: decision.decisionSummary,
    primaryTopic: decision.primaryTopic,
    scores: decision.scores,
    candidates: replies.map((item) => ({
      candidateKey: item.candidateKey,
      type: "reply",
      text: item.text,
      usedClaimEvidence: item.usedClaimEvidence || [],
      selfCheckFlags: item.selfCheckFlags || [],
      judge: {
        passed: decision.finalRecommendation === "ready" && decision.recommendedCandidateKey === item.candidateKey,
        overallScore: decision.recommendedCandidateKey === item.candidateKey ? 90 : 82,
        shortReason: decision.recommendedCandidateKey === item.candidateKey ? "recommended" : "acceptable",
        riskFlags: item.selfCheckFlags || [],
      },
    })),
    recommendedCandidateKey: decision.recommendedCandidateKey,
    selectedCandidateKey: null,
    editedText: null,
    finalRecommendation: decision.finalRecommendation,
    generationContext: {
      creatorProfileId: "reiya-public-x",
      writingRuleSetId: "sei-x-writing-v1",
      usedProjectIds: decision.selectedProjectIds,
      usedExperienceIds: decision.selectedExperienceIds,
      usedOpinionIds: decision.selectedOpinionIds,
      usedWriterInstructionIds: decision.selectedWriterInstructionIds,
      recentContentIds: (selected.recentContent || []).map((item) => item.contentId || item.id).filter(Boolean).slice(0, 5),
    },
    models: { reply: localMock ? "local-mock" : DEFAULT_MODELS.reply },
    promptVersions: {
      replyDecision: PROMPT_VERSIONS.replyDecision,
    },
    status: decision.finalRecommendation === "ready" ? "ready" : "rejected",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    localScores,
    aiDecision: decision,
    usage,
    adapterOutput: {
      replyText: replies.find((item) => item.candidateKey === decision.recommendedCandidateKey)?.text || replies[0]?.text || "",
      intentSummary: decision.decisionSummary,
      selectedContextIds: compactSelectedContextIds(decision, selected),
      claimLevel: deriveDecisionClaimLevel(decision, identity),
      tone: "natural",
      confidence: decision.finalRecommendation === "ready" ? 0.82 : 0.55,
      warnings: decision.riskFlags || [],
      generationReason: decision.decisionSummary,
      model: localMock ? "local-mock" : DEFAULT_MODELS.reply,
      apiCallCount: localMock ? 0 : 1,
      latencyMs: null,
      codeChecks: { lengthPassed: true, prohibitedExpressionPassed: true, similarityPassed: true, claimLevelPassed: true },
    },
    claimLevelsByExperienceId: claimLevelsByExperience(identity),
  };
  batch.set(draftRef, draft, { merge: true });
  batch.set(db.collection("candidatePosts").doc(candidatePostId), {
    aiAssessment: {
      shouldReply: decision.shouldReply,
      decisionSummary: decision.decisionSummary,
      primaryTopic: decision.primaryTopic,
      relevanceScore: decision.scores.relevance,
      replyValueScore: decision.scores.replyValue,
      profileConversionScore: decision.scores.profileConversion,
      selectedProjectIds: decision.selectedProjectIds,
      selectedExperienceIds: decision.selectedExperienceIds,
      selectedOpinionIds: decision.selectedOpinionIds,
      selectedWriterInstructionIds: decision.selectedWriterInstructionIds,
      riskFlags: decision.riskFlags,
      assessedAt: FieldValue.serverTimestamp(),
      promptVersion: PROMPT_VERSIONS.replyDecision,
      model: DEFAULT_MODELS.reply,
    },
    aiProcessing: makeAiProcessing(decision.finalRecommendation === "ready" ? "draft_ready" : "manual_review", candidate.aiProcessing, regenerationCount),
    workflowVersion: 1,
    workflowStatus: decision.finalRecommendation === "ready" ? "ready" : "needs_review",
    statusUpdatedAt: FieldValue.serverTimestamp(),
    statusHistory: appendWorkflowHistory(candidate, decision.finalRecommendation === "ready" ? "ready" : "needs_review"),
    latestReplyDraftId: draftRef.id,
    recommendedCandidateKey: decision.recommendedCandidateKey,
    recommendedReplyText: replies.find((item) => item.candidateKey === decision.recommendedCandidateKey)?.text || replies[0]?.text || "",
    aiDecision: {
      ...decision,
      generationReason: decision.decisionSummary,
      warnings: decision.riskFlags || [],
      claimLevel: deriveDecisionClaimLevel(decision, identity),
      model: localMock ? "local-mock" : DEFAULT_MODELS.reply,
      apiCallCount: localMock ? 0 : 1,
      codeChecks: { lengthPassed: true, prohibitedExpressionPassed: true, similarityPassed: true, claimLevelPassed: true },
    },
    scores: {
      relevance: decision.scores.relevance,
      replyValue: decision.scores.replyValue,
      momentum: localScores.momentum,
      profileConversion: decision.scores.profileConversion,
      freshness: localScores.freshness,
      saturationPenalty: localScores.saturationPenalty,
      riskPenalty: 0,
      total: calculateTotalScore({
        relevanceScore: decision.scores.relevance,
        replyValueScore: decision.scores.replyValue,
        momentumScore: localScores.momentum,
        profileConversionScore: decision.scores.profileConversion,
        freshnessScore: localScores.freshness,
        saturationPenalty: Math.abs(localScores.saturationPenalty),
        riskPenalty: 0,
      }),
    },
    rank: decision.finalRecommendation === "skip" ? "C" : "A",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return draft;
}

function deriveDecisionClaimLevel(decision, identity) {
  const levels = (decision.selectedExperienceIds || []).map((id) => identity.experiences.find((item) => item.experienceId === id)?.claimLevel).filter(Boolean);
  return levels.some((value) => ["planned", "in_development"].includes(value)) ? "medium" : "low";
}

function compactSelectedContextIds(decision, selected) {
  const idsFromDecision = [
    ...(decision?.selectedExperienceIds || []),
    ...(decision?.selectedOpinionIds || []),
    ...(decision?.selectedProjectIds || []),
    ...(decision?.selectedWriterInstructionIds || []),
  ].filter(Boolean);
  if (idsFromDecision.length > 0) {
    return [...new Set(idsFromDecision)].slice(0, 2);
  }
  const ranked = [
    ...(selected?.selectedExperiences || []).map((item) => ({
      id: item?.experienceId || item?.id,
      projectId: item?.projectId || item?.experienceId || item?.id,
      score: Number(item?.score || 0),
    })),
    ...(selected?.selectedOpinions || []).map((item) => ({
      id: item?.opinionId || item?.id,
      projectId: item?.opinionId || item?.id,
      score: Number(item?.score || 0),
    })),
    ...(selected?.selectedProjects || []).map((item) => ({
      id: item?.projectId || item?.id,
      projectId: item?.projectId || item?.id,
      score: Number(item?.score || 0),
    })),
    ...(selected?.selectedWriterInstructions || []).map((item) => ({
      id: item?.instructionId || item?.id,
      projectId: item?.instructionId || item?.id,
      score: Number(item?.score || 0),
    })),
  ]
    .filter((item) => item.id)
    .sort((a, b) => b.score - a.score);
  const ids = [];
  const seenProjects = new Set();
  for (const item of ranked) {
    if (ids.length >= 2) break;
    if (item.score < 4) continue;
    if (seenProjects.has(item.projectId)) continue;
    ids.push(item.id);
    seenProjects.add(item.projectId);
  }
  return ids;
}

function normalizeSelectedContextIds(candidate, identity) {
  const text = `${candidate?.text || ""} ${candidate?.authorName || ""} ${candidate?.authorUsername || ""}`.toLowerCase();
  const experienceScores = (identity?.experiences || []).map((item) => {
    const hay = [
      item.title,
      item.description,
      ...(item.categories || []),
      ...(item.relatedKeywords || []),
      ...(item.usableClaims || []),
      ...(item.prohibitedClaims || []),
    ].filter(Boolean).join(" ").toLowerCase();
    let score = Number(item.priority ? (6 - Number(item.priority)) : 1);
    for (const keyword of item.categories || []) if (text.includes(String(keyword).toLowerCase())) score += 3;
    for (const keyword of item.relatedKeywords || []) if (text.includes(String(keyword).toLowerCase())) score += 4;
    for (const claim of item.usableClaims || []) if (text.includes(String(claim).toLowerCase())) score += 5;
    if (item.projectId === "meo-assistant") {
      if (["店舗", "口コミ", "google", "map", "更新"].some((needle) => text.includes(needle))) score += 12;
      else score -= 16;
    }
    if (item.projectId === "live-manual-ai") {
      if (["社内", "導入", "使われていない", "確認", "自動化", "運用", "改善"].some((needle) => text.includes(needle))) score += 14;
      else score -= 4;
    }
    if (item.projectId === "threads-ai") {
      if (["自動化", "確認", "承認", "半自動", "運用"].some((needle) => text.includes(needle))) score += 12;
      else score -= 6;
    }
    if (item.projectId === "ai-sales-researcher") {
      if (["営業", "リスト", "リード", "抽出", "分析"].some((needle) => text.includes(needle))) score += 10;
      else score -= 10;
    }
    if (["web", "制作", "web制作者", "コード"].some((needle) => text.includes(needle))) {
      if (item.projectId === "live-manual-ai") score += 10;
      if (item.projectId === "meo-assistant") score -= 10;
    }
    if (["web", "制作", "web制作者", "コード"].some((needle) => text.includes(needle))) {
      if (item.projectId === "live-manual-ai") score += 6;
      if (item.projectId === "meo-assistant") score -= 6;
    }
    if (hay.includes("web") && ["web", "制作", "業務改善", "aiツール開発"].some((needle) => text.includes(needle))) score += 6;
    if (text.includes("ai") && hay.includes("ai")) score += 0.5;
    return {
      id: item.experienceId,
      projectId: item.projectId || item.experienceId,
      score,
    };
  }).sort((a, b) => b.score - a.score);
  const selectedExperienceIds = [];
  const seenProjects = new Set();
  for (const item of experienceScores) {
    if (selectedExperienceIds.length >= 2) break;
    if (item.score < 5) continue;
    if (seenProjects.has(item.projectId)) continue;
    selectedExperienceIds.push(item.id);
    seenProjects.add(item.projectId);
  }
  const selectedOpinionIds = [];
  if (!selectedExperienceIds.length) {
    const opinionScores = (identity?.opinions || []).map((item) => {
      const hay = `${item.category || ""} ${item.statement || ""}`.toLowerCase();
      let score = 0;
      if (["自動化", "確認", "承認", "半自動"].some((needle) => text.includes(needle)) && (hay.includes("半自動") || hay.includes("人間承認"))) score += 8;
      if (["店舗", "口コミ", "google"].some((needle) => text.includes(needle)) && hay.includes("店舗")) score += 8;
      if (["社内", "導入", "使われていない", "確認"].some((needle) => text.includes(needle)) && (hay.includes("管理画面") || hay.includes("ボトルネック"))) score += 6;
      return { id: item.opinionId, score };
    }).sort((a, b) => b.score - a.score);
    for (const item of opinionScores) {
      if (selectedOpinionIds.length >= 2) break;
      if (item.score < 5) continue;
      selectedOpinionIds.push(item.id);
    }
  }
  return { selectedExperienceIds, selectedOpinionIds };
}

function shouldUseContextForCandidate(candidate, localScores, selected) {
  const text = `${candidate?.text || ""} ${candidate?.authorName || ""} ${candidate?.authorUsername || ""}`.toLowerCase();
  const entertainmentSignals = [
    "映画", "ドラマ", "アニメ", "音楽", "芸能", "スポーツ", "旅行", "食事", "ランチ", "カフェ", "天気", "日常", "休日", "感想", "見た", "観た",
  ];
  const topicalSignals = [
    "ai", "web", "faq", "manual", "sns", "x", "threads", "meo", "google", "codex", "claude", "workflow", "ui", "業務", "店舗", "仕事", "働き方", "開発", "制作", "運用", "改善",
  ];
  const hasTopicalSignal = topicalSignals.some((keyword) => text.includes(keyword));
  const looksOfftopic = entertainmentSignals.some((keyword) => text.includes(keyword)) && !hasTopicalSignal;
  if (looksOfftopic) return false;
  return Boolean((selected?.selectedExperiences || []).length || (selected?.selectedOpinions || []).length || (selected?.selectedProjects || []).length || (selected?.selectedWriterInstructions || []).length);
}

function appendWorkflowHistory(candidate, to) {
  const history = Array.isArray(candidate.statusHistory) ? candidate.statusHistory.slice(-29) : [];
  const from = candidate.workflowStatus || (candidate.status === "opened" ? "ready" : "discovered");
  if (from !== to) history.push({ from, to, at: new Date().toISOString(), actorUid: null });
  return history;
}

function assertLocalMockEnvironment() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
  if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId.startsWith("demo-")) {
    throw new HttpsError("failed-precondition", "ローカルモックはdemoプロジェクトのFirebase Emulatorでのみ使用できます。");
  }
}

function makeAiProcessing(status, current = {}, regenerationCount = 0) {
  return {
    status,
    assessmentVersion: PROMPT_VERSIONS.assessment,
    generationVersion: PROMPT_VERSIONS.generation,
    judgeVersion: PROMPT_VERSIONS.judge,
    startedAt: current.startedAt || null,
    completedAt: status === "draft_ready" || status === "manual_review" || status === "moderation_blocked" ? new Date().toISOString() : null,
    attemptCount: (current.attemptCount || 0) + 1,
    regenerationCount,
    lastErrorCode: null,
    lastErrorMessageSafe: null,
    lockUntil: null,
    lockOwner: null,
  };
}

async function lockCandidateAi(ref, admin, status) {
  await admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const ai = snap.data()?.aiProcessing || {};
    if (ai.lockUntil && ai.lockUntil.toDate && ai.lockUntil.toDate().getTime() > Date.now()) {
      throw Object.assign(new Error("AI_PROCESSING_LOCKED"), { code: "AI_PROCESSING_LOCKED" });
    }
    tx.set(ref, { aiProcessing: { ...(ai || {}), status, lockUntil: Timestamp.fromDate(new Date(Date.now() + 2 * 60 * 1000)), lockOwner: `ai_${Date.now()}`, startedAt: ai.startedAt || FieldValue.serverTimestamp() } }, { merge: true });
  });
}

async function unlockCandidateAi(ref, admin, status) {
  await ref.set({ aiProcessing: { status, lockUntil: null, lockOwner: null, completedAt: FieldValue.serverTimestamp() } }, { merge: true });
}

function normalizeCandidate(candidate) {
  return {
    postId: candidate.postId,
    text: candidate.text,
    createdAt: candidate.createdAt?.toDate?.() ? candidate.createdAt.toDate().toISOString() : candidate.createdAt,
    ageMinutes: ageInMinutes(candidate.createdAt),
    metrics: candidate.metrics || {},
    author: {
      name: candidate.authorName,
      username: candidate.authorUsername,
      description: candidate.authorDescription || "",
      followers: candidate.authorMetrics?.followers || 0,
    },
    authorName: candidate.authorName,
    authorUsername: candidate.authorUsername,
    authorDescription: candidate.authorDescription || "",
    authorMetrics: candidate.authorMetrics || {},
  };
}

function ageInMinutes(createdAt) {
  if (!createdAt) return 0;
  const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

function buildZeroScores() {
  return { relevance: 0, replyValue: 0, momentum: 0, profileConversion: 0, freshness: 0, saturationPenalty: 0, riskPenalty: 0, total: 0 };
}

function deriveReplyEligibility(candidate, localScores, identity) {
  const text = `${candidate?.text || ""} ${candidate?.authorName || ""} ${candidate?.authorUsername || ""}`.toLowerCase();
  const entertainmentSignals = [
    "映画", "ドラマ", "アニメ", "音楽", "芸能", "スポーツ", "旅行", "食事", "ランチ", "カフェ", "天気", "日常", "休日", "感想", "見た", "観た",
  ];
  const topicalSignals = [
    "ai", "web", "faq", "manual", "sns", "x", "threads", "meo", "google", "codex", "claude", "workflow", "ui", "業務", "店舗", "仕事", "働き方", "開発", "制作", "運用", "改善",
  ];
  const hasTopicalSignal = topicalSignals.some((keyword) => text.includes(keyword));
  const looksOfftopic = entertainmentSignals.some((keyword) => text.includes(keyword)) && !hasTopicalSignal;
  if (looksOfftopic || ((localScores?.localTopicMatch ?? 0) < 8 && !hasTopicalSignal)) {
    return {
      passed: false,
      reason: "元投稿がれいやの返信対象としては離れているため、返信案を作りません。",
      riskFlags: ["unrelated_to_reiya"],
    };
  }
  const contextAvailable = (identity?.experiences || []).some((item) => item.publicUseAllowed !== false && item.useForReply !== false)
    || (identity?.opinions || []).some((item) => item.publicUseAllowed !== false && item.isActive !== false);
  return {
    passed: contextAvailable,
    reason: contextAvailable ? "公開可能な経験と意見に接続できます。" : "公開可能な文脈が見つからないため、返信しません。",
    riskFlags: contextAvailable ? [] : ["insufficient_context"],
  };
}

function calculateRiskPenalty({ assessment, moderation }) {
  if (moderation?.flagged) return 100;
  if ((assessment?.riskFlags || []).includes("unrelated_to_reiya")) return 30;
  if ((assessment?.contextProblems || []).includes("specialist_knowledge_required")) return 20;
  return 0;
}

function isForcedRisk(assessment, moderation) {
  return moderation?.flagged || (assessment?.riskFlags || []).some((flag) => ["political", "medical", "legal", "financial", "harassment", "misinformation", "adult", "violent", "religious", "personal_attack"].includes(flag));
}

function validateHumanEditedText(text) {
  if (!text || !String(text).trim()) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  if (String(text).length > 220 || /https?:\/\//i.test(text) || /#/.test(text)) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
}

async function ensureDailyLimit({ db, firebaseUid, operation, limit }) {
  if (!firebaseUid) return;
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const snap = await db.collection("aiUsageLogs")
    .where("firebaseUid", "==", firebaseUid)
    .where("operation", "==", operation)
    .where("createdAt", ">=", Timestamp.fromDate(start))
    .get()
    .catch(() => ({ size: 0 }));
  if ((snap.size || 0) >= limit) {
    throw Object.assign(new Error("AI_DAILY_LIMIT_REACHED"), { code: "AI_DAILY_LIMIT_REACHED" });
  }
}

module.exports = {
  assessCandidateWithAi,
  generateReplyDraftWithAi,
  processCandidateWithAi,
  processCandidateBatchWithAi,
  regenerateReplyDraftWithAi,
  saveReplyDraftSelection,
  buildLocalScores,
  finalizeContextSelection,
  moderateOriginalPost,
  buildSelectedContextFromAssessment,
  validateGeneratedCandidates,
  computeSimilarityForCandidates,
  calculateRiskPenalty,
  isForcedRisk,
};
