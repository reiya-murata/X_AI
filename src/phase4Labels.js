export const workflowStatusLabels = Object.freeze({
  discovered: "未処理", queued: "生成待ち", generating: "生成中", ready: "返信案あり", needs_review: "要確認",
  edited: "編集済み", intent_opened: "X確認中", sent_manual: "送信済み", not_sent: "未送信",
  dismissed: "不採用", generation_failed: "生成失敗", archived: "保管済み",
});
const legacy = { candidate: "discovered", opened: "ready", draft_ready: "ready", manual_review: "needs_review", filtered_out: "dismissed", rejected: "dismissed" };
export function normalizeWorkflowStatus(candidate) { const value = candidate?.workflowStatus || candidate?.status || "discovered"; return workflowStatusLabels[value] ? value : legacy[value] || "discovered"; }
export function hasUsableReplyDraft(candidate, aiState = null) {
  return Boolean(
    candidate?.latestReplyDraftId
    || candidate?.recommendedReplyText?.trim?.()
    || candidate?.finalReplyText?.trim?.()
    || candidate?.replyDrafts?.some?.((draft) => draft?.status !== "superseded" && (draft?.candidates?.length || draft?.editedText))
    || aiState?.replyDraftId,
  );
}
export function hasCurrentGenerationWarnings(candidate, aiState = null) {
  const warnings = candidate?.aiDecision?.warnings || candidate?.aiAssessment?.riskFlags || aiState?.adapterOutput?.warnings || [];
  return Array.isArray(warnings) && warnings.length > 0;
}
export function resolveDisplayedWorkflowStatus(candidate, aiState = null) {
  const stored = normalizeWorkflowStatus(candidate);
  if (["intent_opened", "sent_manual", "not_sent", "dismissed", "archived", "edited"].includes(stored)) return stored;
  if (hasUsableReplyDraft(candidate, aiState)) return hasCurrentGenerationWarnings(candidate, aiState) ? "needs_review" : "ready";
  return stored;
}
export function formatWorkflowStatus(candidate, aiState = null) { return workflowStatusLabels[resolveDisplayedWorkflowStatus(candidate, aiState)]; }
export const feedbackLabels = { adopted: "そのまま使用", edited_and_used: "修正して使用", not_used: "使用しなかった" };
export const notSentReasonLabels = { revise_text: "文面を修正したい", post_too_old: "投稿が古くなった", relationship_concern: "関係性を考えて見送った", already_replied: "すでに別返信をした", other: "その他" };
export const claimLevelLabels = { low: "断定リスク：低", medium: "断定リスク：中", high: "断定リスク：高" };
