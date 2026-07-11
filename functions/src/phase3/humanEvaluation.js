const { humanEvaluationTags } = require("./qualityFixtureData");

const HUMAN_EVALUATION_SOURCES = ["fixture", "mock", "real_api", "production_manual"];
const HUMAN_EVALUATION_ORIGINS = ["human_manual", "test_snapshot", "seeded_sample", "automated_test", "legacy_unknown"];
const HUMAN_DECISIONS = ["accepted", "accepted_with_edit", "rejected", "pending"];

function normalizeHumanQualityEvaluation(input) {
  if (!["A", "B", "C"].includes(input?.candidateKey)) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  if (!["none", "minor", "major", "reject"].includes(input?.requiredEditLevel)) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const feedbackTags = Array.isArray(input?.feedbackTags) ? input.feedbackTags.filter((tag) => typeof tag === "string").slice(0, 20) : [];
  const allowedTags = new Set([...humanEvaluationTags.good, ...humanEvaluationTags.bad]);
  if (feedbackTags.some((tag) => !allowedTags.has(tag))) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  if (!HUMAN_EVALUATION_SOURCES.includes(input?.sourceType)) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  if (!HUMAN_DECISIONS.includes(input?.overallDecision)) {
    throw Object.assign(new Error("AI_CONTEXT_INVALID"), { code: "AI_CONTEXT_INVALID" });
  }
  const evaluationOrigin = HUMAN_EVALUATION_ORIGINS.includes(input?.evaluationOrigin) ? input.evaluationOrigin : null;
  return {
    candidatePostId: String(input?.candidatePostId || ""),
    replyDraftId: String(input?.replyDraftId || ""),
    candidateKey: input.candidateKey,
    fixtureId: String(input?.fixtureId || input?.candidatePostId || ""),
    candidateId: String(input?.candidateId || input?.candidateKey || ""),
    scores: {
      originalPostRelevance: clampScore(input?.scores?.originalPostRelevance),
      reiyaSpecificity: clampScore(input?.scores?.reiyaSpecificity),
      naturalJapanese: clampScore(input?.scores?.naturalJapanese),
      usefulAdditionalInsight: clampScore(input?.scores?.usefulAdditionalInsight),
      profileVisitPotential: clampScore(input?.scores?.profileVisitPotential),
      nonPromotional: clampScore(input?.scores?.nonPromotional),
      factualAccuracy: clampScore(input?.scores?.factualAccuracy),
    },
    wouldPost: Boolean(input?.wouldPost),
    requiredEditLevel: input.requiredEditLevel,
    overallDecision: input.overallDecision,
    rejectionReasons: Array.isArray(input?.rejectionReasons) ? input.rejectionReasons.filter((tag) => typeof tag === "string").slice(0, 20) : [],
    editReasons: Array.isArray(input?.editReasons) ? input.editReasons.filter((tag) => typeof tag === "string").slice(0, 20) : [],
    humanEditedText: sanitizeHumanText(input?.humanEditedText),
    evaluatorNotes: String(input?.evaluatorNotes || "").slice(0, 2000),
    evaluatedAt: String(input?.evaluatedAt || ""),
    sourceType: input.sourceType,
    evaluationOrigin,
    generationVersion: String(input?.generationVersion || ""),
    promptVersion: String(input?.promptVersion || ""),
    contextSelectorVersion: String(input?.contextSelectorVersion || ""),
    codeCheckVersion: String(input?.codeCheckVersion || ""),
    feedbackTags,
    goodTags: Array.isArray(input?.goodTags) ? input.goodTags.filter((tag) => typeof tag === "string").slice(0, 20) : [],
    badTags: Array.isArray(input?.badTags) ? input.badTags.filter((tag) => typeof tag === "string").slice(0, 20) : [],
    originalReplyText: String(input?.originalReplyText || ""),
    humanMemo: String(input?.humanMemo || ""),
    model: input?.model ? String(input.model) : null,
    responseId: input?.responseId ? String(input.responseId) : null,
    apiCallCount: Number.isFinite(Number(input?.apiCallCount)) ? Number(input.apiCallCount) : 0,
    inputTokens: input?.inputTokens ?? null,
    outputTokens: input?.outputTokens ?? null,
    latencyMs: input?.latencyMs ?? null,
  };
}

function clampScore(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function sanitizeHumanText(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 1000) : "";
}

module.exports = { normalizeHumanQualityEvaluation, humanEvaluationTags, HUMAN_EVALUATION_SOURCES, HUMAN_DECISIONS, HUMAN_EVALUATION_ORIGINS };
