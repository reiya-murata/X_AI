const DEFAULT_MODELS = {
  reply: process.env.OPENAI_REPLY_MODEL
    || process.env.OPENAI_GENERATION_MODEL
    || process.env.OPENAI_ASSESSMENT_MODEL
    || process.env.OPENAI_JUDGE_MODEL
    || "gpt-4o-mini",
  assessment: process.env.OPENAI_ASSESSMENT_MODEL
    || process.env.OPENAI_REPLY_MODEL
    || "gpt-4o-mini",
  generation: process.env.OPENAI_GENERATION_MODEL
    || process.env.OPENAI_REPLY_MODEL
    || "gpt-4o-mini",
  judge: process.env.OPENAI_JUDGE_MODEL
    || process.env.OPENAI_REPLY_MODEL
    || "gpt-4o-mini",
  moderation: process.env.OPENAI_MODERATION_MODEL || "omni-moderation-latest",
};

const PROMPT_VERSIONS = {
  replyDecision: "x-reply-decision-v2",
  assessment: "x-candidate-assessment-v1",
  generation: "x-reply-generation-v1",
  judge: "x-reply-judge-v1",
};

const PHASE3_LIMITS = {
  assessmentTimeoutMs: 30_000,
  generationTimeoutMs: 45_000,
  judgeTimeoutMs: 30_000,
  moderationTimeoutMs: 15_000,
  maxRetryCount: 2,
  maxRegenerationCount: 1,
  maxBatchSize: 10,
  dailyAssessmentLimit: 50,
  dailyGenerationLimit: 20,
  dailyJudgeLimit: 25,
  autoGenerateRanks: ["S", "A"],
};

const SCORING_RULES = {
  freshness: [
    { min: 0, max: 5, score: 50 },
    { min: 5, max: 20, score: 90 },
    { min: 20, max: 60, score: 100 },
    { min: 60, max: 120, score: 85 },
    { min: 120, max: 180, score: 65 },
    { min: 180, max: 360, score: 40 },
    { min: 360, max: Infinity, score: 0 },
  ],
};

module.exports = {
  DEFAULT_MODELS,
  PROMPT_VERSIONS,
  PHASE3_LIMITS,
  SCORING_RULES,
};
