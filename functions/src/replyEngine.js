function generateLocalReplyTest(originalPostText) {
  const text = originalPostText.trim();
  const insufficientContext = text.length < 18;

  return {
    shouldReply: !insufficientContext,
    decisionReason: insufficientContext ? "元投稿の文脈が短いため手動確認が必要です。" : "公開可能な経験と意見に接続できます。",
    replyGoal: "expertise_recognition",
    selectedAngle: "implementation_experience",
    relatedProjects: ["live-manual-ai"],
    usedExperienceIds: ["exp-live-manual-ai"],
    usedOpinionIds: ["op-ai-small-bottleneck"],
    candidates: [
      {
        type: "short",
        text: "ここ、かなり大事だと思います。AIは作る部分より、誰が確認して改善するかまで決めて初めて運用に乗りますね。",
        uniquenessScore: 78,
        profileFitScore: 84,
        conversationPotential: 72,
        promotionRisk: 8,
        genericnessRisk: 18,
      },
      {
        type: "experience",
        text: "社内FAQ系のAIを作っていても近い感覚がありました。生成機能より、未回答や例外をどう拾って改善へ戻すかを作らないと現場で止まりやすいです。",
        uniquenessScore: 88,
        profileFitScore: 91,
        conversationPotential: 78,
        promotionRisk: 12,
        genericnessRisk: 10,
      },
      {
        type: "structure_or_conversation",
        text: "生成精度だけを見るより、承認・更新・停止条件まで含めて設計できるかで、現場で使われ続けるかが変わりますね。",
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

module.exports = { generateLocalReplyTest };
