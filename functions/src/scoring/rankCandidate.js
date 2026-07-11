function rankCandidate(totalScore, forcedRisk = false) {
  if (forcedRisk) return "RISK";
  if (totalScore >= 82) return "S";
  if (totalScore >= 72) return "A";
  if (totalScore >= 62) return "B";
  return "C";
}

module.exports = { rankCandidate };
