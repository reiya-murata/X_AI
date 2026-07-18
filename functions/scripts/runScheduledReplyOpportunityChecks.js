const assert = require("node:assert/strict");
const {
  defaultConfig,
  normalizeConfig,
  computeOpportunityScore,
  formatJst,
  normalizeEngagementRate,
  normalizeImpressionScore,
  isWithinOperatingWindow,
  buildOperatingWindowKey,
} = require("../src/scheduledReplyOpportunity");

function main() {
  const config = defaultConfig();
  assert.equal(config.scheduledReplyOpportunityEnabled, false);
  assert.equal(config.minimumImpressions, 5000);
  assert.equal(config.maxPostAgeHours, 24);
  assert.equal(config.generationLimitPerRun, 1);
  assert.equal(config.dailyLimit, 8);
  assert.equal(config.qualityScoreMinimum, 75);
  assert.equal(config.unconfirmedLimit, 20);
  assert.equal(config.operatingHoursStart, 6);
  assert.equal(config.operatingHoursEnd, 23);

  const normalized = normalizeConfig({
    scheduledReplyOpportunityEnabled: true,
    minimumImpressions: "6000",
    maxPostAgeHours: "8",
    weights: { freshness: 0.4, engagementRate: 0.2, impressions: 0.2, relevance: 0.15, authorDiversity: 0.05 },
  });
  assert.equal(normalized.scheduledReplyOpportunityEnabled, true);
  assert.equal(normalized.minimumImpressions, 6000);
  assert.equal(normalized.maxPostAgeHours, 8);
  assert.equal(normalized.qualityScoreMinimum, 75);

  assert.equal(formatJst(new Date("2026-07-18T00:00:00.000Z")).date, "2026-07-18");
  assert.equal(formatJst(new Date("2026-07-18T00:00:00.000Z")).hour, "09");
  assert.equal(buildOperatingWindowKey(new Date("2026-07-18T00:00:00.000Z")).startsWith("20260718_09"), true);
  assert.equal(isWithinOperatingWindow(new Date("2026-07-18T00:00:00.000Z"), normalized), true);
  assert.equal(isWithinOperatingWindow(new Date("2026-07-18T16:30:00.000Z"), normalized), false);
  assert.equal(normalizeEngagementRate({ likes: 10, replies: 2, reposts: 3, quotes: 1, impressions: 1000 }) > 0, true);
  assert.equal(normalizeImpressionScore(10000, 5000) > 0, true);

  const score = computeOpportunityScore(
    {
      postId: "1",
      authorId: "author-1",
      authorUsername: "ai_ops_note",
      authorName: "AI業務改善メモ",
      text: "AI導入の運用設計が大事という投稿",
      createdAt: "2026-07-18T00:00:00.000Z",
      metrics: { likes: 10, replies: 2, reposts: 1, quotes: 0, impressions: 12000 },
    },
    {
      config: normalized,
      identity: { experiences: [{ relatedKeywords: ["運用設計"] }], opinions: [{ statement: "運用設計", category: "SNS運用" }] },
      ruleSet: {},
      nowMs: Date.parse("2026-07-18T03:00:00.000Z"),
    },
  );
  assert.ok(score.total >= 0);
  assert.ok(score.selectedReason.length > 0);
  console.log(JSON.stringify({ ok: true, score: score.total, reason: score.selectedReason }, null, 2));
}

main();
