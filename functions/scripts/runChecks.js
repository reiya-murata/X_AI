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

  const passed = applyHardFilter({
    post: normalized[0],
    ownXUserId: "1000000000000000000",
    ruleSet: defaultRuleSet,
  });
  assert.equal(passed.passed, true);

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

  const params = new URLSearchParams({
    in_reply_to: "1810000000000000001",
    text: "テスト返信",
  });
  assert.equal(
    `https://x.com/intent/tweet?${params.toString()}`,
    "https://x.com/intent/tweet?in_reply_to=1810000000000000001&text=%E3%83%86%E3%82%B9%E3%83%88%E8%BF%94%E4%BF%A1",
  );

  console.log("Phase 2 checks passed.");
}

run();
