function preselectContext({ candidate, identity }) {
  const text = `${candidate.text} ${candidate.authorName} ${candidate.authorUsername}`;
  const tokens = tokenize(text);
  const projectCandidates = rankByMatch(identity.experiences, tokens, 2, (item) => ({
    id: item.projectId,
    score: scoreKeywords(
      item.categories,
      [item.title, item.description, ...(item.relatedKeywords || []), ...(item.usableClaims || []), ...(item.prohibitedClaims || [])],
      text,
      tokens,
    ) + (item.priority || 0)
      + webWorkflowBoost(item, text),
    publicUseAllowed: item.publicUseAllowed,
    useForReply: item.useForReply,
  }));
  const experienceCandidates = rankByMatch(identity.experiences, tokens, 4, (item) => ({
    id: item.experienceId,
    score: scoreKeywords(
      item.categories,
      [item.title, item.description, ...(item.relatedKeywords || []), ...(item.usableClaims || []), ...(item.prohibitedClaims || [])],
      text,
      tokens,
    ) + (item.priority || 0)
      + webWorkflowBoost(item, text),
    publicUseAllowed: item.publicUseAllowed,
    useForReply: item.useForReply,
    claimLevel: item.claimLevel,
    title: item.title,
    usableClaims: item.usableClaims,
    prohibitedClaims: item.prohibitedClaims,
  }));
  const opinionCandidates = rankByMatch(identity.opinions, tokens, 4, (item) => ({
    id: item.opinionId,
    score: scoreKeywords([item.category], [item.statement], text, tokens),
    publicUseAllowed: item.publicUseAllowed,
    isActive: item.isActive,
  }));
  const writerInstructionCandidates = rankByMatch(identity.writerInstructions || [], tokens, 5, (item) => ({
    id: item.instructionId,
    score: scoreKeywords([], [item.instruction], text, tokens),
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
    .filter((entry) => (entry.score || 0) >= 4)
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

function scoreKeywords(categories = [], keywords = [], text = "", tokens = []) {
  const hay = String(text || "").toLowerCase();
  let score = 0;
  const genericKeywords = new Set(["ai", "web", "業務", "ツール", "効率化", "自動化", "改善", "運用", "確認"]);
  for (const keyword of [...categories, ...keywords]) {
    const needle = String(keyword || "").toLowerCase();
    if (!needle) continue;
    if (hay.includes(needle)) score += genericKeywords.has(needle) ? 0.5 : 6;
  }
  for (const token of tokens) {
    if (!token) continue;
    if (hay.includes(token)) score += genericKeywords.has(token) ? 0.1 : 1.2;
  }
  return score;
}

function webWorkflowBoost(item, text) {
  const webSignals = ["web", "web制作者", "web制作", "制作", "コード", "更新", "修正", "要件", "確認"];
  const webHit = webSignals.some((needle) => String(text || "").toLowerCase().includes(needle));
  if (!webHit) return 0;
  if (item.projectId === "live-manual-ai") return 10;
  if (item.projectId === "ai-sales-researcher") return -12;
  if (item.projectId === "meo-assistant") return -6;
  return 0;
}

module.exports = { preselectContext };
