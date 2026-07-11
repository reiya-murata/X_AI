const { decryptText, encryptText } = require("../security/tokenEncryption");
const { mapXStatus } = require("./errors");
const { mockTimelinePage, mockConnection } = require("./mockFixtures");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");

const X_API_BASE = "https://api.x.com";
const REQUIRED_SCOPES = ["tweet.read", "users.read", "list.read", "offline.access"];

function isMockMode() {
  return process.env.X_API_MOCK_MODE === "true";
}

async function exchangeCodeForToken({ code, codeVerifier, redirectUri }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    client_id: requireEnv("X_CLIENT_ID"),
  });

  const response = await fetch(`${X_API_BASE}/2/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${requireEnv("X_CLIENT_ID")}:${requireEnv("X_CLIENT_SECRET")}`).toString("base64")}`,
    },
    body,
  });

  if (!response.ok) {
    throw Object.assign(new Error("X_TOKEN_EXCHANGE_FAILED"), { code: "X_TOKEN_EXCHANGE_FAILED", status: response.status });
  }

  return response.json();
}

async function fetchMe(accessToken) {
  if (isMockMode()) {
    return {
      data: {
        id: mockConnection.xUserId,
        username: mockConnection.username,
        name: mockConnection.displayName,
        profile_image_url: mockConnection.profileImageUrl,
      },
    };
  }

  const response = await fetch(`${X_API_BASE}/2/users/me?user.fields=profile_image_url`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw Object.assign(new Error(mapXStatus(response.status)), { code: mapXStatus(response.status), status: response.status });
  }
  return response.json();
}

async function getValidXAccessToken({ db, admin, firebaseUid }) {
  if (isMockMode()) return "mock-access-token";

  const ref = db.collection("xConnections").doc(firebaseUid);
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== "connected") {
    throw Object.assign(new Error("X_NOT_CONNECTED"), { code: "X_NOT_CONNECTED" });
  }

  const data = snap.data();
  const expiresAt = data.accessTokenExpiresAt?.toDate?.() || new Date(0);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return decryptText(data.encryptedAccessToken);
  }

  return refreshAccessToken({ db, admin, firebaseUid, connection: data });
}

async function refreshAccessToken({ db, admin, firebaseUid, connection }) {
  const connectionRef = db.collection("xConnections").doc(firebaseUid);
  const lockOwner = `refresh_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lockUntil = Timestamp.fromDate(new Date(Date.now() + 60 * 1000));

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(connectionRef);
    const latest = snap.data();
    const existingLock = latest?.refreshLockUntil?.toDate?.();
    if (existingLock && existingLock.getTime() > Date.now()) {
      throw Object.assign(new Error("X_TOKEN_REFRESH_FAILED"), { code: "X_TOKEN_REFRESH_FAILED" });
    }
    tx.set(connectionRef, {
      refreshLockUntil: lockUntil,
      refreshLockOwner: lockOwner,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  if (!connection.encryptedRefreshToken) {
    await connectionRef.set({
      status: "refresh_required",
      lastErrorCode: "X_TOKEN_REFRESH_FAILED",
      lastErrorAt: FieldValue.serverTimestamp(),
      refreshLockUntil: null,
      refreshLockOwner: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw Object.assign(new Error("X_TOKEN_REFRESH_FAILED"), { code: "X_TOKEN_REFRESH_FAILED" });
  }

  const refreshToken = decryptText(connection.encryptedRefreshToken);
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: requireEnv("X_CLIENT_ID"),
  });

  const response = await fetch(`${X_API_BASE}/2/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${requireEnv("X_CLIENT_ID")}:${requireEnv("X_CLIENT_SECRET")}`).toString("base64")}`,
    },
    body,
  });

  await logUsage({ db, admin, firebaseUid, endpoint: "token_refresh", success: response.ok, statusCode: response.status });

  if (!response.ok) {
    await connectionRef.set({
      status: "refresh_required",
      lastErrorCode: "X_TOKEN_REFRESH_FAILED",
      lastErrorAt: FieldValue.serverTimestamp(),
      refreshLockUntil: null,
      refreshLockOwner: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw Object.assign(new Error("X_TOKEN_REFRESH_FAILED"), { code: "X_TOKEN_REFRESH_FAILED", status: response.status });
  }

  const token = await response.json();
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 7200) * 1000);
  const update = {
    encryptedAccessToken: encryptText(token.access_token),
    scopes: String(token.scope || "").split(" ").filter(Boolean),
    accessTokenExpiresAt: Timestamp.fromDate(expiresAt),
    lastRefreshedAt: FieldValue.serverTimestamp(),
    refreshLockUntil: null,
    refreshLockOwner: null,
    updatedAt: FieldValue.serverTimestamp(),
    lastErrorCode: null,
  };
  if (token.refresh_token) {
    update.encryptedRefreshToken = encryptText(token.refresh_token);
    update.refreshTokenUpdatedAt = FieldValue.serverTimestamp();
  }
  await connectionRef.set(update, { merge: true });
  return token.access_token;
}

async function fetchHomeTimeline({ accessToken, xUserId, sinceId, paginationToken, maxResults = 100 }) {
  if (isMockMode()) {
    return mockTimelinePage("home_timeline", paginationToken ? 2 : 1);
  }

  const params = timelineParams(maxResults);
  if (sinceId) params.set("since_id", sinceId);
  if (paginationToken) params.set("pagination_token", paginationToken);
  const url = `${X_API_BASE}/2/users/${encodeURIComponent(xUserId)}/timelines/reverse_chronological?${params.toString()}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw Object.assign(new Error(mapXStatus(response.status)), { code: mapXStatus(response.status), status: response.status });
  return response.json();
}

async function fetchListTimeline({ accessToken, listId, sinceId, paginationToken, maxResults = 100 }) {
  if (isMockMode()) {
    return mockTimelinePage("watch_list", paginationToken ? 2 : 1);
  }

  const params = timelineParams(maxResults);
  if (sinceId) params.set("since_id", sinceId);
  if (paginationToken) params.set("pagination_token", paginationToken);
  const url = `${X_API_BASE}/2/lists/${encodeURIComponent(listId)}/tweets?${params.toString()}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) throw Object.assign(new Error(mapXStatus(response.status)), { code: mapXStatus(response.status), status: response.status });
  return response.json();
}

async function logUsage({ db, firebaseUid, runId = null, endpoint, requestCount = 1, fetchedPostCount = 0, fetchedUserCount = 0, fetchedMediaCount = 0, success, statusCode = null, headers = null }) {
  const reset = headers?.get?.("x-rate-limit-reset");
  await db.collection("xApiUsageLogs").add({
    firebaseUid,
    runId,
    endpoint,
    requestCount,
    fetchedPostCount,
    fetchedUserCount,
    fetchedMediaCount,
    success,
    statusCode,
    rateLimitRemaining: Number(headers?.get?.("x-rate-limit-remaining") || "") || null,
    rateLimitResetAt: reset ? Timestamp.fromDate(new Date(Number(reset) * 1000)) : null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function timelineParams(maxResults) {
  return new URLSearchParams({
    max_results: String(maxResults),
    exclude: "replies,retweets",
    "tweet.fields": "id,text,author_id,created_at,lang,public_metrics,referenced_tweets,conversation_id,possibly_sensitive,entities,attachments",
    expansions: "author_id,referenced_tweets.id,referenced_tweets.id.author_id,attachments.media_keys",
    "user.fields": "id,name,username,description,profile_image_url,public_metrics,protected",
    "media.fields": "type,url,preview_image_url,width,height,alt_text,public_metrics",
  });
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

module.exports = {
  REQUIRED_SCOPES,
  isMockMode,
  exchangeCodeForToken,
  fetchMe,
  getValidXAccessToken,
  fetchHomeTimeline,
  fetchListTimeline,
  logUsage,
};
