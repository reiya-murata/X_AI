const { HttpsError } = require("firebase-functions/v2/https");

function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "ログインが必要です。");
  }
  if (request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "管理者権限が必要です。");
  }
  return {
    uid: request.auth.uid,
    token: request.auth.token,
  };
}

module.exports = { requireAdmin };
