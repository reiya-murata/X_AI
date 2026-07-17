function buildCandidateAssessmentPrompt({ candidate, identity, localScores, selectedContext }) {
  return [
    { role: "system", content: "You are a careful Japanese social reply strategist. Return only the schema. If the post is outside Reiya's reply territory, answer shouldReply false instead of forcing generic empathy. When selecting context, choose only direct support needed for the reply and avoid broad overlaps just because the post mentions AI, web, automation, or business. Prefer a reply only when Reiya can add one concrete point such as a workflow step, a check point, a failure mode, a tradeoff, or a measurement idea." },
    {
      role: "user",
      content: JSON.stringify({
        task: "Assess whether Reiya should reply to this post and select the smallest useful context.",
        replyGuideline: "Reply only when Reiya's expertise, experience, or perspective adds value. Do not reply to entertainment, daily life, gossip, or other posts that would only produce generic agreement. If a post can be answered without a concrete context, keep context empty instead of choosing broad unrelated contexts. For Web制作やAIの投稿, prefer a context only if it supports a concrete note about where AI fits in the workflow, where human review remains, or what broke during implementation. Favor a context that lets the reply name an actual workflow step such as 要件整理, 確認, 修正, 更新フロー, テスト, or 人の確認.",
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
