const assert = require("node:assert/strict");
const { CandidateAssessmentSchema, ReplyGenerationSchema, ReplyJudgeSchema } = require("../src/phase3/schemas");
const { buildLocalScores, validateGeneratedCandidates, computeSimilarityForCandidates, calculateRiskPenalty } = require("../src/phase3/analysis");
const { pickScenario } = require("../src/phase3/mockFixtures");
const { calculateTotalScore } = require("../src/scoring/calculateTotalScore");
const { rankCandidate } = require("../src/scoring/rankCandidate");

function main() {
  const candidate = {
    text: "AIツールは導入した直後より、社内で誰が更新するか決めていない時に止まりがち。",
    authorName: "AI業務改善メモ",
    authorUsername: "ai_ops_note",
    createdAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    metrics: { likes: 68, replies: 9, reposts: 14, quotes: 3 },
    authorMetrics: { followers: 18400 },
  };
  const identity = {
    creatorProfile: { positioning: "Web制作出身のAI業務改善ツール開発者", targetAudiences: ["個人事業主"] },
  };
  const localScores = buildLocalScores(candidate, identity);
  assert.ok(localScores.freshness > 0);
  assert.ok(localScores.momentum > 0);

  const scenario = pickScenario(candidate);
  assert.ok(CandidateAssessmentSchema.safeParse(scenario.assessment).success);
  assert.ok(ReplyGenerationSchema.safeParse(scenario.generation).success);
  assert.ok(ReplyJudgeSchema.safeParse(scenario.judge).success);

  const checked = validateGeneratedCandidates(scenario.generation);
  assert.equal(checked.ok, true);

  const similarity = computeSimilarityForCandidates(scenario.generation.candidates, [
    { contentId: "recent-reply-1", text: "AIは導入よりも、誰が更新して改善へ戻すかを決める方が大事。" },
  ]);
  assert.equal(similarity.length, 3);
  assert.ok(similarity.every((item) => item.similarity.maxScore >= 0));

  const total = calculateTotalScore({
    relevanceScore: scenario.assessment.relevanceScore,
    replyValueScore: scenario.assessment.replyValueScore,
    momentumScore: localScores.momentum,
    profileConversionScore: scenario.assessment.profileConversionScore,
    freshnessScore: localScores.freshness,
    saturationPenalty: Math.abs(localScores.saturationPenalty),
    riskPenalty: Math.abs(calculateRiskPenalty({ assessment: scenario.assessment, moderation: { flagged: false } })),
  });
  assert.equal(rankCandidate(total), "S");

  console.log(JSON.stringify({ ok: true, total, localScores, candidateKeys: scenario.generation.candidates.map((item) => item.candidateKey) }, null, 2));
}

main();
