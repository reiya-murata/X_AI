function normalizeTimelineResponse(response) {
  const users = new Map((response.includes?.users || []).map((user) => [user.id, user]));
  const media = new Map((response.includes?.media || []).map((item) => [item.media_key, item]));

  return (response.data || []).map((tweet) => {
    const author = users.get(tweet.author_id) || {};
    const metrics = tweet.public_metrics || {};
    const authorMetrics = author.public_metrics || {};

    return {
      postId: String(tweet.id || ""),
      postUrl: author.username && tweet.id ? `https://x.com/${author.username}/status/${tweet.id}` : "",
      authorId: String(tweet.author_id || ""),
      authorUsername: String(author.username || ""),
      authorName: String(author.name || ""),
      authorDescription: String(author.description || ""),
      authorProfileImageUrl: author.profile_image_url || null,
      text: String(tweet.text || ""),
      language: tweet.lang || null,
      createdAt: tweet.created_at || null,
      conversationId: tweet.conversation_id || null,
      referencedTweets: (tweet.referenced_tweets || []).map((item) => ({
        type: item.type,
        postId: String(item.id || ""),
      })),
      metrics: {
        likes: numberOrZero(metrics.like_count),
        replies: numberOrZero(metrics.reply_count),
        reposts: numberOrZero(metrics.retweet_count),
        quotes: numberOrZero(metrics.quote_count),
        bookmarks: nullableNumber(metrics.bookmark_count),
        impressions: nullableNumber(metrics.impression_count),
      },
      authorMetrics: {
        followers: numberOrZero(authorMetrics.followers_count),
        following: numberOrZero(authorMetrics.following_count),
        posts: numberOrZero(authorMetrics.tweet_count),
        listed: nullableNumber(authorMetrics.listed_count),
      },
      media: (tweet.attachments?.media_keys || []).map((key) => {
        const item = media.get(key) || {};
        return {
          mediaKey: key,
          type: item.type || "",
          url: item.url || null,
          previewImageUrl: item.preview_image_url || null,
          altText: item.alt_text || null,
        };
      }),
      possiblySensitive: tweet.possibly_sensitive === true,
      authorProtected: author.protected === true,
    };
  });
}

function numberOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function nullableNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

module.exports = { normalizeTimelineResponse };
