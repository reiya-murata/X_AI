function buildReplyGenerationPrompt({ candidate, identity, assessment, selectedContext, recentSimilarReplies }) {
  return [
    { role: "system", content: "You write concise Japanese X replies. Return only the schema. If assessment.shouldReply is false, shouldGenerate must also be false and no draft should be produced." },
    {
      role: "user",
      content: JSON.stringify({
        task: "Generate 3 distinct reply candidates.",
        candidate,
        assessment,
        generationGuideline: "Generate only when the post is worth replying to and the reply can stay specific, natural, and non-promotional. Otherwise keep shouldGenerate false.",
        creatorProfile: identity.creatorProfile,
        selectedContext,
        writingRules: identity.writingRules,
        recentSimilarReplies,
      }),
    },
  ];
}

module.exports = { buildReplyGenerationPrompt };
