const now = Date.now();

const mockConnection = {
  connected: true,
  xUserId: "1000000000000000000",
  username: "Rachel_hkz",
  displayName: "れいちぇる｜Web×AIツール開発",
  profileImageUrl: null,
  scopes: ["tweet.read", "users.read", "list.read", "offline.access"],
  accessTokenExpiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
  lastRefreshedAt: null,
  lastHomeTimelineSyncAt: null,
  lastListTimelineSyncAt: null,
  lastErrorCode: null,
};

function mockTimelinePage(sourceType, page = 1) {
  const fresh = new Date(now - 30 * 60 * 1000).toISOString();
  const old = new Date(now - 8 * 60 * 60 * 1000).toISOString();
  const baseUsers = [
    user("2000000000000000001", "AI業務改善メモ", "ai_ops_note", 18400),
    user("2000000000000000002", "Web制作とAI", "web_ai_flow", 6200),
    user("1000000000000000000", "れいちぇる｜Web×AIツール開発", "Rachel_hkz", 900),
    user("2000000000000000003", "懸賞アカウント", "present_now", 2200),
    user("2000000000000000004", "鍵アカ", "protected_user", 120, true),
  ];

  const posts = page === 1
    ? [
      tweet("1810000000000000001", baseUsers[0].id, fresh, "AIツールは導入した直後より、社内で誰が更新するか決めていない時に止まりがち。ここを設計している会社は強い。", 68, 9, 14, 3, 12000),
      tweet("1810000000000000002", baseUsers[1].id, fresh, "Web制作者はAIで仕事がなくなるというより、AIを業務フローに組み込む力が差になりそう。", 41, 5, 8, 1, 10000),
      tweet("1810000000000000003", baseUsers[2].id, fresh, "自分の投稿は除外される確認用です。", 1, 0, 0, 0, 15000),
      tweet("1810000000000000004", baseUsers[3].id, fresh, "フォロー&リポストでAmazonギフト券プレゼント！", 220, 80, 140, 4, 9999),
      tweet("1810000000000000005", baseUsers[4].id, fresh, "鍵アカウントの投稿は除外される確認用です。", 1, 0, 0, 0, null),
      tweet("1810000000000000006", baseUsers[0].id, old, "古い投稿は6時間超で除外される確認用です。", 3, 0, 0, 0, 13000),
    ]
    : [
      tweet("1810000000000000002", baseUsers[1].id, fresh, "Web制作者はAIで仕事がなくなるというより、AIを業務フローに組み込む力が差になりそう。", 44, 6, 8, 1, 10500),
      tweet("1810000000000000007", baseUsers[0].id, fresh, "短文", 2, 0, 0, 0, 8000),
    ];

  return {
    data: posts,
    includes: { users: baseUsers, media: [] },
    meta: {
      newest_id: posts[0]?.id || null,
      oldest_id: posts[posts.length - 1]?.id || null,
      result_count: posts.length,
      next_token: page === 1 ? `${sourceType}-page-2` : undefined,
    },
  };
}

function user(id, name, username, followers, isProtected = false) {
  return {
    id,
    name,
    username,
    description: "",
    profile_image_url: null,
    protected: isProtected,
    public_metrics: {
      followers_count: followers,
      following_count: 120,
      tweet_count: 1000,
      listed_count: 10,
    },
  };
}

function tweet(id, authorId, createdAt, text, likes, replies, reposts, quotes, impressions = null) {
  return {
    id,
    author_id: authorId,
    created_at: createdAt,
    text,
    lang: "ja",
    conversation_id: id,
    referenced_tweets: [],
    possibly_sensitive: false,
    public_metrics: {
      like_count: likes,
      reply_count: replies,
      retweet_count: reposts,
      quote_count: quotes,
      bookmark_count: 0,
      impression_count: impressions,
    },
  };
}

module.exports = { mockConnection, mockTimelinePage };
