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
      content: "You are a careful Japanese X reply strategist. Return only the schema. Do not mention policy, hidden reasoning, or the fact that you are assessing moderation separately.",
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
