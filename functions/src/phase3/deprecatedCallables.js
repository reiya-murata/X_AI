const { HttpsError } = require("firebase-functions/v2/https");

function deprecatedAiCallable(name) {
  return async function deprecatedCallable() {
    throw new HttpsError("failed-precondition", "このAI処理は廃止されました。processCandidateWithAiを使用してください。", {
      callable: name,
      status: "deprecated",
    });
  };
}

module.exports = { deprecatedAiCallable };
