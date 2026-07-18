const assert = require("node:assert/strict");
const { buildSyncPlan } = require("../src/x/syncTimeline");
const { applyHardFilter, defaultRuleSet } = require("../src/x/hardFilter");
const { sanitizeMetadata } = require("../src/logging/safeOperationLog");
const { normalizeTimelineResponse } = require("../src/x/normalize");
const { mockTimelinePage } = require("../src/x/mockFixtures");

function main() {
  const nowMs = Date.parse("2026-07-18T12:00:00.000Z");
  const initial = buildSyncPlan(null);
  assert.equal(initial.syncMode, "initial");
  assert.equal(initial.requestedMaxResults, 50);
  assert.equal(initial.previousSinceIdPresent, false);
  assert.equal(initial.sinceId, null);

  const incremental = buildSyncPlan("1810000000000000001");
  assert.equal(incremental.syncMode, "incremental");
  assert.equal(incremental.requestedMaxResults, 20);
  assert.equal(incremental.previousSinceIdPresent, true);
  assert.equal(incremental.sinceId, "1810000000000000001");

  const normalized = normalizeTimelineResponse(mockTimelinePage("home_timeline", 1));
  const impressionRule = { ...defaultRuleSet, minimumImpressions: 10000 };
  const acceptedAtThreshold = applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: 10000 }, createdAt: new Date(nowMs - 24 * 60 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: impressionRule,
    nowMs,
  });
  assert.equal(acceptedAtThreshold.passed, true);

  const acceptedStringImpressions = applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: "10000" }, createdAt: new Date(nowMs - 23 * 60 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: { ...impressionRule, minimumImpressions: "10000" },
    nowMs,
  });
  assert.equal(acceptedStringImpressions.passed, true);

  const belowThreshold = applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: 9999 }, createdAt: new Date(nowMs - 30 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: impressionRule,
    nowMs,
  });
  assert.equal(belowThreshold.passed, false);
  assert.ok(belowThreshold.exclusionReasons.includes("below_minimum_impressions"));

  const missingImpressions = applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: null }, createdAt: new Date(nowMs - 30 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: impressionRule,
    nowMs,
  });
  assert.equal(missingImpressions.passed, false);
  assert.ok(missingImpressions.exclusionReasons.includes("below_minimum_impressions"));

  const ageRule = { ...defaultRuleSet, minimumImpressions: 10000, maxPostAgeHours: 24, maxAgeHours: 24 };
  assert.equal(applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: 10000 }, createdAt: new Date(nowMs - 23 * 60 * 60 * 1000 - 59 * 60 * 1000 - 59 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).passed, true);
  assert.equal(applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: 10000 }, createdAt: new Date(nowMs - 24 * 60 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).passed, true);
  assert.equal(applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: 10000 }, createdAt: new Date(nowMs - 24 * 60 * 60 * 1000 - 1).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).passed, false);
  assert.ok(applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: 10000 }, createdAt: null },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).exclusionReasons.includes("too_old"));
  assert.ok(applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: 10000 }, createdAt: undefined },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).exclusionReasons.includes("too_old"));
  assert.ok(applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: 10000 }, createdAt: "not-a-date" },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).exclusionReasons.includes("too_old"));
  assert.equal(applyHardFilter({
    post: { ...normalized[0], metrics: { ...normalized[0].metrics, impressions: 10000 }, createdAt: new Date(nowMs + 10 * 60 * 1000).toISOString() },
    ownXUserId: "1000000000000000000",
    ruleSet: ageRule,
    nowMs,
  }).passed, true);

  const safe = sanitizeMetadata({
    action: "candidate_fetched",
    source: "home_timeline",
    requestedMaxResults: 50,
    actualApiCalls: 1,
    fetchedCount: 12,
    savedCount: 8,
    duplicateCount: 2,
    excludedCount: 2,
    sinceIdUsed: true,
    previousSinceIdPresent: true,
    syncMode: "initial",
    cooldownApplied: true,
    result: "success",
    errorCategory: "none",
    correlationId: "run_123",
    prompt: "should be stripped",
  });
  assert.equal(safe.prompt, undefined);
  assert.equal(safe.requestedMaxResults, 50);
  assert.equal(safe.actualApiCalls, 1);

  console.log(JSON.stringify({ ok: true, initialMax: initial.requestedMaxResults, incrementalMax: incremental.requestedMaxResults }, null, 2));
}

main();
