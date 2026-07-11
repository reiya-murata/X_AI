const { FieldValue } = require("firebase-admin/firestore");

const LOG_VERSION = 2;
const RETENTION_DAYS = 90;
const ALLOWED_ACTIONS = new Set([
  "candidate_fetched", "draft_generated", "draft_edited", "reply_edited", "web_intent_opened", "manual_send_recorded",
  "not_sent_recorded", "outcome_recorded", "usage_feedback_saved", "status_changed", "preflight_run", "environment_rejected",
  "backup_created", "restore_tested", "migration_dry_run",
]);
const ALLOWED_METADATA = new Set(["feedback", "notSentReason", "replyDraftId", "likes", "replies", "reposts", "from", "to", "duplicate", "errorCategory", "retryable", "documentCount", "collectionCount", "migrationId"]);
const SECRET_KEY = /(authorization|api.?key|access.?token|refresh.?token|oauth|cookie|password|secret|private.?key|prompt|body|text|email)/i;
const SECRET_VALUE = /(bearer\s+[a-z0-9._-]+|sk-[a-z0-9_-]{12,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;

function redactValue(value, depth = 0) {
  if (depth > 3) return "[TRUNCATED]";
  if (typeof value === "string") return SECRET_VALUE.test(value) ? "[REDACTED]" : value.slice(0, 300);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactValue(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : redactValue(item, depth + 1)]));
  return String(value || "").slice(0, 300);
}

function sanitizeMetadata(metadata = {}) {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => ALLOWED_METADATA.has(key) && !SECRET_KEY.test(key)).map(([key, value]) => [key, redactValue(value)]));
}

async function writeSafeOperationLog({ db, actorUid, actionType, candidatePostId = null, replyDraftId = null, correlationId = null, operationId = null, safeMetadata = {} }) {
  const normalizedAction = String(actionType || "").startsWith("status_") ? "status_changed" : actionType;
  if (!ALLOWED_ACTIONS.has(normalizedAction)) throw new Error("operation log action is not allowed");
  const payload = { schemaVersion: LOG_VERSION, actionType: normalizedAction, candidatePostId, replyDraftId, actorUid: actorUid || null, correlationId: safeId(correlationId), operationId: safeId(operationId), safeMetadata: sanitizeMetadata({ ...safeMetadata, ...(String(actionType).startsWith("status_") ? { to: String(actionType).slice(7) } : {}) }), retentionDays: RETENTION_DAYS, timestamp: FieldValue.serverTimestamp() };
  const ref = operationId ? db.collection("operationLogs").doc(`op_${safeId(operationId)}`) : db.collection("operationLogs").doc();
  await ref.set(payload, { merge: false });
  return ref.id;
}

function safeId(value) { return value ? String(value).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || null : null; }

module.exports = { LOG_VERSION, RETENTION_DAYS, sanitizeMetadata, redactValue, writeSafeOperationLog };
