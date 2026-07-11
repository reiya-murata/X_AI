const { SCORING_RULES } = require("../phase3/config");

function calculateFreshnessScore(ageMinutes) {
  const bucket = SCORING_RULES.freshness.find((item) => ageMinutes >= item.min && ageMinutes < item.max);
  return bucket ? bucket.score : 0;
}

function calculateMomentumScore({ likes = 0, replies = 0, reposts = 0, quotes = 0, ageMinutes = 0, authorFollowers = 0 }) {
  const weightedEngagement = likes + replies * 1.8 + reposts * 2.5 + quotes * 2.0;
  const velocityPerMinute = weightedEngagement / Math.max(ageMinutes, 10);
  const followerAdjustment = 1000 / Math.max(authorFollowers, 1000);
  const normalizedVelocity = velocityPerMinute * followerAdjustment;
  const followerBand = authorFollowers >= 100000 ? "100k+"
    : authorFollowers >= 50000 ? "50k+"
    : authorFollowers >= 10000 ? "10k+"
    : authorFollowers >= 1000 ? "1k+"
    : "under1k";
  const score = normalizedVelocity >= 1 ? 100
    : normalizedVelocity >= 0.5 ? 90
    : normalizedVelocity >= 0.25 ? 80
    : normalizedVelocity >= 0.1 ? 70
    : normalizedVelocity >= 0.05 ? 60
    : normalizedVelocity >= 0.02 ? 45
    : normalizedVelocity >= 0.01 ? 30
    : 15;
  return { score, weightedEngagement, velocityPerMinute, normalizedVelocity, followerBand };
}

function calculateSaturationPenalty({ likes = 0, replies = 0 }) {
  const ratio = replies / Math.max(likes, 1);
  let penalty = 0;
  if (ratio >= 1.5) penalty = -15;
  else if (ratio >= 0.8) penalty = -10;
  else if (ratio >= 0.4) penalty = -5;
  if (replies >= 150) penalty -= 10;
  else if (replies >= 80) penalty -= 5;
  return Math.max(penalty, -20);
}

function calculateLocalTopicMatch({ text, identity }) {
  const hay = `${text} ${identity.creatorProfile?.positioning || ""} ${identity.creatorProfile?.targetAudiences?.join(" ") || ""}`.toLowerCase();
  const keywords = [
    "ai", "web", "faq", "manual", "sns", "x", "threads", "meo", "google", "codex", "claude", "workflow", "ui", "業務", "店舗",
  ];
  return Math.min(100, keywords.reduce((sum, keyword) => sum + (hay.includes(keyword) ? 8 : 0), 0));
}

function calculateDataCompletenessScore(candidate) {
  let score = 100;
  if (!candidate.text) score -= 40;
  if (!candidate.authorName) score -= 20;
  if (!candidate.authorUsername) score -= 20;
  if (!candidate.createdAt) score -= 15;
  if (!candidate.metrics) score -= 10;
  return Math.max(0, score);
}

function clamp100(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

module.exports = {
  calculateFreshnessScore,
  calculateMomentumScore,
  calculateSaturationPenalty,
  calculateLocalTopicMatch,
  calculateDataCompletenessScore,
  clamp100,
};
