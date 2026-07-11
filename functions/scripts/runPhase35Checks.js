const { preselectContext } = require("../src/identity/preselectContext");
const { buildLocalScores, calculateRiskPenalty } = require("../src/phase3/analysis");
const { pickScenario } = require("../src/phase3/mockFixtures");
const { CandidateAssessmentSchema, ReplyGenerationSchema, ReplyJudgeSchema } = require("../src/phase3/schemas");
const { calculateTotalScore } = require("../src/scoring/calculateTotalScore");
const { rankCandidate } = require("../src/scoring/rankCandidate");

const fixtures = [
  {
    fixtureId: "auto-automation-opinion",
    candidate: {
      text: "AIツールは完全自動化すれば解決する、という考え方は危ないと思う。",
      authorName: "AI導入メモ",
      authorUsername: "ai_notes",
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      metrics: { likes: 24, replies: 3, reposts: 2, quotes: 1 },
      authorMetrics: { followers: 5400 },
    },
    expectedPrimaryTopics: ["ai_business_improvement", "ai_tool_development", "other"],
  },
  {
    fixtureId: "used-in-field",
    candidate: {
      text: "AIツールを作ったけど、現場で使われるところまで運べない。",
      authorName: "業務AI開発",
      authorUsername: "work_ai_dev",
      createdAt: new Date(Date.now() - 55 * 60 * 1000).toISOString(),
      metrics: { likes: 48, replies: 8, reposts: 4, quotes: 1 },
      authorMetrics: { followers: 9200 },
    },
    expectedPrimaryTopics: ["ai_business_improvement", "ai_tool_development"],
  },
  {
    fixtureId: "web-and-ai",
    candidate: {
      text: "Web制作とAIの仕事は、今後どう分かれていくんだろう。",
      authorName: "制作とAI",
      authorUsername: "web_ai_future",
      createdAt: new Date(Date.now() - 70 * 60 * 1000).toISOString(),
      metrics: { likes: 31, replies: 6, reposts: 3, quotes: 0 },
      authorMetrics: { followers: 7800 },
    },
    expectedPrimaryTopics: ["web_and_ai", "ai_coding", "ui_ux_workflow"],
  },
  {
    fixtureId: "store-meo",
    candidate: {
      text: "小規模店舗の口コミ返信やMEO運用、AIでどこまで楽になるんだろう。",
      authorName: "店舗運営",
      authorUsername: "store_ops",
      createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
      metrics: { likes: 56, replies: 11, reposts: 7, quotes: 2 },
      authorMetrics: { followers: 6600 },
    },
    expectedPrimaryTopics: ["store_operation", "meo", "small_business"],
  },
  {
    fixtureId: "unrelated-general",
    candidate: {
      text: "今日は天気がいいですね。",
      authorName: "一般話題",
      authorUsername: "random_talk",
      createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      metrics: { likes: 2, replies: 0, reposts: 0, quotes: 0 },
      authorMetrics: { followers: 120 },
    },
    expectedPrimaryTopics: ["other"],
  },
];

function main() {
  const identity = {
    creatorProfile: {
      positioning: "Web制作出身のAI業務改善ツール開発者",
      targetAudiences: ["個人事業主", "小規模事業者", "店舗経営者", "Web制作者"],
    },
    experiences: [
      { projectId: "live-manual-ai", experienceId: "exp-live-manual-ai", publicUseAllowed: true, useForReply: true, title: "社内FAQ・マニュアルAI", categories: ["社内FAQ", "マニュアル", "業務改善"], relatedKeywords: ["FAQ", "マニュアル", "未回答", "改善ループ"], claimLevel: "implemented", usableClaims: ["未回答ログから改善する仕組みが必要"], prohibitedClaims: [], priority: 1 },
      { projectId: "threads-ai", experienceId: "exp-threads-ai", publicUseAllowed: true, useForReply: true, title: "SNS運用AI", categories: ["SNS運用", "Threads"], relatedKeywords: ["SNS", "Threads", "承認", "投稿"], claimLevel: "verified", usableClaims: ["半自動運用の方が安全"], prohibitedClaims: [], priority: 2 },
      { projectId: "meo-assistant", experienceId: "exp-meo-assistant", publicUseAllowed: true, useForReply: true, title: "店舗向けMEO運用AI", categories: ["店舗運営", "MEO", "Googleビジネスプロフィール"], relatedKeywords: ["店舗", "口コミ", "返信", "MEO", "Google", "写真"], claimLevel: "in_development", usableClaims: ["口コミ返信や写真依頼を運用ループとして設計している"], prohibitedClaims: [], priority: 3 },
      { projectId: "ai-sales-researcher", experienceId: "exp-ai-sales-researcher", publicUseAllowed: true, useForReply: true, title: "営業リスト作成AI", categories: ["営業", "リサーチ", "AI業務改善"], relatedKeywords: ["営業", "リサーチ", "リード", "抽出", "分析"], claimLevel: "planned", usableClaims: ["段階を分けて検証しながら進めている"], prohibitedClaims: [], priority: 4 },
    ],
    opinions: [
      { opinionId: "op-ai-small-bottleneck", category: "AIツール開発", statement: "全部を自動化するより、1つのボトルネックを減らす方が成功しやすいです。", publicUseAllowed: true, isActive: true },
      { opinionId: "op-approval-loop", category: "SNS運用", statement: "完全自動投稿より、人間承認を残した半自動運用の方が現実的です。", publicUseAllowed: true, isActive: true },
      { opinionId: "op-meo-light", category: "MEO", statement: "口コミ返信はテンプレート化より、店ごとの文脈を少し残した方が自然です。", publicUseAllowed: true, isActive: true },
      { opinionId: "op-research-phased", category: "営業", statement: "営業系の自動化は一気通貫より、探索・抽出・分析を分ける方が安定します。", publicUseAllowed: true, isActive: true },
    ],
    writerInstructions: [
      { instructionId: "writer-rule-1", instruction: "宣伝臭を抑えて、元投稿の文脈に直接反応する。", useForGeneration: true, publicUseAllowed: true },
    ],
    recentContent: [
      { contentId: "recent-reply-1", text: "AIは導入よりも、誰が更新して改善へ戻すかを決める方が大事。" },
    ],
  };

  const rows = fixtures.map((fixture) => {
    const context = preselectContext({ candidate: fixture.candidate, identity });
    const localScores = buildLocalScores(fixture.candidate, identity);
    const scenario = pickScenario(fixture.candidate);
    const assessmentOk = CandidateAssessmentSchema.safeParse(scenario.assessment).success;
    const generationOk = ReplyGenerationSchema.safeParse(scenario.generation).success;
    const judgeOk = ReplyJudgeSchema.safeParse(scenario.judge).success;
    const total = calculateTotalScore({
      relevanceScore: scenario.assessment.relevanceScore,
      replyValueScore: scenario.assessment.replyValueScore,
      momentumScore: localScores.momentum,
      profileConversionScore: scenario.assessment.profileConversionScore,
      freshnessScore: localScores.freshness,
      saturationPenalty: Math.abs(localScores.saturationPenalty),
      riskPenalty: Math.abs(calculateRiskPenalty({ assessment: scenario.assessment, moderation: { flagged: false } })),
    });
    return {
      fixtureId: fixture.fixtureId,
      preselectedProjects: context.projectCandidates.slice(0, 2).map((item) => item.projectId || item.id),
      assessmentTopic: scenario.assessment.primaryTopic,
      assessmentOk,
      generationOk,
      judgeOk,
      candidateCount: scenario.generation.candidates.length,
      distinctCandidates: new Set(scenario.generation.candidates.map((item) => item.text)).size,
      rank: rankCandidate(total),
      shouldReply: scenario.assessment.shouldReply,
      expectedPrimaryTopics: fixture.expectedPrimaryTopics,
    };
  });

  const summary = {
    ok: true,
    phase3_5_check: "mock-fixture-only",
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    openaiMockMode: process.env.OPENAI_MOCK_MODE === "true" || !process.env.OPENAI_API_KEY,
    rows,
    note: process.env.OPENAI_API_KEY ? "Real API runner should be added in a connected emulator session." : "OPENAI_API_KEY is not set, so real API checks were skipped.",
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
