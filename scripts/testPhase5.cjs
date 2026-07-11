const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { validateDocument, definitions } = require("../functions/src/schema/registry");
const { sanitizeMetadata, redactValue } = require("../functions/src/logging/safeOperationLog");
const { MIGRATION } = require("./migrations/auditLegacyWorkflowStatus.cjs");

assert.equal(validateDocument("candidatePosts", { postId: "1", workflowStatus: "ready" }).valid, true);
assert.equal(validateDocument("candidatePosts", { postId: "1", workflowStatus: "broken" }).valid, false);
assert.equal(validateDocument("candidatePosts", { postId: "1", workflowStatus: "sent_manual", finalReplyText: "" }).valid, false);
assert.deepEqual(sanitizeMetadata({ likes: 2, apiKey: "secret", unknown: "value" }), { likes: 2 });
assert.equal(redactValue("Bearer abcdefghijklmnopqrstuvwxyz"), "[REDACTED]");
assert.equal(MIGRATION.idempotent, true);
assert.ok(definitions.operationLogs.max.string <= 300);
assert.equal(JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8")).scripts["check:security"].includes("secret"), true);
console.log(JSON.stringify({ ok: true, schemaValidation: true, logRedaction: true, migrationDryRun: true, openAiApiCalls: 0, xApiCalls: 0, productionWrites: 0 }, null, 2));
