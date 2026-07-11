import fs from "node:fs";
import path from "node:path";
import { qualityFixtures, humanEvaluationTags } from "../src/qualityFixtureData.js";
import { summarizeQualityEvaluations } from "../src/qualityAnalysis.js";
import { formatCategoryLabel } from "../src/qualityLabels.js";
import { getPhase38QualityReportDir, getPhase38QualitySnapshotPath } from "./phase38QualityPaths.js";
const reportMode = getArg("--mode") || "human";
const outDir = getPhase38QualityReportDir();
const snapshotPath = getPhase38QualitySnapshotPath();

fs.mkdirSync(outDir, { recursive: true });

const evaluations = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, "utf8")) : [];
const summary = summarizeQualityEvaluations(evaluations, qualityFixtures, { mode: reportMode, includeLegacyUnknown: false });
const visibleEvaluations = evaluations.filter((item) => {
  if (reportMode === "all") return item.evaluationOrigin !== "legacy_unknown";
  if (reportMode === "test") return ["test_snapshot", "seeded_sample", "automated_test"].includes(item.evaluationOrigin);
  return item.evaluationOrigin === "human_manual";
});

const rows = qualityFixtures.map((fixture) => ({
  fixtureId: fixture.id,
  category: fixture.category,
  sourcePost: fixture.sourcePost,
  shouldReply: fixture.category !== "offtopic" && fixture.expectedClaimLevel !== "none",
  expectedReplyStrategy: fixture.expectedReplyStrategy,
  allowedIdentityAngles: fixture.allowedIdentityAngles,
  mustAvoid: fixture.mustAvoid,
  mockReplies: fixture.mockReplies,
  overallDecision: "pending",
  humanReviewStatus: "pending_human_review",
}));

const report = {
  ok: true,
  mode: reportMode,
  summary: {
    ...summary,
    totalFixtures: rows.length,
    pendingHumanReview: visibleEvaluations.filter((item) => item.overallDecision === "pending" || !item.overallDecision).length,
    categories: [...new Set(rows.map((row) => row.category))],
    tagGroups: {
      good: humanEvaluationTags.good.length,
      bad: humanEvaluationTags.bad.length,
    },
  },
  rows,
  evaluations,
};

fs.writeFileSync(path.join(outDir, `phase38-quality-fixture-report.${reportMode}.json`), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(
  path.join(outDir, `phase38-quality-fixture-report.${reportMode}.md`),
  `# Phase 3.8 品質fixtureレポート\n\n` +
    `- mode: ${reportMode}\n` +
    `- fixtures: ${report.summary.totalFixtures}\n` +
    `- pending_human_review: ${report.summary.pendingHumanReview}\n` +
    `- categories: ${report.summary.categories.join(", ")}\n` +
    `- legacy_unknown: ${report.summary.legacyUnknownCount || 0}（既定集計から除外）\n`,
);

console.log(JSON.stringify({ ok: true, ...summary }, null, 2));
console.log(`集計モード: ${formatMode(reportMode)}`);
console.log(`集計対象: ${reportMode === "human" ? "人間による評価" : reportMode === "test" ? "テスト用スナップショット" : "すべて"}`);
console.log(`評価履歴数: ${visibleEvaluations.length}`);
console.log(`評価済み投稿数: ${new Set(visibleEvaluations.map((item) => item.fixtureId)).size}`);
console.log(`評価済み候補数: ${new Set(visibleEvaluations.map((item) => `${item.fixtureId}:${item.candidateId || item.candidateKey || "A"}`)).size}`);
console.log(`そのまま採用率: ${Number.isFinite(summary.acceptedRate) ? `${(summary.acceptedRate * 100).toFixed(1)}%` : "データ不足"}`);
console.log(`旧データ・出自不明: ${summary.legacyUnknownCount || 0}`);
console.log(`カテゴリ例: ${formatCategoryLabel("ai_workflow")}`);

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function formatMode(mode) {
  if (mode === "human") return "人間による評価";
  if (mode === "test") return "テスト用スナップショット";
  return "すべて";
}
