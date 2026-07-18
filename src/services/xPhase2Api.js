import { callFunction, firebaseEnabled } from "../lib/firebase";

const mockConnection = {
  connected: true,
  xUserId: "1000000000000000000",
  username: "Rachel_hkz",
  displayName: "れいちぇる｜Web×AIツール開発",
  profileImageUrl: null,
  scopes: ["tweet.read", "users.read", "list.read", "offline.access"],
  accessTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  lastRefreshedAt: null,
  lastHomeTimelineSyncAt: null,
  lastListTimelineSyncAt: null,
  lastErrorCode: null,
};

const mockHardFilterRuleSet = {
  filterRuleSetId: "x-hard-filter-v1",
  minimumTextLength: 20,
  maxAgeHours: 6,
  minimumImpressions: 10000,
  allowedLanguages: ["ja"],
  excludeSensitive: true,
  excludedKeywords: ["フォロー&リポスト", "フォロー＆リポスト", "プレゼント企画", "フォロバ", "仮想通貨", "爆益", "成人向け"],
  blockedAuthorIds: [],
  version: 1,
};

const mockCandidates = [
  {
    postId: "1810000000000000001",
    postUrl: "https://x.com/ai_ops_note/status/1810000000000000001",
    authorName: "AI業務改善メモ",
    authorUsername: "ai_ops_note",
    text: "AIツールは導入した直後より、社内で誰が更新するか決めていない時に止まりがち。ここを設計している会社は強い。",
    createdAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    metrics: { likes: 68, replies: 9, reposts: 14, quotes: 3, impressions: 12000 },
    authorMetrics: { followers: 18400 },
    sourceTypes: ["home_timeline"],
    hardFilter: { passed: true, exclusionReasons: [] },
    status: "candidate",
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    postId: "1810000000000000002",
    postUrl: "https://x.com/web_ai_flow/status/1810000000000000002",
    authorName: "Web制作とAI",
    authorUsername: "web_ai_flow",
    text: "Web制作者はAIで仕事がなくなるというより、AIを業務フローに組み込む力が差になりそう。",
    createdAt: new Date(Date.now() - 96 * 60 * 1000).toISOString(),
    metrics: { likes: 41, replies: 5, reposts: 8, quotes: 1, impressions: 10000 },
    authorMetrics: { followers: 6200 },
    sourceTypes: ["watch_list"],
    hardFilter: { passed: true, exclusionReasons: [] },
    status: "candidate",
    expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
  },
];

const mockExcluded = [
  {
    postId: "1810000000000000004",
    postUrl: "https://x.com/present_now/status/1810000000000000004",
    authorName: "懸賞アカウント",
    authorUsername: "present_now",
    text: "フォロー&リポストでAmazonギフト券プレゼント！",
    createdAt: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
    metrics: { likes: 220, replies: 80, reposts: 140, quotes: 4, impressions: 8900 },
    authorMetrics: { followers: 2200 },
    sourceTypes: ["home_timeline"],
    hardFilter: { passed: false, exclusionReasons: ["below_minimum_impressions", "giveaway_or_follow_campaign"] },
    status: "filtered_out",
  },
];

export async function getXConnectionStatus() {
  if (!firebaseEnabled) return mockConnection;
  return callFunction("getXConnectionStatus");
}

export async function beginXOAuth() {
  if (!firebaseEnabled) return { authorizationUrl: "?x_oauth=mock_success", mock: true };
  return callFunction("beginXOAuth");
}

export async function disconnectX() {
  if (!firebaseEnabled) return { ok: true };
  return callFunction("disconnectX");
}

export async function fetchHomeTimelineNow() {
  if (!firebaseEnabled) {
    return {
      success: true,
      runId: "mock-home-run",
      fetchedCount: 6,
      savedCount: 2,
      duplicateCount: 1,
      excludedCount: 4,
      newestId: "1810000000000000001",
      hasMore: true,
      exclusionSummary: {
        self_post: 1,
        giveaway_or_follow_campaign: 1,
        protected_author: 1,
        too_old: 1,
      },
    };
  }
  return callFunction("fetchHomeTimelineNow");
}

export async function fetchWatchListTimelineNow(listId) {
  if (!firebaseEnabled) {
    return {
      success: true,
      runId: "mock-list-run",
      fetchedCount: 3,
      savedCount: 1,
      duplicateCount: 1,
      excludedCount: 1,
      newestId: "1810000000000000002",
      hasMore: false,
      exclusionSummary: { too_short: 1 },
    };
  }
  return callFunction("fetchWatchListTimelineNow", { listId });
}

export async function saveWatchListSetting(setting) {
  if (!firebaseEnabled) return { ok: true };
  return callFunction("saveWatchListSetting", setting);
}

export async function getHardFilterRuleSet() {
  if (!firebaseEnabled) return mockHardFilterRuleSet;
  return callFunction("getHardFilterRuleSet");
}

export async function saveHardFilterRuleSet(setting) {
  if (!firebaseEnabled) {
    if (typeof setting?.minimumImpressions === "number") {
      mockHardFilterRuleSet.minimumImpressions = setting.minimumImpressions;
    }
    return { ok: true, ...mockHardFilterRuleSet };
  }
  return callFunction("saveHardFilterRuleSet", setting);
}

export async function listCandidatePosts() {
  if (!firebaseEnabled) {
    const minimumImpressions = Number(mockHardFilterRuleSet.minimumImpressions || 0);
    return {
      candidates: mockCandidates.filter((post) => passesMinimumImpressions(post, minimumImpressions)),
      excluded: mockExcluded,
    };
  }
  return callFunction("listCandidatePosts");
}

export async function getSyncOverview() {
  if (!firebaseEnabled) {
    return {
      scheduler: { schedulerEnabled: false, intervalMinutes: 60, maxPagesPerRun: 1 },
      states: [
        {
          id: "mock_home",
          sourceType: "home_timeline",
          latestSinceId: "1810000000000000001",
          lastResultCount: 6,
          lastSavedCount: 2,
          lastExcludedCount: 4,
          lastSuccessfulAt: new Date().toISOString(),
          lastErrorCode: null,
        },
      ],
      runs: [],
    };
  }
  return callFunction("getSyncOverview");
}

function passesMinimumImpressions(post, minimumImpressions) {
  if (!minimumImpressions) return true;
  const impressions = Number.isFinite(Number(post.metrics?.impressions)) ? Number(post.metrics.impressions) : null;
  return impressions != null && impressions >= minimumImpressions;
}
