function buildCandidateAssessmentPrompt({ candidate, identity, localScores, selectedContext }) {
  return [
    { role: "system", content: "You are a careful Japanese social reply strategist. Return only the schema. If the post is outside Reiya's reply territory, answer shouldReply false instead of forcing generic empathy. When selecting context, choose only direct support needed for the reply and avoid broad overlaps just because the post mentions AI, web, automation, or business." },
    {
      role: "user",
      content: JSON.stringify({
        task: "Assess whether Reiya should reply to this post and select the smallest useful context.",
        replyGuideline: "Reply only when Reiya's expertise, experience, or perspective adds value. Do not reply to entertainment, daily life, gossip, or other posts that would only produce generic agreement. If a post can be answered without a concrete context, keep context empty instead of choosing broad unrelated contexts.",
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
