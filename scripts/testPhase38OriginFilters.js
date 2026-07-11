import assert from "node:assert/strict";
import { filterQualityEvaluations, summarizeQualityEvaluations } from "../src/qualityAnalysis.js";

const evaluations = [
  { fixtureId: "f1", candidateId: "A", overallDecision: "accepted", evaluationOrigin: "human_manual", scores: { a: 4 } },
  { fixtureId: "f1", candidateId: "B", overallDecision: "accepted_with_edit", evaluationOrigin: "test_snapshot", scores: { a: 3 } },
  { fixtureId: "f2", candidateId: "C", overallDecision: "rejected", evaluationOrigin: "seeded_sample", scores: { a: 2 } },
  { fixtureId: "f3", candidateId: "A", overallDecision: "pending", evaluationOrigin: "automated_test", scores: { a: 1 } },
  { fixtureId: "f4", candidateId: "B", overallDecision: "accepted", scores: { a: 5 } },
];

const human = filterQualityEvaluations(evaluations, "human");
const test = filterQualityEvaluations(evaluations, "test");
const all = filterQualityEvaluations(evaluations, "all");

assert.equal(human.length, 1);
assert.equal(test.length, 3);
assert.equal(all.length, 4);
assert.ok(all.every((item) => item.evaluationOrigin !== "legacy_unknown"));
assert.equal(summarizeQualityEvaluations(evaluations, [], { mode: "human" }).totalEvaluations, 1);
assert.equal(summarizeQualityEvaluations(evaluations, [], { mode: "test" }).totalEvaluations, 3);
assert.equal(summarizeQualityEvaluations(evaluations, [], { mode: "all" }).legacyUnknownCount, 1);

console.log(JSON.stringify({
  ok: true,
  humanCount: human.length,
  testCount: test.length,
  allCount: all.length,
}, null, 2));
