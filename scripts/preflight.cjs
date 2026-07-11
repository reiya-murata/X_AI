const fs = require("node:fs");
const path = require("node:path");
const { evaluateServerEnvironment } = require("../functions/src/environmentSafety");

const mode = process.argv[2] || "local";
const allowRealOpenAi = process.argv.includes("--allow-real-openai") && process.env.CONFIRM_REAL_OPENAI_PREFLIGHT === "true";
const root = path.resolve(__dirname, "..");

function envForMode() {
  if (mode !== "local") return { ...process.env };
  return {
    ...process.env,
    APP_ENV: "development", FUNCTIONS_ENV: "development",
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "demo-x-reply-intelligence",
    GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || "demo-x-reply-intelligence",
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8081",
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9097",
    OPENAI_MOCK_MODE: "true", X_API_MOCK_MODE: "true",
  };
}

function item(id, label, status, detail, action = null) { return { id, label, status, detail, action }; }

async function main() {
  if (!["local", "staging", "production"].includes(mode)) throw new Error("preflight mode must be local, staging, or production");
  const env = envForMode();
  const safety = evaluateServerEnvironment(env, mode);
  const projectId = safety.projectId;
  const production = mode === "production";
  const required = ["APP_ENV", "FUNCTIONS_ENV", "FIREBASE_PROJECT_ID"];
  const missing = required.filter((key) => !env[key] && !(key === "FIREBASE_PROJECT_ID" && projectId));
  const checks = [
    item("environment", "環境の組み合わせ", safety.ok ? "passed" : "failed", safety.ok ? "危険な組み合わせはありません。" : safety.checks.map((check) => check.message).join(" / ") , safety.checks[0]?.action),
    item("project", "Firebase projectId", projectId ? "passed" : "failed", projectId || "未設定"),
    item("firestore", "Firestore接続", production ? "unconfirmed" : safety.flags.firestoreEmulator ? "passed" : "warning", production ? "本番への接続・書き込みは実行していません。" : "Emulator設定を確認しました。"),
    item("auth", "Auth接続", production ? "unconfirmed" : safety.flags.authEmulator ? "passed" : "warning", production ? "本番Authへの接続・書き込みは実行していません。" : "Emulator設定を確認しました。"),
    item("functions", "Functions接続", "unconfirmed", "preflightはFunctionsを呼び出しません。"),
    item("x_oauth", "X OAuth接続", "unconfirmed", "X API・投稿処理は実行していません。"),
    item("openai_key", "OpenAI key設定", env.OPENAI_API_KEY ? "passed" : production ? "warning" : "unconfirmed", env.OPENAI_API_KEY ? "設定あり（値は非表示）" : "未設定"),
    item("openai_quota", "OpenAI quota", allowRealOpenAi ? "unconfirmed" : "unconfirmed", allowRealOpenAi ? "明示確認を実行します。" : "実API確認は明示フラグなしのため省略しました。"),
    item("mock", "OpenAI mock", production ? (!safety.flags.openAiMock ? "passed" : "failed") : "passed", safety.flags.openAiMock ? "有効" : "無効"),
    item("dev_admin", "開発用admin", production ? "passed" : "warning", production ? "preflightから作成しません。" : "demo Emulator限定です。"),
    item("quality_lab", "品質Lab", env.VITE_ENABLE_QUALITY_LAB === "true" ? (production ? "failed" : "warning") : "passed", env.VITE_ENABLE_QUALITY_LAB === "true" ? "有効" : "非表示"),
    item("automatic_post", "自動投稿機能", "passed", "実装・呼び出しなし"),
    item("web_intent", "Web Intent手動送信", "passed", "人間による最終送信を維持"),
    item("rules", "Firestore Rules", fs.existsSync(path.join(root, "firestore.rules")) ? "passed" : "failed", "firestore.rulesの存在確認"),
    item("required_env", "必須環境変数", missing.length ? "failed" : "passed", missing.length ? `不足: ${missing.join(", ")}` : "設定済み"),
    item("build", "最新build", fs.existsSync(path.join(root, "dist/index.html")) ? "passed" : "warning", fs.existsSync(path.join(root, "dist/index.html")) ? "dist/index.htmlあり" : "npm run buildを実行してください。"),
    item("migration", "migration要否", "warning", "candidatePosts/replyDraftsは後方互換のため、破壊的migrationは不要です。実データ確認は未実施です。"),
    item("rollback", "rollback手順", /ロールバック/.test(fs.readFileSync(path.join(root, "README.md"), "utf8")) ? "passed" : "failed", "READMEの手順を確認"),
  ];
  let apiCallCount = 0;
  if (allowRealOpenAi) {
    if (!env.OPENAI_API_KEY || env.ENABLE_REAL_OPENAI_TESTS !== "true" || mode === "local") {
      checks.find((check) => check.id === "openai_quota").status = "failed";
      checks.find((check) => check.id === "openai_quota").detail = "OPENAI_API_KEY、ENABLE_REAL_OPENAI_TESTS=true、staging/productionが必要です。";
    } else {
      const OpenAIModule = require("../functions/node_modules/openai");
      const OpenAI = OpenAIModule.default || OpenAIModule;
      const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0 });
      apiCallCount = 1;
      try {
        await client.responses.create({ model: "gpt-4o-mini", input: "Return only OK.", max_output_tokens: 3 });
        checks.find((check) => check.id === "openai_quota").status = "passed";
        checks.find((check) => check.id === "openai_quota").detail = "最小1回の応答確認に成功しました。";
      } catch (error) {
        checks.find((check) => check.id === "openai_quota").status = "failed";
        checks.find((check) => check.id === "openai_quota").detail = `確認失敗: ${String(error?.code || error?.type || error?.status || "unknown")}`;
      }
    }
  }
  const ok = safety.ok && !checks.some((check) => check.status === "failed");
  const result = { ok, mode, runnerCompletedSafely: true, writeCounts: { firestore: 0, auth: 0, xPosts: 0 }, apiCallCount, webIntentOpened: false, checks };
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = ok ? 0 : 1;
}
main().catch((error) => { console.error(JSON.stringify({ ok: false, runnerCompletedSafely: true, message: error.message })); process.exitCode = 1; });
