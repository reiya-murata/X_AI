function buildReplyJudgePrompt({ candidate, generated, assessment, selectedContext, similarReplies, writingRules }) {
  return [
    { role: "system", content: "You judge Japanese X replies. Return only the schema." },
    {
      role: "user",
      content: JSON.stringify({
        task: "Judge each candidate for relevance, specificity, supported claims, duplication, and promotion risk.",
        candidate,
        generated,
        assessment,
        selectedContext,
        similarReplies,
        writingRules,
      }),
    },
  ];
}

module.exports = { buildReplyJudgePrompt };
