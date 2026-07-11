export function evaluateClientEnvironment(config) {
  const checks = [];
  const add = (id, severity, message, action) => checks.push({ id, severity, message, action });
  const production = config.appEnv === "production";
  const localHost = config.hostname === "localhost" || config.hostname === "127.0.0.1";
  const demoProject = String(config.projectId || "").startsWith("demo-");

  if (production && config.openAiMock) add("production_mock", "error", "本番環境でOpenAIモックが有効です。", "OPENAI_MOCK_MODEをfalseにしてください。");
  if (production && config.emulators) add("production_emulator", "error", "本番環境がFirebase Emulatorへ接続しています。", "Emulator設定を無効にしてください。");
  if (localHost && !demoProject) add("local_production_project", "error", "localhostから本番候補のFirebase projectへ接続しようとしています。", "demo-で始まるローカルprojectへ切り替えてください。");
  if (demoProject && config.realOpenAi) add("demo_real_openai", "error", "demo projectで実OpenAIが有効です。", "ローカルではOPENAI_MOCK_MODE=trueを使用してください。");
  if (!localHost && config.qualityLab) add("remote_quality_lab", "error", "localhost以外で品質Labが有効です。", "VITE_ENABLE_QUALITY_LABをfalseにしてください。");
  if (config.localAutoLogin && (!config.emulators || !demoProject || !localHost)) add("unsafe_dev_admin", "error", "開発用admin自動ログインの安全条件を満たしていません。", "自動ログインを無効にするかdemo Emulatorを使用してください。");
  if (config.emulators && !demoProject) add("emulator_non_demo", "error", "Emulatorがdemo以外のproject IDを使用しています。", "demo-で始まるproject IDへ変更してください。");
  if (!config.emulators && demoProject) add("demo_without_emulator", "error", "demo projectですがEmulatorが無効です。", "Firebase Emulatorを有効にしてください。");
  if (!production && !config.emulators) add("dev_without_emulator", "warning", "開発環境でEmulatorが無効です。", "接続先を確認してから操作してください。");

  return { ok: !checks.some((check) => check.severity === "error"), checks, production, localHost, demoProject };
}

export function buildClientEnvironment(importMetaEnv, hostname) {
  const projectId = importMetaEnv.VITE_FIREBASE_PROJECT_ID || (importMetaEnv.VITE_USE_FIREBASE_EMULATORS === "true" ? "demo-x-reply-intelligence" : "x-reply-intelligence");
  const openAiMock = importMetaEnv.VITE_OPENAI_MOCK_MODE !== "false";
  return {
    appEnv: importMetaEnv.VITE_APP_ENV || importMetaEnv.MODE || "development",
    functionsEnv: importMetaEnv.VITE_FUNCTIONS_ENV || "development",
    projectId,
    emulators: importMetaEnv.VITE_USE_FIREBASE_EMULATORS === "true",
    openAiMock,
    realOpenAi: !openAiMock,
    realOpenAiTests: importMetaEnv.VITE_ENABLE_REAL_OPENAI_TESTS === "true",
    qualityLab: importMetaEnv.VITE_ENABLE_QUALITY_LAB === "true",
    xApiMock: importMetaEnv.VITE_USE_X_API_MOCK !== "false",
    localAutoLogin: importMetaEnv.VITE_LOCAL_AUTO_LOGIN === "true",
    hostname,
  };
}
