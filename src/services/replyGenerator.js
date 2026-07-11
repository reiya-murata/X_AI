import { seedData } from "../seedData";

const topicRules = [
  { topic: "社内FAQ", keywords: ["FAQ", "マニュアル", "社内", "ナレッジ", "更新"] },
  { topic: "MEO", keywords: ["MEO", "Googleビジネス", "店舗", "口コミ", "写真"] },
  { topic: "SNS運用", keywords: ["SNS", "X運用", "Threads", "投稿", "リプ"] },
  { topic: "Web制作×AI", keywords: ["Web", "制作", "WordPress", "フロー", "導線"] },
];

export function generateLocalReplyTest(originalPost) {
  const normalized = originalPost.trim();
  const topics = selectTopics(normalized);
  const relatedExperiences = seedData.experiences
    .filter((experience) => experience.publicUseAllowed && experience.useForReply)
    .filter((experience) => experience.categories.some((category) => topics.includes(category)))
    .slice(0, 2);
  const fallbackExperiences = relatedExperiences.length ? relatedExperiences : seedData.experiences.slice(0, 2);
  const relatedOpinions = seedData.opinions
    .filter((opinion) => opinion.publicUseAllowed && opinion.isActive)
    .filter((opinion) => topics.includes(opinion.category) || opinion.category === "AIツール開発")
    .slice(0, 3);

  const mainExperience = fallbackExperiences[0];
  const opinion = relatedOpinions[0] ?? seedData.opinions[0];
  const insufficientContext = normalized.length < 18;

  return {
    shouldReply: !insufficientContext,
    decisionReason: insufficientContext
      ? "元投稿の文脈が短いため手動確認が必要です"
      : "公開可能な経験と意見に接続できます",
    replyGoal: "expertise_recognition",
    selectedAngle: "implementation_experience",
    relatedProjects: fallbackExperiences.map((experience) => experience.projectId),
    usedExperienceIds: fallbackExperiences.map((experience) => experience.experienceId),
    usedOpinionIds: relatedOpinions.map((item) => item.opinionId),
    candidates: [
      {
        type: "short",
        label: "案A 短文・自然",
        text: `ここ、かなり大事だと思います。AIは作る部分より、誰が確認して改善するかまで決めて初めて運用に乗りますね。`,
        uniquenessScore: 78,
        profileFitScore: 84,
        conversationPotential: 72,
        promotionRisk: 8,
        genericnessRisk: 18,
      },
      {
        type: "experience",
        label: "案B 実装経験",
        text: `${mainExperience.name}でも近い感覚がありました。生成機能より、未回答や例外をどう拾って改善へ戻すかを作らないと、AIツールは現場で止まりやすいです。`,
        uniquenessScore: 88,
        profileFitScore: 91,
        conversationPotential: 78,
        promotionRisk: 12,
        genericnessRisk: 10,
      },
      {
        type: "structure_or_conversation",
        label: "案C 構造視点・会話",
        text: `${opinion.statement} 生成精度だけを見るより、承認・更新・停止条件まで含めて設計できるかで、現場で使われ続けるかが変わりますね。`,
        uniquenessScore: 82,
        profileFitScore: 87,
        conversationPotential: 75,
        promotionRisk: 10,
        genericnessRisk: 14,
      },
    ],
    recommendedIndex: 1,
    riskFlags: insufficientContext ? ["insufficient_context"] : [],
    finalRecommendation: insufficientContext ? "manual_review" : "reply_after_edit",
    aiJudge: {
      passed: !insufficientContext,
      score: insufficientContext ? 58 : 86,
      riskFlags: insufficientContext ? ["insufficient_context"] : [],
      reasons: ["元投稿との接続", "公開可能な経験のみ使用", "自動送信なし"],
    },
  };
}

function selectTopics(text) {
  const topics = topicRules
    .filter((rule) => rule.keywords.some((keyword) => text.includes(keyword)))
    .map((rule) => rule.topic);
  return topics.length ? topics : ["AIツール開発", "Web制作×AI"];
}
