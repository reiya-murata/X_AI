const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { TRANSITIONS, normalizeCandidateStatus, assertTransition, characterDiff } = require("../src/phase4/workflow");

function main() {
  assert.equal(normalizeCandidateStatus("candidate"), "discovered");
  assert.equal(normalizeCandidateStatus("opened"), "ready");
  assert.equal(normalizeCandidateStatus(null, { aiProcessing: { status: "manual_review" } }), "needs_review");
  assert.doesNotThrow(() => assertTransition("ready", "edited"));
  assert.doesNotThrow(() => assertTransition("intent_opened", "sent_manual"));
  assert.throws(() => assertTransition("discovered", "sent_manual"), /変更できません/);
  assert.throws(() => assertTransition("sent_manual", "generating"), /変更できません/);
  assert.ok(TRANSITIONS.archived.includes("queued"));
  assert.equal(characterDiff("同じ文章", "同じ文章"), 0);
  assert.ok(characterDiff("元の返信", "編集した返信") > 0);

  const workflowSource = fs.readFileSync(path.join(__dirname, "../src/phase4/workflow.js"), "utf8");
  assert.doesNotMatch(workflowSource, /runStructuredOutput|responses\.create|OPENAI_API_KEY|xApiClient|tweet\.create/);
  console.log(JSON.stringify({ ok: true, openAiApiCalls: 0, xApiCalls: 0, automaticPosts: 0, statuses: Object.keys(TRANSITIONS).length }));
}
main();
