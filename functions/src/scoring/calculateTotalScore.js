const { clamp100 } = require("./localScores");

function calculateTotalScore({ relevanceScore, replyValueScore, momentumScore, profileConversionScore, freshnessScore, saturationPenalty, riskPenalty }) {
  const total = relevanceScore * 0.35
    + replyValueScore * 0.20
    + momentumScore * 0.20
    + profileConversionScore * 0.15
    + freshnessScore * 0.10
    - saturationPenalty
    - riskPenalty;
  return clamp100(total);
}

module.exports = { calculateTotalScore };
