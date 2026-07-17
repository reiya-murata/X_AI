const OpenAI = require("openai");
const { zodTextFormat } = require("openai/helpers/zod");
const { normalizeOpenAiError, OpenAiErrorCode } = require("../phase3/errors");

let cachedClient = null;

function getOpenAiClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}

function isOpenAiMockMode() {
  if (process.env.OPENAI_MOCK_MODE === "true") return true;
  const production = process.env.APP_ENV === "production" || process.env.FUNCTIONS_ENV === "production";
  if (production) return false;
  return !process.env.OPENAI_API_KEY;
}

async function runStructuredOutput({ model, input, schema, schemaName, timeoutMs = 30_000 }) {
  if (isOpenAiMockMode()) {
    return { output_parsed: null, response: null, mock: true, errorCode: OpenAiErrorCode.OPENAI_NOT_CONFIGURED };
  }
  const client = module.exports.getOpenAiClient();
  if (!client) {
    throw Object.assign(new Error("OPENAI_NOT_CONFIGURED"), { code: OpenAiErrorCode.OPENAI_NOT_CONFIGURED });
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await retryOpenAi(async () => client.responses.create({
      model,
      input,
      text: {
        format: zodTextFormat(schema, schemaName),
      },
    }, { signal: controller.signal }));
    const outputParsed = response.output_parsed
      ?? response.output?.[0]?.content?.[0]?.parsed
      ?? parseJsonOutput(response.output_text)
      ?? parseJsonOutput(response.output?.[0]?.content?.[0]?.text)
      ?? null;
    return {
      response,
      output_parsed: outputParsed,
      inputTokens: response.usage?.input_tokens ?? response.usage?.inputTokens ?? null,
      outputTokens: response.usage?.output_tokens ?? response.usage?.outputTokens ?? null,
      totalTokens: response.usage?.total_tokens ?? response.usage?.totalTokens ?? null,
      responseId: response.id || null,
      openAiRequestId: response._request_id || response.request_id || null,
      mock: false,
    };
  } catch (error) {
    throw normalizeOpenAiException(error);
  } finally {
    clearTimeout(timeout);
  }
}

async function runModeration({ model, input, timeoutMs = 15_000 }) {
  if (isOpenAiMockMode()) {
    return {
      id: "mock-moderation",
      model,
      flagged: false,
      categories: {},
      category_scores: {},
    };
  }
  const client = module.exports.getOpenAiClient();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await retryOpenAi(async () => client.moderations.create({ model, input }, { signal: controller.signal }));
    return {
      ...response,
      requestId: response._request_id || response.request_id || null,
    };
  } catch (error) {
    throw normalizeOpenAiException(error);
  } finally {
    clearTimeout(timeout);
  }
}

async function retryOpenAi(fn, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fn(attempt);
      if (response && typeof response === "object") {
        response.__attemptCount = attempt;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (lastError && typeof lastError === "object") {
        lastError.__attemptCount = attempt;
      }
      const status = error?.status || error?.response?.status;
      const retry429 = shouldRetry429(error);
      const retryable = error?.name === "AbortError" || (typeof status === "number" && status >= 500) || /fetch failed|network|ECONNRESET|ETIMEDOUT/i.test(error?.message || "") || retry429;
      const effectiveMaxAttempts = retry429 ? Math.min(maxAttempts, 2) : maxAttempts;
      if (!retryable || attempt === effectiveMaxAttempts) break;
      const delayMs = getRetryDelayMs(error, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  if (lastError && typeof lastError === "object") {
    lastError.__attemptCount = lastError.__attemptCount || maxAttempts;
  }
  throw lastError;
}

function shouldRetry429(error) {
  const status = error?.status || error?.response?.status;
  if (status !== 429) return false;
  return classifyOpenAi429(error) === "rate_limit_exceeded";
}

function getRetryDelayMs(error, attempt) {
  const retryAfter = getRetryAfterMs(error);
  if (retryAfter != null) return retryAfter;
  return 250 * attempt;
}

function getRetryAfterMs(error) {
  const headers = error?.headers || error?.response?.headers;
  const retryAfter = headers?.get?.("retry-after") || headers?.["retry-after"] || headers?.Retry_After || headers?.retryAfter;
  if (!retryAfter) return null;
  const numeric = Number(retryAfter);
  if (Number.isFinite(numeric)) return Math.max(0, Math.round(numeric * 1000));
  const date = Date.parse(retryAfter);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function classifyOpenAi429(error) {
  const evidence = collectOpenAiErrorEvidence(error);
  const message = evidence.sanitizedMessage;
  const code = normalizeString(evidence.code);
  const type = normalizeString(evidence.type);
  if (code === "insufficient_quota" || type === "insufficient_quota" || /exceeded your current quota|insufficient quota|quota exceeded/i.test(message)) return "insufficient_quota";
  if (code === "billing_hard_limit_reached" || type === "billing_hard_limit_reached" || /check your plan and billing details|billing|hard limit|monthly budget/i.test(message)) return "billing_hard_limit_reached";
  if (code === "project_limit" || code === "account_limit" || code === "project_account_usage_limit" || type === "project_limit" || type === "account_limit" || /project.*limit|account.*limit|usage limit/i.test(message)) return "project_account_usage_limit";
  if (code === "rate_limit_exceeded" || type === "rate_limit_exceeded" || /rate limit reached|rate limit|requests per min|tokens per min|rpm|tpm/i.test(message)) return "rate_limit_exceeded";
  return "unknown_429";
}

function normalizeOpenAiException(error) {
  const evidence = collectOpenAiErrorEvidence(error);
  const status = evidence.status;
  const requestId = evidence.requestId;
  const type = evidence.type;
  const code = evidence.code;
  const message = evidence.sanitizedMessage;
  const category = status === 429 ? classifyOpenAi429(error) : null;
  return Object.assign(error, {
    code: normalizeOpenAiError(error),
    status,
    requestId,
    type,
    errorCode: code,
    safeMessage: message,
    category,
  });
}

function collectOpenAiErrorEvidence(error) {
  const responseHeaders = error?.response?.headers || {};
  const headers = normalizeHeaders(responseHeaders);
  const status = error?.status || error?.response?.status || null;
  const requestId = error?.request_id
    || error?.requestID
    || error?.requestId
    || error?._request_id
    || error?.response?.request_id
    || headers["x-request-id"]
    || null;
  const type = error?.type || error?.error?.type || error?.response?.data?.error?.type || null;
  const code = error?.code || error?.error?.code || error?.response?.data?.error?.code || null;
  const rawMessage = error?.message || error?.error?.message || error?.response?.data?.error?.message || "";
  const sanitizedMessage = sanitizeOpenAiMessage(rawMessage);
  const retryAfter = getRetryAfterMs(error);
  const rateLimitHeaders = pickRateLimitHeaders(headers);
  return { status, requestId, type, code, rawMessage, sanitizedMessage, retryAfter, rateLimitHeaders, headers };
}

function normalizeHeaders(headers) {
  if (!headers) return {};
  if (typeof headers.entries === "function") {
    return Object.fromEntries(headers.entries());
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value]));
}

function pickRateLimitHeaders(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (!String(key).toLowerCase().startsWith("x-ratelimit-")) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) result[key.toLowerCase()] = numeric;
  }
  return result;
}

function normalizeString(value) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeOpenAiMessage(message) {
  return String(message || "")
    .replace(/OPENAI_API_KEY/gi, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "[redacted]")
    .replace(/Authorization:\s*[^\s]+/gi, "Authorization: [redacted]")
    .slice(0, 240);
}

function parseJsonOutput(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

module.exports = { getOpenAiClient, isOpenAiMockMode, runStructuredOutput, runModeration, classifyOpenAi429, normalizeOpenAiException, sanitizeOpenAiMessage, getRetryAfterMs, retryOpenAi, collectOpenAiErrorEvidence };
