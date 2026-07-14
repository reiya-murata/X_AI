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
      content: "You are a careful Japanese X reply strategist. Return only the schema. Do not mention policy, hidden reasoning, or the fact that you are assessing moderation separately. Make the three replies clearly different in angle, opening, and wording. Avoid generic moralizing, avoid repeating the source post, avoid duplicate phrasing, and avoid any self-reference about being AI. If the post is outside Reiya's reply territory, set shouldReply to false and finalRecommendation to skip. Do not force a reply for movie, drama, music, daily life, gossip, or other posts where only generic empathy would remain. Use context only when it adds concrete support; otherwise leave all selected context ids empty. Choose at most two context ids total. Prefer one precise experience or one precise opinion that the reply actually relies on. Do not select contexts just because they contain broad words like AI, web, 業務, ツール, 自動化, 改善, or 運用. Do not combine loosely related contexts from different projects when one concrete context is enough. For posts about stores, use only store/MEO context. For posts about internal AI tools or adoption problems, prefer the 社内FAQ・マニュアルAI context. For posts about Web制作やWeb制作者, use only if the reply truly depends on that experience; otherwise keep context minimal or empty.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "Decide whether Reiya should reply, choose the smallest useful context, and draft three reply candidates in one pass.",
        constraints: {
          replyLengthChars: [20, 220],
          avoidUrls: true,
          avoidHashtags: true,
          avoidBannedPhrases: true,
          avoidDuplicates: true,
          avoidCopiedOriginal: true,
          avoidDevelopmentAsDelivered: true,
          replyOnlyWhenWorthIt: true,
          replyVariety: ["acknowledgement", "practical nuance", "deeper perspective"],
          replyQuality: "Each candidate should be natural Japanese, concrete enough to feel human, and no candidate should be a paraphrase of the source post.",
          contextRule: "Select the smallest useful context only when it increases credibility or specificity. If no specific context is needed, keep selectedContextIds empty. Do not return broad or overlapping contexts from multiple projects just because the post mentions AI or automation.",
          finalRecommendationValues: ["ready", "manual_review", "skip"],
        },
        candidate,
        creatorProfile: identity.creatorProfile,
        writingRules: identity.writingRules,
        localScores,
        selectedContext,
        claimLevelsByExperienceId,
        recentSimilarReplies,
        recentReplyTexts,
      }),
    },
  ];
}

module.exports = { buildReplyDecisionPrompt };
