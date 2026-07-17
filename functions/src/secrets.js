const { defineSecret } = require("firebase-functions/params");

const secretNames = Object.freeze({
  openAiApiKey: "OPENAI_API_KEY",
  xClientId: "X_CLIENT_ID",
  xClientSecret: "X_CLIENT_SECRET",
  xTokenEncryptionKey: "X_TOKEN_ENCRYPTION_KEY",
});

const openAiApiKey = defineSecret(secretNames.openAiApiKey);
const xClientId = defineSecret(secretNames.xClientId);
const xClientSecret = defineSecret(secretNames.xClientSecret);
const xTokenEncryptionKey = defineSecret(secretNames.xTokenEncryptionKey);

const secretBindings = Object.freeze({
  openAi: Object.freeze([openAiApiKey]),
  xOAuthStart: Object.freeze([xClientId]),
  xOAuthCallback: Object.freeze([xClientId, xClientSecret, xTokenEncryptionKey]),
  xApi: Object.freeze([xClientId, xClientSecret, xTokenEncryptionKey]),
  xTokenEncryption: Object.freeze([xTokenEncryptionKey]),
});

function withSecrets(...secrets) {
  return { region: "asia-northeast1", secrets };
}

module.exports = {
  secretNames,
  openAiApiKey,
  xClientId,
  xClientSecret,
  xTokenEncryptionKey,
  secretBindings,
  withSecrets,
};
