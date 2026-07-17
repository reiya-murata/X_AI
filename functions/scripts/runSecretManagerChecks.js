const assert = require("node:assert/strict");

const { secretNames } = require("../src/secrets");
const { isOpenAiMockMode, runStructuredOutput } = require("../src/openai/client");
const { exchangeCodeForToken } = require("../src/x/xApiClient");
const { encryptText } = require("../src/security/tokenEncryption");

async function main() {
  assert.equal(secretNames.openAiApiKey, "OPENAI_API_KEY");
  assert.equal(secretNames.xClientId, "X_CLIENT_ID");
  assert.equal(secretNames.xClientSecret, "X_CLIENT_SECRET");
  assert.equal(secretNames.xTokenEncryptionKey, "X_TOKEN_ENCRYPTION_KEY");

  const originalEnv = {
    APP_ENV: process.env.APP_ENV,
    FUNCTIONS_ENV: process.env.FUNCTIONS_ENV,
    OPENAI_MOCK_MODE: process.env.OPENAI_MOCK_MODE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    X_CLIENT_ID: process.env.X_CLIENT_ID,
    X_OAUTH_CLIENT_ID: process.env.X_OAUTH_CLIENT_ID,
    X_CLIENT_SECRET: process.env.X_CLIENT_SECRET,
    X_OAUTH_CLIENT_SECRET: process.env.X_OAUTH_CLIENT_SECRET,
  };

  try {
    delete process.env.OPENAI_API_KEY;
    delete process.env.X_CLIENT_ID;
    delete process.env.X_OAUTH_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    delete process.env.X_OAUTH_CLIENT_SECRET;

    process.env.APP_ENV = "development";
    process.env.FUNCTIONS_ENV = "development";
    process.env.OPENAI_MOCK_MODE = "";

    assert.equal(isOpenAiMockMode(), true);
    const mockResult = await runStructuredOutput({ model: "test", input: "{}", schema: { type: "object", properties: {} }, schemaName: "TestSchema" });
    assert.equal(mockResult.mock, true);

    process.env.APP_ENV = "production";
    process.env.FUNCTIONS_ENV = "production";
    process.env.OPENAI_MOCK_MODE = "false";
    assert.equal(isOpenAiMockMode(), false);
    await assert.rejects(
      runStructuredOutput({ model: "test", input: "{}", schema: { type: "object", properties: {} }, schemaName: "TestSchema" }),
      (error) => error?.code === "OPENAI_NOT_CONFIGURED",
    );
    await assert.rejects(
      Promise.resolve().then(() => encryptText("secret")),
      /X_TOKEN_ENCRYPTION_KEY is required in production\./,
    );

    const originalFetch = global.fetch;
    let fetchCalled = false;
    global.fetch = async () => {
      fetchCalled = true;
      throw new Error("fetch should not be called when X credentials are missing");
    };
    await assert.rejects(
      exchangeCodeForToken({ code: "code", codeVerifier: "verifier", redirectUri: "http://localhost/callback" }),
      /X_CLIENT_ID is required/,
    );
    assert.equal(fetchCalled, false);
    global.fetch = originalFetch;
  } finally {
    Object.assign(process.env, originalEnv);
  }

  console.log(JSON.stringify({ ok: true, secretNames: Object.keys(secretNames), productionOpenAiMock: false }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
