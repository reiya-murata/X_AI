const assert = require("node:assert/strict");
const {
  encryptText,
  decryptText,
  randomUrlSafe,
  createCodeChallenge,
  hashValue,
} = require("../src/security/tokenEncryption");
const { mockTimelinePage } = require("../src/x/mockFixtures");
const { normalizeTimelineResponse } = require("../src/x/normalize");
const { applyHardFilter, defaultRuleSet } = require("../src/x/hardFilter");

process.env.X_TOKEN_ENCRYPTION_KEY = "dev-only-32-byte-key-for-local!!";

function run() {
  const nowMs = Date.parse("2026-07-18T12:00:00.000Z");
  const state = randomUrlSafe(32);
  assert.equal(typeof state, "string");
  assert.ok(state.length >= 32);
  assert.equal(hashValue(state).length, 64);

  const verifier = randomUrlSafe(64);
  const challenge = createCodeChallenge(verifier);
  assert.ok(challenge.length > 40);

  const encrypted = encryptText("secret-token");
  assert.notEqual(encrypted.ciphertext, "secret-token");
  assert.equal(decryptText(encrypted), "secret-token");

  const normalized = normalizeTimelineResponse(mockTimelinePage("home_timeline", 1));
  assert.equal(normalized.length, 6);
  assert.equal(normalized[0].postId, "1810000000000000001");
  assert.equal(normalized[0].authorUsername, "ai_ops_note");
  assert.equal(normalized[0].metrics.impressions, 12000);
  assert.equal(normalized[1].metrics.impressions, 10000);
  assert.equal(normalized[3].metrics.impressions, 9999);
  assert.equal(normalized[4].metrics.impressions, null);

  const passed = applyHardFilter({
    post: normalized[0],
    ownXUserId: "1000000000000000000",
    ruleSet: { ...defaultRuleSet, minimumImpressions: 10000 },
  });
  assert.equal(passed.passed, true);

  const stringImpressions = applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: "10000" } },
    ownXUserId: "1000000000000000000",
    ruleSet: { ...defaultRuleSet, minimumImpressions: "10000" },
  });
  assert.equal(stringImpressions.passed, true);

  const belowMinimumImpressions = applyHardFilter({
    post: normalized[3],
    ownXUserId: "1000000000000000000",
    ruleSet: { ...defaultRuleSet, minimumImpressions: 10000 },
  });
  assert.ok(belowMinimumImpressions.exclusionReasons.includes("below_minimum_impressions"));

  const missingImpressions = applyHardFilter({
    post: normalized[4],
    ownXUserId: "1000000000000000000",
    ruleSet: { ...defaultRuleSet, minimumImpressions: 10000 },
  });
  assert.ok(missingImpressions.exclusionReasons.includes("below_minimum_impressions"));

  const selfPost = applyHardFilter({
    post: normalized[2],
    ownXUserId: "1000000000000000000",
    ruleSet: defaultRuleSet,
  });
  assert.ok(selfPost.exclusionReasons.includes("self_post"));

  const giveaway = applyHardFilter({
    post: normalized[3],
    ownXUserId: "1000000000000000000",
    ruleSet: defaultRuleSet,
  });
  assert.ok(giveaway.exclusionReasons.includes("giveaway_or_follow_campaign"));

  const ageRule = { ...defaultRuleSet, minimumImpressions: 10000, maxPostAgeHours: 24, maxAgeHours: 24 };
  const ageBasePost = {
    ...normalized[0],
    metrics: { ...normalized[0].metrics, impressions: 10000 },
    text: `${normalized[0].text} `,
  };
  assert.equal(applyHardFilter({
    post: { ...ageBasePost, createdAt: new Date(nowMs - 23 * 60 * 60 * 1000 - 59 * 60 * 1000 - 59 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).passed, true);
  assert.equal(applyHardFilter({
    post: { ...ageBasePost, createdAt: new Date(nowMs - 24 * 60 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).passed, true);
  assert.ok(applyHardFilter({
    post: { ...ageBasePost, createdAt: new Date(nowMs - 24 * 60 * 60 * 1000 - 1).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).exclusionReasons.includes("too_old"));
  assert.ok(applyHardFilter({
    post: { ...ageBasePost, createdAt: null },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).exclusionReasons.includes("too_old"));
  assert.ok(applyHardFilter({
    post: { ...ageBasePost, createdAt: undefined },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).exclusionReasons.includes("too_old"));
  assert.ok(applyHardFilter({
    post: { ...ageBasePost, createdAt: "not-a-date" },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).exclusionReasons.includes("too_old"));
  assert.equal(applyHardFilter({
    post: { ...ageBasePost, createdAt: new Date(nowMs + 10 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).passed, true);
  assert.equal(applyHardFilter({
    post: { ...ageBasePost, createdAt: new Date(nowMs - 3 * 60 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: { ...ageRule, maxPostAgeHours: 0, maxAgeHours: 0 },
    nowMs,
  }).passed, true);
  assert.ok(applyHardFilter({
    post: { ...ageBasePost, metrics: { ...ageBasePost.metrics, impressions: 9999 }, createdAt: new Date(nowMs - 30 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).exclusionReasons.includes("below_minimum_impressions"));
  assert.ok(applyHardFilter({
    post: { ...ageBasePost, metrics: { ...ageBasePost.metrics, impressions: 10000 }, createdAt: new Date(nowMs - 25 * 60 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).exclusionReasons.includes("too_old"));
  assert.equal(applyHardFilter({
    post: { ...ageBasePost, metrics: { ...ageBasePost.metrics, impressions: 10000 }, createdAt: new Date(nowMs - 12 * 60 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).passed, true);

  const params = new URLSearchParams({
    in_reply_to: "1810000000000000001",
    text: "テスト返信",
  });
  assert.equal(
    `https://x.com/intent/tweet?${params.toString()}`,
    "https://x.com/intent/tweet?in_reply_to=1810000000000000001&text=%E3%83%86%E3%82%B9%E3%83%88%E8%BF%94%E4%BF%A1",
  );

  require("./runScheduledReplyOpportunityChecks.js");
  console.log("Phase 2 checks passed.");
}

run();
