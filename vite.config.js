import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(new URL(".", import.meta.url).pathname);

function runGit(args) {
  const result = spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  if (result.error || result.status !== 0) return "";
  return String(result.stdout || "").trim();
}

function getReleaseInfo() {
  const dirty = runGit(["status", "--porcelain"]) !== "";
  return {
    releaseCandidateVersion: process.env.RELEASE_CANDIDATE_VERSION || "phase5.3-rc1",
    gitCommitHash: runGit(["rev-parse", "--short", "HEAD"]) || "unknown",
    buildTimestamp: new Date().toISOString(),
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

const buildInfo = getReleaseInfo();

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_RELEASE_CANDIDATE_VERSION": JSON.stringify(buildInfo.releaseCandidateVersion),
    "import.meta.env.VITE_RELEASE_GIT_COMMIT": JSON.stringify(buildInfo.gitCommitHash),
    "import.meta.env.VITE_RELEASE_BUILD_TIMESTAMP": JSON.stringify(buildInfo.buildTimestamp),
    "import.meta.env.VITE_RELEASE_WORKTREE_DIRTY": JSON.stringify(String(buildInfo.workingTreeDirty)),
    "import.meta.env.VITE_RELEASE_BUILD_STATUS": JSON.stringify(buildInfo.buildStatus),
    "import.meta.env.VITE_RELEASE_UNCONFIRMED_ITEMS": JSON.stringify(JSON.stringify(buildInfo.unconfirmedItems)),
  },
});
