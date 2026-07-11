const { getReleaseInfo } = require("./releaseInfo.cjs");
const { evaluateServerEnvironment } = require("../functions/src/environmentSafety");

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
    formatLine("unconfirmedItems", ""),
    unconfirmedItems,
  ].join("\n");
  console.log(output);
}

main();
