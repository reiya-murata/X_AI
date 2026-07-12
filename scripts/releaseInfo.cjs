const { spawnSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");

function runGit(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error || result.status !== 0) return "";
  return String(result.stdout || "").trim();
}

function getReleaseCandidateVersion(env = process.env) {
  return env.RELEASE_CANDIDATE_VERSION || "phase5.0-rc1";
}

function getBuildTimestamp() {
  return new Date().toISOString();
}

function getGitCommitHash() {
  return runGit(["rev-parse", "--short", "HEAD"]) || "unknown";
}

function isWorkingTreeDirty() {
  return runGit(["status", "--porcelain"]) !== "";
}

function getReleaseInfo(env = process.env) {
  const dirty = isWorkingTreeDirty();
  return {
    releaseCandidateVersion: getReleaseCandidateVersion(env),
    gitCommitHash: getGitCommitHash(),
    buildTimestamp: getBuildTimestamp(),
    workingTreeDirty: dirty,
    buildStatus: dirty ? "未確定ビルド" : "確定ビルド",
    unconfirmedItems: [
      "OpenAI実API品質",
      "OpenAI quota",
      "本番Firebase実接続",
      "本番X API候補取得",
      "本番Web Intentでの手動送信1件",
      "本番operationLogs",
      "本番sent_manual記録",
      "本番分析反映",
    ],
  };
}

module.exports = {
  getReleaseInfo,
  getReleaseCandidateVersion,
  getBuildTimestamp,
  getGitCommitHash,
  isWorkingTreeDirty,
};
