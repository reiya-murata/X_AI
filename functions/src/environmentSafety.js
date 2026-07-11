function evaluateServerEnvironment(env = process.env, mode = "local") {
  const projectId = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || env.FIREBASE_PROJECT_ID || "";
  const appEnv = env.APP_ENV || env.FUNCTIONS_ENV || (mode === "production" ? "production" : "development");
  const production = mode === "production" || appEnv === "production";
  const demoProject = projectId.startsWith("demo-");
  const firestoreEmulator = Boolean(env.FIRESTORE_EMULATOR_HOST);
  const authEmulator = Boolean(env.FIREBASE_AUTH_EMULATOR_HOST);
  const openAiMock = env.OPENAI_MOCK_MODE !== "false";
  const xApiMock = env.X_API_MOCK_MODE !== "false";
  const checks = [];
  const add = (id, status, message, action) => checks.push({ id, status, message, action });

  if (production && openAiMock) add("production_mock", "failed", "本番環境でOpenAIモックが有効です。", "OPENAI_MOCK_MODE=falseへ変更してください。");
  if (production && (firestoreEmulator || authEmulator)) add("production_emulator", "failed", "本番環境でFirebase Emulatorが設定されています。", "Emulator host環境変数を削除してください。");
  if (demoProject && !openAiMock) add("demo_real_openai", "failed", "demo projectで実OpenAIが有効です。", "OPENAI_MOCK_MODE=trueへ戻してください。");
  if (demoProject && (!firestoreEmulator || !authEmulator)) add("demo_missing_emulator", "failed", "demo projectでEmulator接続が不足しています。", "AuthとFirestore Emulatorを起動してください。");
  if (!demoProject && (firestoreEmulator || authEmulator)) add("production_project_emulator", "failed", "本番候補projectとEmulator設定が混在しています。", "projectと接続先を揃えてください。");
  if (mode === "local" && !demoProject) add("local_non_demo", "failed", "local preflightはdemo project限定です。", "demo-で始まるproject IDを指定してください。");
  if (mode === "staging" && demoProject) add("staging_demo", "warning", "stagingがdemo projectを参照しています。", "検証目的に合うprojectか確認してください。");

  return {
    ok: !checks.some((check) => check.status === "failed"), mode, appEnv, projectId,
    flags: { production, demoProject, firestoreEmulator, authEmulator, openAiMock, xApiMock, realOpenAiTests: env.ENABLE_REAL_OPENAI_TESTS === "true" },
    checks,
  };
}

function assertDemoWriteEnvironment(env = process.env) {
  const result = evaluateServerEnvironment(env, "local");
  if (!result.ok || !result.flags.demoProject || !result.flags.firestoreEmulator || !result.flags.authEmulator) {
    throw new Error("This write operation is restricted to a demo Firebase Emulator project.");
  }
  return result;
}

function assertRuntimeOperationAllowed(env = process.env) {
  const projectId = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT || env.FIREBASE_PROJECT_ID || "";
  const mode = env.APP_ENV === "production" || env.FUNCTIONS_ENV === "production" ? "production" : projectId.startsWith("demo-") ? "local" : "staging";
  const result = evaluateServerEnvironment(env, mode);
  if (!result.ok) throw new Error(`UNSAFE_RUNTIME_ENVIRONMENT: ${result.checks.map((check) => check.id).join(",")}`);
  return result;
}

module.exports = { evaluateServerEnvironment, assertDemoWriteEnvironment, assertRuntimeOperationAllowed };
