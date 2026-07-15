const assert = require("node:assert/strict");
const { buildSyncPlan } = require("../src/x/syncTimeline");
const { sanitizeMetadata } = require("../src/logging/safeOperationLog");

function main() {
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
