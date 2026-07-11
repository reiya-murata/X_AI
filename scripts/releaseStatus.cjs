const { getReleaseInfo } = require("./releaseInfo.cjs");
const { evaluateServerEnvironment } = require("../functions/src/environmentSafety");
const fs = require("node:fs");
const path = require("node:path");

function formatLine(label, value) {
  return `${label}: ${value}`;
}

function main() {
  const releaseInfo = getReleaseInfo();
  const env = process.env;
  const safety = evaluateServerEnvironment(env, env.APP_ENV || env.FUNCTIONS_ENV || "development");
  const projectId = safety.projectId || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || env.FIREBASE_PROJECT_ID || "未設定";
  const emulatorState = [
    `Auth=${safety.flags.authEmulator ? "有効" : "無効"}`,
    `Firestore=${safety.flags.firestoreEmulator ? "有効" : "無効"}`,
    `Functions=${env.FUNCTIONS_EMULATOR_HOST ? "有効" : "無効"}`,
  ].join(" / ");
  const mockState = [
    `OpenAI=${safety.flags.openAiMock ? "Mock" : "Real"}`,
    `X API=${safety.flags.xApiMock ? "Mock" : "Real"}`,
  ].join(" / ");
  const unconfirmedItems = releaseInfo.unconfirmedItems.map((item) => `- ${item}`).join("\n");
  const manifestPath = path.resolve(__dirname, "../dist/release-manifest.json");
  const artifact = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
  const output = [
    "Release Status",
    formatLine("releaseCandidateVersion", releaseInfo.releaseCandidateVersion),
    formatLine("gitCommit", releaseInfo.gitCommitHash),
    formatLine("dirty", releaseInfo.workingTreeDirty ? "true" : "false"),
    formatLine("buildStatus", releaseInfo.buildStatus),
    formatLine("buildTimestamp", releaseInfo.buildTimestamp),
    formatLine("projectId", projectId),
    formatLine("mockState", mockState),
    formatLine("emulatorState", emulatorState),
    formatLine("releaseManifest", artifact ? `確認済み / assets=${Object.keys(artifact.assetFiles || {}).length} / automaticPosting=${artifact.automaticPosting}` : "未生成"),
    formatLine("unconfirmedItems", ""),
    unconfirmedItems,
  ].join("\n");
  console.log(output);
}

main();
