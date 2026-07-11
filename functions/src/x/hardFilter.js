const defaultRuleSet = {
  filterRuleSetId: "x-hard-filter-v1",
  minimumTextLength: 20,
  maxAgeHours: 6,
  allowedLanguages: ["ja"],
  excludeSensitive: true,
  excludedKeywords: [
    "フォロー&リポスト",
    "フォロー＆リポスト",
    "プレゼント企画",
    "フォロバ",
    "仮想通貨",
    "爆益",
    "成人向け",
  ],
  blockedAuthorIds: [],
  version: 1,
};

async function loadHardFilterRuleSet(db) {
  const snap = await db.collection("filterRuleSets").doc(defaultRuleSet.filterRuleSetId).get();
  return snap.exists ? { ...defaultRuleSet, ...snap.data() } : defaultRuleSet;
}

function applyHardFilter({ post, ownXUserId, ruleSet, alreadyProcessed = false }) {
  const reasons = [];
  if (!/^\d+$/.test(post.postId)) reasons.push("invalid_post_id");
  const createdAt = post.createdAt ? new Date(post.createdAt) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime())) reasons.push("invalid_created_at");
  if (post.authorId === ownXUserId) reasons.push("self_post");
  if (ruleSet.excludeSensitive && post.possiblySensitive) reasons.push("sensitive");
  if (post.language && !ruleSet.allowedLanguages.includes(post.language)) reasons.push("unsupported_language");
  if (createdAt && Date.now() - createdAt.getTime() > ruleSet.maxAgeHours * 60 * 60 * 1000) reasons.push("too_old");
  if (!post.text.trim()) reasons.push("empty_text");
  if (post.text.trim().length < ruleSet.minimumTextLength) reasons.push("too_short");
  if (/^https?:\/\/\S+$/i.test(post.text.trim())) reasons.push("url_only");
  if (post.authorProtected) reasons.push("protected_author");
  if (ruleSet.blockedAuthorIds.includes(post.authorId)) reasons.push("blocked_author");
  if (alreadyProcessed) reasons.push("already_processed");

  const text = post.text;
  if (/(フォロー[&＆＋+].{0,12}(リポスト|RT)|プレゼント企画|フォロバ)/.test(text)) {
    reasons.push("giveaway_or_follow_campaign");
  }
  if (/(仮想通貨|暗号資産|爆益|必ず儲かる|億り人)/.test(text)) reasons.push("investment_spam");
  if (/(成人向け|18禁|アダルト|エロ)/.test(text)) reasons.push("adult_content");

  for (const keyword of ruleSet.excludedKeywords || []) {
    if (keyword && text.includes(keyword) && !reasons.includes("blocked_author")) {
      if (/仮想通貨|爆益/.test(keyword)) reasons.push("investment_spam");
      if (/成人|アダルト/.test(keyword)) reasons.push("adult_content");
    }
  }

  return {
    passed: reasons.length === 0,
    version: ruleSet.version,
    exclusionReasons: [...new Set(reasons)],
  };
}

module.exports = { defaultRuleSet, loadHardFilterRuleSet, applyHardFilter };
