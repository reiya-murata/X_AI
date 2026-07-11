import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { buildHumanEditDiff, summarizeQualityEvaluations } from "../src/qualityAnalysis.js";
import { qualityFixtures } from "../src/qualityFixtureData.js";
import { saveHumanEvaluation } from "../functions/src/phase3/humanEvaluationStore.js";
import { getPhase38QualitySnapshotPath } from "./phase38QualityPaths.js";

const snapshotPath = getPhase38QualitySnapshotPath();
fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });

async function main() {
  const fakeDb = createFakeDb();
  const base = {
    fixtureId: "fixture-ai-workflow-001",
    candidateId: "A",
    candidateKey: "A",
    originalReplyText: "それ、かなり本質だと思います。AIそのものより、誰が更新して改善に戻すかまで決めて初めて回りやすいですよね。",
    humanEditedText: "それ、かなり本質だと思います。AIよりも更新担当と改善の戻り方を先に決めるのが大事ですよね。",
    overallDecision: "accepted_with_edit",
    scores: { originalPostRelevance: 4, reiyaSpecificity: 5 },
    goodTags: ["元投稿への理解が深い", "一段深い補足がある"],
    badTags: [],
    evaluatorNotes: "差分を少し詰めた。",
    sourceType: "fixture",
    evaluationOrigin: "test_snapshot",
    generationVersion: "mock",
    promptVersion: "v1",
    contextSelectorVersion: "v1",
    codeCheckVersion: "v1",
    feedbackTags: ["元投稿への理解が深い", "一段深い補足がある"],
  };

  const first = await saveHumanEvaluation({ db: fakeDb, admin: {}, data: base, evaluationOrigin: "test_snapshot" });
  const duplicate = await saveHumanEvaluation({ db: fakeDb, admin: {}, data: base, evaluationOrigin: "test_snapshot" });
  const second = await saveHumanEvaluation({ db: fakeDb, admin: {}, data: { ...base, humanEditedText: `${base.humanEditedText} もう少し短く。` }, evaluationOrigin: "test_snapshot" });

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(second.duplicate, false);

  const evaluations = [...fakeDb.collections.replyDraftHumanEvaluations.values()].sort((a, b) => new Date(a.evaluatedAt || a.createdAt || 0).getTime() - new Date(b.evaluatedAt || b.createdAt || 0).getTime());
  assert.equal(evaluations.length, 2);
  assert.equal(evaluations[0].evaluationOrigin, "test_snapshot");
  assert.equal(evaluations[1].evaluationOrigin, "test_snapshot");
  const fingerprints = [...fakeDb.collections.replyDraftHumanEvaluationFingerprints.values()];
  assert.ok(fingerprints.every((item) => item.evaluationOrigin === "test_snapshot"));

  const diffAdd = buildHumanEditDiff("短い文です。", "短い文です。追加します。");
  const diffRemove = buildHumanEditDiff("一文目です。二文目です。", "一文目です。");
  const diffFull = buildHumanEditDiff("元文です。", "全面的に書き換えました。");
  const diffEmpty = buildHumanEditDiff("元文です。", "");

  assert.ok(diffAdd.addedText.includes("追加します"));
  assert.ok(diffRemove.removedText.includes("二文目です"));
  assert.ok(diffFull.changedChars > 0);
  assert.ok(diffEmpty.isEmptyEdit);

  const summary = summarizeQualityEvaluations(
    [
      {
        fixtureId: "fixture-ai-workflow-001",
        candidateId: "A",
        overallDecision: "accepted",
        scores: { originalPostRelevance: 4, reiyaSpecificity: 5, naturalJapanese: 4 },
        goodTags: ["元投稿への理解が深い"],
        badTags: ["一般論すぎる"],
        sourceType: "fixture",
        evaluationOrigin: "test_snapshot",
        generationVersion: "mock",
        promptVersion: "v1",
        contextSelectorVersion: "v1",
        codeCheckVersion: "v1",
        changeSummary: { changedChars: 0 },
      },
      {
        fixtureId: "fixture-ai-workflow-001",
        candidateId: "B",
        overallDecision: "accepted_with_edit",
        scores: { originalPostRelevance: 3, reiyaSpecificity: 4, naturalJapanese: 3 },
        goodTags: ["一段深い補足がある"],
        badTags: ["長すぎる"],
        sourceType: "mock",
        evaluationOrigin: "test_snapshot",
        generationVersion: "mock",
        promptVersion: "v1",
        contextSelectorVersion: "v1",
        codeCheckVersion: "v1",
        changeSummary: { changedChars: 7 },
      },
      {
        fixtureId: "fixture-store-meo-003",
        candidateId: "C",
        overallDecision: "rejected",
        scores: { originalPostRelevance: 2, reiyaSpecificity: 2, naturalJapanese: 2 },
        goodTags: [],
        badTags: ["関係ないAI接続"],
        sourceType: "production_manual",
        evaluationOrigin: "legacy_unknown",
        generationVersion: "gpt-4o-mini",
        promptVersion: "v2",
        contextSelectorVersion: "v2",
        codeCheckVersion: "v2",
        changeSummary: { changedChars: 12 },
      },
    ],
    qualityFixtures,
    { mode: "all", includeLegacyUnknown: true },
  );

  fs.writeFileSync(snapshotPath, `${JSON.stringify(evaluations, null, 2)}\n`);

  console.log(JSON.stringify({
    ok: true,
    historyCount: evaluations.length,
    duplicateBlocked: duplicate.duplicate,
    diffChecks: {
      add: diffAdd.addedText,
      remove: diffRemove.removedText,
      full: diffFull.summary,
      empty: diffEmpty.summary,
    },
    summary: {
      evaluatedCount: summary.evaluatedCount,
      acceptedRate: summary.acceptedRate,
      acceptedWithEditRate: summary.acceptedWithEditRate,
      rejectedRate: summary.rejectedRate,
      candidateA: summary.byCandidate.A,
      categoryAiWorkflow: summary.byCategory.ai_workflow,
      versionCount: Object.keys(summary.byVersion).length,
      sourceTypeSummary: [...new Set(evaluations.map((item) => item.sourceType))],
    },
  }, null, 2));
}

function createFakeDb() {
  const collections = {
    replyDraftHumanEvaluations: new Map(),
    replyDraftHumanEvaluationFingerprints: new Map(),
  };
  return {
    collections,
    collection(name) {
      if (!collections[name]) collections[name] = new Map();
      return {
        doc(id = randomId()) {
          const store = collections[name];
          return {
            id,
            _collectionName: name,
            async get() {
              return { exists: store.has(id), data: () => store.get(id) };
            },
            async set(data) {
              store.set(id, { ...(store.get(id) || {}), ...clone(data) });
            },
            ref: { id, _collectionName: name, set: async (data) => store.set(id, { ...(store.get(id) || {}), ...clone(data) }) },
          };
        },
        async add(data) {
          const id = randomId();
          collections[name].set(id, clone(data));
          return { id, set: async () => {} };
        },
      };
    },
    async runTransaction(fn) {
      const tx = {
        async get(docRef) {
          const store = collections[docRef._collectionName];
          const data = store?.get(docRef.id);
          return { exists: Boolean(data), data: () => data };
        },
        set(docRef, data) {
          const target = collections[docRef._collectionName];
          target.set(docRef.id, { ...(target.get(docRef.id) || {}), ...clone(data) });
        },
      };
      await fn(tx);
    },
  };
}

function randomId() {
  return Math.random().toString(36).slice(2, 12);
}

function clone(value) {
  return value;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
