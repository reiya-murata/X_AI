const SCHEMA_REGISTRY_VERSION = 1;

const WORKFLOW_STATUSES = Object.freeze([
  "discovered", "queued", "generating", "ready", "needs_review", "edited",
  "intent_opened", "sent_manual", "not_sent", "dismissed", "generation_failed", "archived",
]);

const definitions = Object.freeze({
  candidatePosts: {
    version: 1, required: ["postId"], optional: ["workflowStatus", "statusHistory", "statusUpdatedAt", "latestReplyDraftId", "finalReplyText"],
    enums: { workflowStatus: WORKFLOW_STATUSES }, max: { text: 10000, finalReplyText: 280, statusHistory: 30 },
  },
  replyDrafts: {
    version: 1, required: ["candidatePostId"], optional: ["candidates", "editedText", "isCurrent", "usage", "models"],
    max: { candidates: 3, editedText: 280 },
  },
  operationLogs: {
    version: 2, required: ["actionType", "timestamp"], optional: ["candidatePostId", "replyDraftId", "actorUid", "correlationId", "operationId", "safeMetadata"],
    max: { metadataDepth: 3, metadataKeys: 30, string: 300, array: 20 },
  },
  replyUsageFeedback: { version: 1, required: ["candidatePostId", "feedback"], enums: { feedback: ["adopted", "edited_and_used", "not_used"] } },
  replyOutcomeMetrics: { version: 1, required: ["candidatePostId"], optional: ["likes", "replies", "reposts", "profileVisits", "followed", "inquiryOccurred"] },
  users: { version: 1, required: [], optional: ["email", "role", "createdAt"] },
  identityContext: { version: 1, required: [], optional: ["title", "summary", "status", "claimLevel"] },
  xConnections: { version: 1, required: ["firebaseUid", "status"], optional: ["xUserId", "username", "encryptedAccessToken", "encryptedRefreshToken", "accessTokenExpiresAt"] },
  filterRuleSets: { version: 1, required: ["filterRuleSetId"], optional: ["minimumTextLength", "maxPostAgeHours", "maxAgeHours", "minimumImpressions", "allowedLanguages", "excludeSensitive", "excludedKeywords", "blockedAuthorIds", "version", "updatedAt"] },
  qualityEvaluations: { version: 2, required: ["fixtureId", "candidateId", "overallDecision", "evaluationOrigin"], optional: ["scores", "tags", "evaluatedAt", "sourceType"] },
});

function validateDocument(collection, data = {}) {
  const schema = definitions[collection];
  if (!schema) return { valid: true, errors: [], warnings: [`未登録collection: ${collection}`] };
  const errors = [];
  const warnings = [];
  for (const field of schema.required || []) if (data[field] === undefined || data[field] === null || data[field] === "") errors.push(`${field}: required`);
  if (data.schemaVersion !== undefined && (!Number.isInteger(data.schemaVersion) || data.schemaVersion < 1 || data.schemaVersion > schema.version)) errors.push("schemaVersion: unsupported");
  for (const [field, values] of Object.entries(schema.enums || {})) if (data[field] !== undefined && !values.includes(data[field])) errors.push(`${field}: invalid enum`);
  if (collection === "candidatePosts") {
    if (Array.isArray(data.statusHistory) && data.statusHistory.length > schema.max.statusHistory) errors.push("statusHistory: too many entries");
    if (data.finalReplyText && String(data.finalReplyText).length > schema.max.finalReplyText) errors.push("finalReplyText: too long");
    if (data.workflowStatus === "sent_manual" && !String(data.finalReplyText || "").trim()) errors.push("sent_manual: finalReplyText required");
    if (data.workflowStatus === "intent_opened" && !data.intentOpenedAt) errors.push("intent_opened: intentOpenedAt required");
  }
  if (collection === "replyDrafts" && Array.isArray(data.candidates) && data.candidates.length > schema.max.candidates) errors.push("candidates: too many entries");
  return { valid: errors.length === 0, errors, warnings };
}

module.exports = { SCHEMA_REGISTRY_VERSION, WORKFLOW_STATUSES, definitions, validateDocument };
