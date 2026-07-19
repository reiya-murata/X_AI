const assert = require("node:assert/strict");
const fs = require("node:fs");
const { evaluateServerEnvironment, assertDemoWriteEnvironment, assertRuntimeOperationAllowed } = require("../functions/src/environmentSafety");

const base = { GCLOUD_PROJECT: "x-reply-intelligence", APP_ENV: "production", OPENAI_MOCK_MODE: "true", X_API_MOCK_MODE: "false" };
assert.equal(evaluateServerEnvironment(base, "production").ok, false);
assert.ok(evaluateServerEnvironment(base, "production").checks.some((item) => item.id === "production_mock"));
assert.equal(evaluateServerEnvironment({ ...base, OPENAI_MOCK_MODE: undefined }, "production").flags.openAiMock, false);
assert.equal(evaluateServerEnvironment({ ...base, X_API_MOCK_MODE: undefined }, "production").flags.xApiMock, false);
assert.equal(evaluateServerEnvironment({ ...base, APP_ENV: "development" }, "local").ok, false);
assert.throws(() => assertDemoWriteEnvironment({ ...base, FIRESTORE_EMULATOR_HOST: "127.0.0.1:8082", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9097" }), /demo Firebase Emulator/);
assert.throws(() => assertRuntimeOperationAllowed(base), /UNSAFE_RUNTIME_ENVIRONMENT/);
assert.doesNotThrow(() => assertDemoWriteEnvironment({ GCLOUD_PROJECT: "demo-x", APP_ENV: "development", OPENAI_MOCK_MODE: "true", X_API_MOCK_MODE: "true", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8082", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9097" }));
assert.equal(
  evaluateServerEnvironment({ GCLOUD_PROJECT: "demo-x", APP_ENV: "development", OPENAI_MOCK_MODE: "false", X_API_MOCK_MODE: "true", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8082", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9097", ALLOW_REAL_OPENAI_WITH_EMULATOR: "true", ENABLE_REAL_OPENAI_TESTS: "true" }, "local").ok,
  true,
);
assert.equal(
  evaluateServerEnvironment({ GCLOUD_PROJECT: "x-ai-322c9", APP_ENV: "production", OPENAI_MOCK_MODE: undefined, X_API_MOCK_MODE: undefined }, "production").flags.xApiMock,
  false,
);
assert.equal(
  evaluateServerEnvironment({ GCLOUD_PROJECT: "demo-x", APP_ENV: "development", OPENAI_MOCK_MODE: "false", X_API_MOCK_MODE: "true", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8082", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9097" }, "local").ok,
  false,
);
const preflight = fs.readFileSync(require.resolve("./preflight.cjs"), "utf8");
assert.match(preflight, /writeCounts: \{ firestore: 0, auth: 0, xPosts: 0 \}/);
assert.match(preflight, /allowRealOpenAi/);
assert.doesNotMatch(preflight, /tweet\.create|createTweet|openXReply/);
console.log(JSON.stringify({ ok: true, productionMockRejected: true, localProductionProjectRejected: true, nonDemoWritesRejected: true, defaultOpenAiCalls: 0, xPosts: 0, productionWrites: 0, xApiMockDefaultFalse: true }));
