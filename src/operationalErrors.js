const messages = [
  [["insufficient_quota", "exceeded your current quota"], "OpenAI APIの利用枠がありません。課金設定と利用上限を確認するか、ローカルモックへ戻してください。"],
  [["OPENAI_NOT_CONFIGURED", "api key"], "OpenAI APIキーが設定されていません。Functionsの秘密情報設定を確認してください。"],
  [["X_NOT_CONNECTED"], "Xへ接続されていません。X接続画面からOAuthをやり直してください。"],
  [["project", "mismatch"], "Firebase projectが想定と一致しません。本番準備画面でprojectIdを確認してください。"],
  [["emulator"], "Firebase Emulatorの接続設定が不正です。APP_ENVとEmulator hostを確認してください。"],
  [["production", "mock"], "本番環境でモックが有効です。操作を停止し、環境変数を修正してください。"],
  [["permission-denied", "admin"], "管理者権限がありません。Firebase Authのadmin claimを確認してください。"],
  [["firestore", "permission"], "Firestore Rulesにより拒否されました。認証状態とRulesを確認してください。"],
  [["functions", "unavailable"], "Functionsへ接続できません。接続先、リージョン、デプロイ状態を確認してください。"],
];

export function formatOperationalError(error, fallback = "処理に失敗しました。接続状態を確認して再試行してください。") {
  const source = `${error?.code || ""} ${error?.type || ""} ${error?.message || ""}`.toLowerCase();
  for (const [patterns, message] of messages) {
    if (patterns.some((pattern) => source.includes(pattern.toLowerCase()))) return message;
  }
  return fallback;
}
