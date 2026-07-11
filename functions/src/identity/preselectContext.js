function preselectContext({ candidate, identity }) {
  const tokens = tokenize(`${candidate.text} ${candidate.authorName} ${candidate.authorUsername}`);
  const projectCandidates = rankByMatch(identity.experiences, tokens, 2, (item) => ({
    id: item.projectId,
    score: scoreKeywords(item.categories, item.relatedKeywords, tokens) + (item.priority || 0),
    publicUseAllowed: item.publicUseAllowed,
    useForReply: item.useForReply,
  }));
  const experienceCandidates = rankByMatch(identity.experiences, tokens, 4, (item) => ({
    id: item.experienceId,
    score: scoreKeywords(item.categories, item.relatedKeywords, tokens) + (item.priority || 0),
    publicUseAllowed: item.publicUseAllowed,
    useForReply: item.useForReply,
    claimLevel: item.claimLevel,
    title: item.title,
    usableClaims: item.usableClaims,
    prohibitedClaims: item.prohibitedClaims,
  }));
  const opinionCandidates = rankByMatch(identity.opinions, tokens, 4, (item) => ({
    id: item.opinionId,
    score: scoreKeywords([item.category], [item.statement], tokens),
    publicUseAllowed: item.publicUseAllowed,
    isActive: item.isActive,
  }));
  const writerInstructionCandidates = rankByMatch(identity.writerInstructions || [], tokens, 5, (item) => ({
    id: item.instructionId,
    score: scoreKeywords([], [item.instruction], tokens),
    publicUseAllowed: true,
    useForGeneration: item.useForGeneration,
  }));
  return {
    projectCandidates,
    experienceCandidates,
    opinionCandidates,
    writerInstructionCandidates,
    recentContentCandidates: (identity.recentContent || []).slice(0, 5),
  };
}

function rankByMatch(items, tokens, limit, mapItem) {
  return items
    .map((item) => ({ ...mapItem(item), item }))
    .filter((entry) => entry.publicUseAllowed !== false)
    .filter((entry) => entry.useForReply !== false || entry.useForReply === undefined)
    .filter((entry) => entry.useForGeneration !== false || entry.useForGeneration === undefined)
    .filter((entry) => entry.isActive !== false || entry.isActive === undefined)
    .filter((entry) => (entry.score || 0) >= 5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item, score, ...rest }) => ({ ...item, score, ...rest }));
}

function tokenize(text) {
  const stopwords = new Set(["ai", "web", "and", "the", "to", "of", "in", "on", "for", "は", "が", "を", "に", "と", "で", "から", "まで", "する", "こと"]);
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token && token.length > 1 && !stopwords.has(token));
}

function scoreKeywords(categories = [], keywords = [], tokens = []) {
  const hay = `${categories.join(" ")} ${keywords.join(" ")}`.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!token) continue;
    if (hay.includes(token)) score += 5;
  }
  return score;
}

module.exports = { preselectContext };
