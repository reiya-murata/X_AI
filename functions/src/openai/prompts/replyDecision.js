function buildReplyDecisionPrompt({
  candidate,
  identity,
  localScores,
  selectedContext,
  recentSimilarReplies,
  claimLevelsByExperienceId,
  recentReplyTexts,
}) {
  return [
    {
      role: "system",
      content: "You are a careful Japanese X reply strategist. Return only the schema. Do not mention policy, hidden reasoning, or the fact that you are assessing moderation separately. Make the three replies clearly different in angle, opening, and wording. Avoid generic moralizing, avoid repeating the source post, avoid duplicate phrasing, and avoid any self-reference about being AI. Never use 私たち, our company, or any corporate-public-relations tone. Prefer 自分 or no first-person at all. If the post is outside Reiya's reply territory, set shouldReply to false and finalRecommendation to skip. Do not force a reply for movie, drama, music, daily life, gossip, or other posts where only generic empathy would remain. Each reply must add one concrete point beyond the source post, such as a workflow step, a check point, a failure mode, a tradeoff, or a thing to measure. If you use an abstract noun, place a concrete example immediately after it. Avoid stock phrases like 現場での経験が大事, 実際の運用が鍵, 競争力の源, 差をつける, 成果につながる, 期待できそう, 一助となる, 重要です, 大切ですね. Use context only when it adds concrete support; otherwise leave all selected context ids empty. Choose at most two context ids total, and usually one is enough. Prefer one precise experience or one precise opinion that the reply actually relies on. Do not select contexts just because they contain broad words like AI, web, 業務, ツール, 自動化, 改善, or 運用. Do not combine loosely related contexts from different projects when one concrete context is enough. For posts about stores, use only store/MEO context. For posts about internal AI tools or adoption problems, prefer the 社内FAQ・マニュアルAI context. For posts about Web制作やWeb制作者, reply with a concrete note about where AI fits in the workflow, where human review remains, or what broke in implementation. Keep each candidate role distinct: A = natural supplement with one concrete workflow detail, B = concrete implementation/verification/failure-based view, C = short sharp alternate angle with a specific decision point. Avoid closing with a project introduction, service pitch, or optimistic slogan.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Decide whether Reiya should reply, choose the smallest useful context, and draft three reply candidates in one pass.",
        constraints: {
          replyLengthChars: [60, 180],
          avoidUrls: true,
          avoidHashtags: true,
          avoidBannedPhrases: true,
          avoidDuplicates: true,
          avoidCopiedOriginal: true,
          avoidDevelopmentAsDelivered: true,
          replyOnlyWhenWorthIt: true,
          replyVariety: ["natural acknowledgment with one concrete supplement", "specific implementation or verification detail", "short sharp alternate angle"],
          replyQuality: "Each candidate should be natural Japanese, concrete enough to feel human, and no candidate should be a paraphrase of the source post. Never use 私たち or a corporate-style voice. Each candidate must contain at least one concrete detail that changes the angle instead of repeating the source post.",
          contextRule: "Select the smallest useful context only when it increases credibility or specificity. If no specific context is needed, keep selectedContextIds empty. Do not return broad or overlapping contexts from multiple projects just because the post mentions AI or automation.",
          finalRecommendationValues: ["ready", "manual_review", "skip"],
          concreteContextRule: "If context is selected, each candidate must visibly reuse at least one concrete noun or process fragment from selectedContext or usedClaimEvidence, such as 要件整理, 確認, 修正, 更新フロー, 未回答, 人の確認, テスト, or 失敗. Paraphrasing only the general idea is not enough.",
          styleExamples: {
            webAndAi: [
              "AIは作る速さより、要件整理と確認のどこに置くかで差が出ますね。",
              "制作の延長でAIを触ると、更新確認の方が先に詰まりやすいです。",
              "AIを足すより、どの工程を短くするかを決めたいです。",
            ],
            implementationExperience: [
              "社内FAQ系のAIを作っていても、未回答や例外をどう拾って改善へ戻すかが先に大事でした。",
              "生成精度より、承認・更新・停止条件を先に決める方が回りやすいです。",
              "人の確認を残すと、回し始めた後の安定感が違います。",
            ],
          },
          bannedPhraseExamples: [
            "現場での経験が大事",
            "実際の運用が鍵",
            "競争力の源",
            "差をつける",
            "成果につながる",
            "期待できそう",
            "一助となる",
            "重要です",
            "大切ですね",
            "確実に",
            "不可欠",
            "寄与します",
            "実現できます",
            "欠かせない",
            "必要です",
          ],
        },
        candidate,
        creatorProfile: identity.creatorProfile,
        writingRules: identity.writingRules,
        localScores,
        selectedContext,
        claimLevelsByExperienceId,
        recentSimilarReplies,
        recentReplyTexts,
        concreteExamples: {
          webAndAi: ["要件整理", "確認", "修正", "更新フロー", "人の確認", "テスト", "失敗"],
          internalAutomation: ["未回答", "改善ループ", "承認", "停止条件"],
          storeMeo: ["口コミ返信", "写真依頼", "毎週", "回す"],
        },
      }),
    },
  ];
}

module.exports = { buildReplyDecisionPrompt };
