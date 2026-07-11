const assert = require("node:assert/strict");
const {
  classifyOpenAi429,
  sanitizeOpenAiMessage,
  retryOpenAi,
  collectOpenAiErrorEvidence,
} = require("../src/openai/client");
const { determineRunnerExitCode, summarizeOpenAiFailure } = require("./runPhase37Real");

async function main() {
  assert.equal(classifyOpenAi429(fake429("insufficient_quota")), "insufficient_quota");
  assert.equal(classifyOpenAi429(fake429("billing_hard_limit_reached")), "billing_hard_limit_reached");
  assert.equal(classifyOpenAi429(fake429("project_limit")), "project_account_usage_limit");
  assert.equal(classifyOpenAi429(fake429("rate_limit_exceeded")), "rate_limit_exceeded");
  assert.equal(classifyOpenAi429(fake429(null, "Too Many Requests")), "unknown_429");
  assert.equal(classifyOpenAi429(fake429(null, "exceeded your current quota")), "insufficient_quota");
  assert.equal(classifyOpenAi429(fake429(null, "check your plan and billing details")), "billing_hard_limit_reached");
  assert.equal(classifyOpenAi429(fake429(null, "requests per min")), "rate_limit_exceeded");
  assert.equal(classifyOpenAi429({ status: 429, message: "429" }), "unknown_429");
  assert.equal(classifyOpenAi429({
    status: 429,
    name: "Error",
    type: "insufficient_quota",
    code: "OPENAI_RATE_LIMITED",
    message: "429 You exceeded your current quota, please check your plan and billing details.",
    error: { code: "OPENAI_RATE_LIMITED", type: "insufficient_quota", message: "429 You exceeded your current quota, please check your plan and billing details." },
    response: { data: { error: { code: "OPENAI_RATE_LIMITED", type: "insufficient_quota", message: "429 You exceeded your current quota, please check your plan and billing details." } } },
  }), "insufficient_quota");
  assert.equal(classifyOpenAi429({
    status: 429,
    code: "OPENAI_RATE_LIMITED",
    message: "429 You exceeded your current quota, please check your plan and billing details.",
  }), "insufficient_quota");
  assert.equal(classifyOpenAi429({
    status: 429,
    code: "OPENAI_RATE_LIMITED",
    error: { code: "OPENAI_RATE_LIMITED" },
    response: { data: { error: { code: "OPENAI_RATE_LIMITED" } } },
  }), "unknown_429");

  const safe = sanitizeOpenAiMessage("Bearer sk-abc123 Authorization: secret OPENAI_API_KEY=xyz");
  assert.ok(!safe.includes("sk-abc123"));
  assert.ok(!safe.includes("Authorization: secret"));
  assert.ok(!safe.includes("OPENAI_API_KEY"));

  let attempts = 0;
  const success = await retryOpenAi(async () => {
    attempts += 1;
    return { ok: true };
  });
  assert.equal(success.ok, true);
  assert.equal(attempts, 1);

  attempts = 0;
  await assert.rejects(() => retryOpenAi(async () => {
    attempts += 1;
    throw fake429("insufficient_quota");
  }));
  assert.equal(attempts, 1);

  attempts = 0;
  await assert.rejects(() => retryOpenAi(async () => {
    attempts += 1;
    throw fake429("billing_hard_limit_reached");
  }));
  assert.equal(attempts, 1);

  attempts = 0;
  await assert.rejects(() => retryOpenAi(async () => {
    attempts += 1;
    throw fake429("rate_limit_exceeded", "Retry later", "2");
  }));
  assert.equal(attempts, 2);

  const headerOnly = fake429("insufficient_quota", "exceeded your current quota", "5", {
    "x-request-id": "req-1",
    "x-ratelimit-remaining-requests": "0",
  });
  delete headerOnly.requestId;
  const evidence = collectOpenAiErrorEvidence(headerOnly);
  assert.equal(evidence.requestId, "req-1");
  assert.equal(evidence.retryAfter, 5000);
  assert.equal(evidence.rateLimitHeaders["x-ratelimit-remaining-requests"], 0);

  assert.equal(determineRunnerExitCode({ skipped: true, realApiCompleted: false }), 0);
  assert.equal(determineRunnerExitCode({ skipped: false, realApiCompleted: true }), 0);
  assert.equal(determineRunnerExitCode({ skipped: false, realApiCompleted: false }), 1);

  const headerOnly2 = fake429("insufficient_quota", "exceeded your current quota", "5", {
    "x-request-id": "req-1",
    "x-ratelimit-remaining-requests": "0",
  });
  delete headerOnly2.requestId;
  const diag = summarizeOpenAiFailure({ error: headerOnly2, fixtureId: "complete-automation" });
  assert.equal(diag.errorCategory, "insufficient_quota");
  assert.equal(diag.retryAfter, 5000);
  assert.equal(diag.error.requestId, "req-1");
  assert.equal(diag.rateLimitHeaders["x-ratelimit-remaining-requests"], 0);
  assert.ok(!JSON.stringify(diag).includes("sk-abc123"));
  assert.ok(!JSON.stringify(diag).includes("Authorization"));

  console.log(JSON.stringify({ ok: true, attempts }, null, 2));
}

function fake429(code, message = "429 Too Many Requests", retryAfter = null, extraHeaders = {}) {
  const error = new Error(message);
  error.status = 429;
  error.code = code;
  error.type = code;
  error.name = "OpenAIError";
  error.requestId = "req_safe_test";
  error.response = {
    status: 429,
    data: { error: { code, type: code, message } },
    headers: {
      get: (key) => {
        const lower = String(key).toLowerCase();
        if (lower === "retry-after" && retryAfter != null) return retryAfter;
        if (extraHeaders[lower] != null) return extraHeaders[lower];
        return null;
      },
      ...Object.fromEntries(Object.entries(extraHeaders).map(([key, value]) => [key.toLowerCase(), value])),
    },
  };
  return error;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
