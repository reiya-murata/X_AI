const { getDb } = require("./phase5Firebase.cjs");
const { validateDocument, WORKFLOW_STATUSES } = require("../functions/src/schema/registry");
const { sanitizeMetadata } = require("../functions/src/logging/safeOperationLog");

async function auditData({ previewFixes = false } = {}) {
  const db = getDb();
  const [candidates, drafts, logs] = await Promise.all(["candidatePosts", "replyDrafts", "operationLogs"].map((name) => db.collection(name).get()));
  const draftRows = drafts.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const candidateIds = new Set(candidates.docs.map((doc) => doc.id));
  const findings = [];
  for (const doc of candidates.docs) {
    const row = doc.data();
    const validation = validateDocument("candidatePosts", row);
    for (const issue of validation.errors) findings.push(finding("candidatePosts", doc.id, "schema", issue));
    if (row.workflowStatus && !WORKFLOW_STATUSES.includes(row.workflowStatus)) findings.push(finding("candidatePosts", doc.id, "invalid_status", row.workflowStatus));
    if (row.workflowStatus && !row.statusUpdatedAt) findings.push(finding("candidatePosts", doc.id, "missing_status_timestamp", "statusUpdatedAt"));
    if (row.latestReplyDraftId && !draftRows.some((draft) => draft.id === row.latestReplyDraftId)) findings.push(finding("candidatePosts", doc.id, "missing_draft_reference", row.latestReplyDraftId));
    const usable = draftRows.filter((draft) => draft.candidatePostId === doc.id && draft.isCurrent !== false && (draft.editedText || draft.candidates?.length));
    if (usable.length > 1) findings.push(finding("candidatePosts", doc.id, "duplicate_active_draft", String(usable.length)));
    if (usable.length && ["discovered", "generation_failed"].includes(row.workflowStatus)) findings.push(finding("candidatePosts", doc.id, "draft_status_mismatch", row.workflowStatus));
  }
  for (const draft of draftRows) {
    const validation = validateDocument("replyDrafts", draft);
    for (const issue of validation.errors) findings.push(finding("replyDrafts", draft.id, "schema", issue));
    if (!candidateIds.has(draft.candidatePostId)) findings.push(finding("replyDrafts", draft.id, "missing_candidate_reference", draft.candidatePostId));
  }
  for (const doc of logs.docs) {
    const row = doc.data();
    if (JSON.stringify(row.safeMetadata || {}) !== JSON.stringify(sanitizeMetadata(row.safeMetadata || {}))) findings.push(finding("operationLogs", doc.id, "unsafe_metadata", "許可外または秘密情報候補"));
  }
  const result = { ok: findings.length === 0, scanned: { candidatePosts: candidates.size, replyDrafts: drafts.size, operationLogs: logs.size }, findings, fixPreview: previewFixes ? findings.map((item) => ({ ...item, proposedAction: propose(item.type) })) : [] };
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function finding(collection, id, type, detail) { return { collection, id, type, detail: String(detail).slice(0, 160) }; }
function propose(type) { return ({ missing_status_timestamp: "statusUpdatedAtを補完", draft_status_mismatch: "利用可能draftに合わせてstatusを確認", duplicate_active_draft: "最新draft以外をsuperseded候補にする" })[type] || "人間が内容を確認"; }

if (require.main === module) auditData({ previewFixes: process.argv.includes("--fix-preview") }).then((result) => { if (!result.ok && !process.argv.includes("--allow-findings")) process.exitCode = 1; }).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { auditData };
