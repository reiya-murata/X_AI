const OpenAiErrorCode = {
  OPENAI_NOT_CONFIGURED: "OPENAI_NOT_CONFIGURED",
  OPENAI_RATE_LIMITED: "OPENAI_RATE_LIMITED",
  OPENAI_TIMEOUT: "OPENAI_TIMEOUT",
  OPENAI_REFUSAL: "OPENAI_REFUSAL",
  OPENAI_SCHEMA_INVALID: "OPENAI_SCHEMA_INVALID",
  OPENAI_OUTPUT_INCOMPLETE: "OPENAI_OUTPUT_INCOMPLETE",
  OPENAI_MODERATION_FAILED: "OPENAI_MODERATION_FAILED",
  OPENAI_SERVER_ERROR: "OPENAI_SERVER_ERROR",
  OPENAI_REQUEST_FAILED: "OPENAI_REQUEST_FAILED",
  AI_CONTEXT_INVALID: "AI_CONTEXT_INVALID",
  AI_NO_ELIGIBLE_CONTEXT: "AI_NO_ELIGIBLE_CONTEXT",
  AI_JUDGE_REJECTED: "AI_JUDGE_REJECTED",
  AI_PROCESSING_LOCKED: "AI_PROCESSING_LOCKED",
  AI_DAILY_LIMIT_REACHED: "AI_DAILY_LIMIT_REACHED",
  UNKNOWN_AI_ERROR: "UNKNOWN_AI_ERROR",
};

function normalizeOpenAiError(error) {
  const status = error?.status || error?.response?.status;
  if (!process.env.OPENAI_API_KEY && process.env.OPENAI_MOCK_MODE !== "true") {
    return OpenAiErrorCode.OPENAI_NOT_CONFIGURED;
  }
  if (error?.name === "AbortError" || /timeout/i.test(error?.message || "")) return OpenAiErrorCode.OPENAI_TIMEOUT;
  if (status === 429) return OpenAiErrorCode.OPENAI_RATE_LIMITED;
  if (status === 400) return OpenAiErrorCode.OPENAI_SCHEMA_INVALID;
  if (status === 401 || status === 403) return OpenAiErrorCode.OPENAI_REQUEST_FAILED;
  if (status >= 500) return OpenAiErrorCode.OPENAI_SERVER_ERROR;
  if (/refusal/i.test(error?.message || "")) return OpenAiErrorCode.OPENAI_REFUSAL;
  return OpenAiErrorCode.UNKNOWN_AI_ERROR;
}

module.exports = { OpenAiErrorCode, normalizeOpenAiError };
