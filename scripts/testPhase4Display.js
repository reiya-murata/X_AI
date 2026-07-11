import assert from "node:assert/strict";
import fs from "node:fs";
import { formatWorkflowStatus, hasUsableReplyDraft, resolveDisplayedWorkflowStatus } from "../src/phase4Labels.js";

const pastFailureWithDraft = {
  workflowStatus: "generation_failed",
  generationError: "以前の生成処理に失敗しました",
  latestReplyDraftId: "draft-success",
  recommendedReplyText: "再生成後の返信案です。",
  aiDecision: { warnings: [] },
};
assert.equal(hasUsableReplyDraft(pastFailureWithDraft), true);
assert.equal(resolveDisplayedWorkflowStatus(pastFailureWithDraft), "ready");
assert.equal(formatWorkflowStatus(pastFailureWithDraft), "返信案あり");

const failedWithoutDraft = { workflowStatus: "generation_failed", generationError: "生成失敗" };
assert.equal(hasUsableReplyDraft(failedWithoutDraft), false);
assert.equal(formatWorkflowStatus(failedWithoutDraft), "生成失敗");

const mockRegenerationSuccess = { workflowStatus: "generation_failed", aiDecision: { warnings: [] } };
assert.equal(formatWorkflowStatus(mockRegenerationSuccess, { replyDraftId: "mock-draft", adapterOutput: { replyText: "モック生成成功" } }), "返信案あり");

const warningDraft = { workflowStatus: "generation_failed", latestReplyDraftId: "warning-draft", aiDecision: { warnings: ["断定を確認"] } };
assert.equal(formatWorkflowStatus(warningDraft), "要確認");

const mainSource = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
assert.match(mainSource, /candidate-card-compact/);
assert.match(mainSource, /selected-label/);
assert.match(mainSource, /compact=\{Boolean\(selected\)\}/);
assert.match(mainSource, /Web IntentでXを開く/);
assert.match(mainSource, /前の候補/);
assert.match(mainSource, /次の候補/);
assert.match(mainSource, /saveWorkflowReplyDraft/);

console.log(JSON.stringify({ ok: true, pastFailureWithDraft: "ready", failedWithoutDraft: "generation_failed", mockRegeneration: "ready", compactCards: true }));
