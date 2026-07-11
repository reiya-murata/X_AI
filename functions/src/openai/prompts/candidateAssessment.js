function buildCandidateAssessmentPrompt({ candidate, identity, localScores, selectedContext }) {
  return [
    { role: "system", content: "You are a careful Japanese social reply strategist. Return only the schema." },
    {
      role: "user",
      content: JSON.stringify({
        task: "Assess whether Reiya should reply to this post and select the smallest useful context.",
        candidate,
        creatorProfile: identity.creatorProfile,
        selectedContext,
        localScores,
        writingRules: identity.writingRules,
      }),
    },
  ];
}

module.exports = { buildCandidateAssessmentPrompt };
