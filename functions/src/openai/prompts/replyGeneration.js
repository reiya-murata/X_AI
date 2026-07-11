function buildReplyGenerationPrompt({ candidate, identity, assessment, selectedContext, recentSimilarReplies }) {
  return [
    { role: "system", content: "You write concise Japanese X replies. Return only the schema." },
    {
      role: "user",
      content: JSON.stringify({
        task: "Generate 3 distinct reply candidates.",
        candidate,
        assessment,
        creatorProfile: identity.creatorProfile,
        selectedContext,
        writingRules: identity.writingRules,
        recentSimilarReplies,
      }),
    },
  ];
}

module.exports = { buildReplyGenerationPrompt };
