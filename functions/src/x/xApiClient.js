const { decryptText, encryptText } = require("../security/tokenEncryption");
const { mapXStatus } = require("./errors");
const { mockTimelinePage, mockConnection } = require("./mockFixtures");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");

const X_API_BASE = "https://api.x.com";
const REQUIRED_SCOPES = ["tweet.read", "users.read", "list.read", "offline.access"];

function isMockMode() {
  return process.env.X_API_MOCK_MODE === "true";
}

function requireXEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  throw new Error(`${names[0]} is required`);
}

async function readSafeOAuthError(response) {
  const text = await response.clone().text().catch(() => "");
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  return {
    status: response.status,
    error: parsed.error || null,
    error_description: parsed.error_description || null,
    error_uri: parsed.error_uri || null,
  };
}

async function exchangeCodeForToken({ code, codeVerifier, redirectUri }) {
  console.log("xApiClient:exchangeCodeForToken:start", {
    redirectUri,
    hasClientId: Boolean(requireXEnv("X_CLIENT_ID", "X_OAUTH_CLIENT_ID")),
    hasClientSecret: Boolean(requireXEnv("X_CLIENT_SECRET", "X_OAUTH_CLIENT_SECRET")),
  });
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(`${X_API_BASE}/2/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${requireXEnv("X_CLIENT_ID", "X_OAUTH_CLIENT_ID")}:${requireXEnv("X_CLIENT_SECRET", "X_OAUTH_CLIENT_SECRET")}`).toString("base64")}`,
    },
    body,
  });

  if (!response.ok) {
    console.error("xApiClient:exchangeCodeForToken:failed", await readSafeOAuthError(response));
    throw Object.assign(new Error("X_TOKEN_EXCHANGE_FAILED"), { code: "X_TOKEN_EXCHANGE_FAILED", status: response.status });
  }

  console.log("xApiClient:exchangeCodeForToken:success", { status: response.status });
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
    console.error("xApiClient:fetchMe:failed", { status: response.status });
    throw Object.assign(new Error(mapXStatus(response.status)), { code: mapXStatus(response.status), status: response.status });
  }
  console.log("xApiClient:fetchMe:success", { status: response.status });
  return response.json();
}

async function getValidXAccessToken({ db, admin, firebaseUid, forceRefresh = false }) {
  if (isMockMode()) return "mock-access-token";

  const ref = db.collection("xConnections").doc(firebaseUid);
  const snap = await ref.get();
  if (!snap.exists || snap.data().status !== "connected") {
    throw Object.assign(new Error("X_NOT_CONNECTED"), { code: "X_NOT_CONNECTED" });
  }

  const data = snap.data();
  const expiresAt = data.accessTokenExpiresAt?.toDate?.() || new Date(0);
  if (!forceRefresh && expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return decryptText(data.encryptedAccessToken);
  }

  return refreshAccessToken({ db, admin, firebaseUid, connection: data });
}

async function refreshAccessToken({ db, admin, firebaseUid, connection }) {
  console.log("xApiClient:refreshAccessToken:start", {
    firebaseUid,
    hasRefreshToken: Boolean(connection.encryptedRefreshToken),
  });
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
  });

  const response = await fetch(`${X_API_BASE}/2/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${Buffer.from(`${requireXEnv("X_CLIENT_ID", "X_OAUTH_CLIENT_ID")}:${requireXEnv("X_CLIENT_SECRET", "X_OAUTH_CLIENT_SECRET")}`).toString("base64")}`,
    },
    body,
  });

  await logUsage({ db, admin, firebaseUid, endpoint: "token_refresh", success: response.ok, statusCode: response.status });
  console.log("xApiClient:refreshAccessToken:requestComplete", { firebaseUid, status: response.status, ok: response.ok });

  if (!response.ok) {
    console.error("xApiClient:refreshAccessToken:failed", await readSafeOAuthError(response));
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
  console.log("xApiClient:refreshAccessToken:success", {
    firebaseUid,
    hasAccessToken: Boolean(token.access_token),
    hasRefreshToken: Boolean(token.refresh_token),
    expiresIn: token.expires_in || null,
  });
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

async function fetchHomeTimeline({ accessToken, xUserId, sinceId, paginationToken, maxResults = 50 }) {
  if (isMockMode()) {
    return mockTimelinePage("home_timeline", paginationToken ? 2 : 1);
  }

  const params = timelineParams(maxResults);
  if (sinceId) params.set("since_id", sinceId);
  if (paginationToken) params.set("pagination_token", paginationToken);
  const url = `${X_API_BASE}/2/users/${encodeURIComponent(xUserId)}/timelines/reverse_chronological?${params.toString()}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    console.error("xApiClient:fetchHomeTimeline:failed", { xUserId, status: response.status });
    throw Object.assign(new Error(mapXStatus(response.status)), { code: mapXStatus(response.status), status: response.status });
  }
  console.log("xApiClient:fetchHomeTimeline:success", { xUserId, status: response.status });
  return response.json();
}

async function fetchListTimeline({ accessToken, listId, sinceId, paginationToken, maxResults = 50 }) {
  if (isMockMode()) {
    return mockTimelinePage("watch_list", paginationToken ? 2 : 1);
  }

  const params = timelineParams(maxResults);
  if (sinceId) params.set("since_id", sinceId);
  if (paginationToken) params.set("pagination_token", paginationToken);
  const url = `${X_API_BASE}/2/lists/${encodeURIComponent(listId)}/tweets?${params.toString()}`;
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    console.error("xApiClient:fetchListTimeline:failed", { listId, status: response.status });
    throw Object.assign(new Error(mapXStatus(response.status)), { code: mapXStatus(response.status), status: response.status });
  }
  console.log("xApiClient:fetchListTimeline:success", { listId, status: response.status });
  return response.json();
}

async function logUsage({ db, firebaseUid, runId = null, endpoint, requestCount = 1, fetchedPostCount = 0, fetchedUserCount = 0, fetchedMediaCount = 0, success, statusCode = null, headers = null }) {
  const reset = headers?.get?.("x-rate-limit-reset");
  console.log("xApiClient:logUsage", { firebaseUid, runId, endpoint, requestCount, fetchedPostCount, fetchedUserCount, fetchedMediaCount, success, statusCode, rateLimitRemaining: Number(headers?.get?.("x-rate-limit-remaining") || "") || null, rateLimitReset: reset || null });
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
