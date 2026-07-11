const errorMessages = {
  AUTH_REQUIRED: "ログインが必要です。",
  X_NOT_CONNECTED: "Xとの接続が切れています。再接続してください。",
  X_OAUTH_STATE_INVALID: "X接続の確認情報が一致しません。もう一度接続してください。",
  X_OAUTH_STATE_EXPIRED: "X接続の有効期限が切れました。もう一度接続してください。",
  X_OAUTH_CODE_MISSING: "Xから認可コードが返りませんでした。",
  X_TOKEN_EXCHANGE_FAILED: "Xの認証トークン取得に失敗しました。",
  X_TOKEN_REFRESH_FAILED: "Xとの接続更新に失敗しました。再接続してください。",
  X_RATE_LIMITED: "X APIの利用上限またはクレジットを確認してください。",
  X_API_UNAUTHORIZED: "X APIの認証が無効です。再接続してください。",
  X_API_FORBIDDEN: "X APIの権限が不足しています。",
  X_API_PAYMENT_REQUIRED: "X APIのプランまたはクレジットを確認してください。",
  X_API_SERVER_ERROR: "X API側で一時的なエラーが発生しています。",
  X_TIMELINE_FETCH_FAILED: "ホームタイムライン取得に失敗しました。",
  X_LIST_NOT_CONFIGURED: "監視リストIDが設定されていません。",
  X_LIST_FETCH_FAILED: "監視リスト取得に失敗しました。",
  SYNC_ALREADY_RUNNING: "現在タイムライン取得処理が実行中です。",
  SYNC_SAVE_FAILED: "取得結果の保存に失敗しました。",
  INVALID_RESPONSE: "X APIのレスポンス形式を確認してください。",
  UNKNOWN_ERROR: "不明なエラーが発生しました。",
};

function safeMessage(code) {
  return errorMessages[code] || errorMessages.UNKNOWN_ERROR;
}

function mapXStatus(status) {
  if (status === 401) return "X_API_UNAUTHORIZED";
  if (status === 403) return "X_API_FORBIDDEN";
  if (status === 402) return "X_API_PAYMENT_REQUIRED";
  if (status === 429) return "X_RATE_LIMITED";
  if (status >= 500) return "X_API_SERVER_ERROR";
  return "UNKNOWN_ERROR";
}

module.exports = { safeMessage, mapXStatus };
