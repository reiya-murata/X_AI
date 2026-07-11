const DATA_FLOOR = 3;
const HUMAN_ORIGIN = "human_manual";
const TEST_ORIGINS = new Set(["test_snapshot", "seeded_sample", "automated_test"]);
const LEGACY_ORIGIN = "legacy_unknown";

function splitSentences(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/(?<=[。！？!?])\s*|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildHumanEditDiff(originalText, editedText) {
  const original = String(originalText || "").trim();
  const edited = String(editedText || "").trim();
  if (!edited) {
    return {
      changedChars: original.length,
      addedText: "",
      removedText: original,
      isEmptyEdit: true,
      summary: "空のhumanEditedText",
    };
  }
  if (original === edited) {
    return {
      changedChars: 0,
      addedText: "",
      removedText: "",
      isEmptyEdit: false,
      summary: "編集なし",
    };
  }
  const originalSentences = splitSentences(original);
  const editedSentences = splitSentences(edited);
  const added = editedSentences.filter((sentence) => !originalSentences.includes(sentence)).join(" ");
  const removed = originalSentences.filter((sentence) => !editedSentences.includes(sentence)).join(" ");
  return {
    changedChars: Math.abs(edited.length - original.length),
    addedText: added,
    removedText: removed,
    isEmptyEdit: false,
    summary: "差分あり",
  };
}

export function filterQualityEvaluations(evaluations, mode = "human", { includeLegacyUnknown = false } = {}) {
  const list = Array.isArray(evaluations) ? evaluations : [];
  return list.filter((item) => {
    const origin = normalizeOrigin(item?.evaluationOrigin);
    if (!includeLegacyUnknown && origin === LEGACY_ORIGIN) return false;
    if (mode === "all") return true;
    if (mode === "test") return TEST_ORIGINS.has(origin);
    return origin === HUMAN_ORIGIN;
  });
}

export function summarizeQualityEvaluations(evaluations, fixtures = [], options = {}) {
  const list = filterQualityEvaluations(evaluations, options.mode || "human", { includeLegacyUnknown: Boolean(options.includeLegacyUnknown) });
  const fixtureList = Array.isArray(fixtures) ? fixtures : [];
  const fixtureMap = new Map(fixtureList.map((fixture) => [fixture.id, fixture]));
  const totalFixtures = fixtureList.length || new Set(list.map((item) => item.fixtureId)).size;
  const evaluated = list.filter((item) => item.overallDecision && item.overallDecision !== "pending");
  const count = (fn) => list.filter(fn).length;
  const avg = (items, selector) => {
    const values = items.map(selector).filter((value) => Number.isFinite(value));
    if (values.length < DATA_FLOOR) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const tagCounter = (items, field) => {
    const counter = new Map();
    items.forEach((item) => {
      (item[field] || []).forEach((tag) => counter.set(tag, (counter.get(tag) || 0) + 1));
    });
    return [...counter.entries()].sort((a, b) => b[1] - a[1]);
  };

  const byFixture = groupBy(list, (item) => item.fixtureId || "unknown");
  const byCategory = groupBy(list, (item) => fixtureMap.get(item.fixtureId)?.category || item.category || "unknown");
  const byCandidate = groupBy(list, (item) => item.candidateId || item.candidateKey || "unknown");
  const byVersion = groupBy(list, (item) => `${item.sourceType || "unknown"}|${item.generationVersion || "unknown"}|${item.promptVersion || "unknown"}|${item.contextSelectorVersion || "unknown"}|${item.codeCheckVersion || "unknown"}`);
  const byOrigin = groupBy(list, (item) => normalizeOrigin(item.evaluationOrigin));

  return {
    totalFixtures: totalFixtures || 0,
    totalEvaluations: list.length,
    totalEvaluationsAllOrigins: Array.isArray(evaluations) ? evaluations.length : 0,
    legacyUnknownCount: Array.isArray(evaluations) ? evaluations.filter((item) => normalizeOrigin(item?.evaluationOrigin) === LEGACY_ORIGIN).length : 0,
    originMode: options.mode || "human",
    evaluatedCount: evaluated.length,
    acceptedRate: safeRatio(count((item) => item.overallDecision === "accepted"), list.length),
    acceptedWithEditRate: safeRatio(count((item) => item.overallDecision === "accepted_with_edit"), list.length),
    rejectedRate: safeRatio(count((item) => item.overallDecision === "rejected"), list.length),
    pendingRate: safeRatio(count((item) => item.overallDecision === "pending"), list.length),
    averageScore: avg(list, (item) => averageScores(item.scores)),
    topGoodTag: topTag(tagCounter(list, "goodTags")),
    topBadTag: topTag(tagCounter(list, "badTags")),
    byFixture: mapSummary(byFixture),
    byCategory: mapCategorySummary(byCategory),
    byCandidate: mapCandidateSummary(byCandidate),
    byVersion: mapVersionSummary(byVersion),
    byOrigin: mapOriginSummary(byOrigin),
    scoreAverages: averageAxisScores(list),
    topGoodTags: tagCounter(list, "goodTags").slice(0, 5),
    topBadTags: tagCounter(list, "badTags").slice(0, 5),
    acceptedWithEditAverageChangedChars: avg(list.filter((item) => item.overallDecision === "accepted_with_edit"), (item) => Number(item.changeSummary?.changedChars || 0)),
    diffPatterns: diffPatternSummary(list),
    improvementSignals: improvementSignals(list),
  };
}

function normalizeOrigin(value) {
  if (value === HUMAN_ORIGIN) return HUMAN_ORIGIN;
  if (TEST_ORIGINS.has(value)) return value;
  return LEGACY_ORIGIN;
}

function averageAxisScores(list) {
  const axes = ["originalPostRelevance", "reiyaSpecificity", "naturalJapanese", "usefulAdditionalInsight", "profileVisitPotential", "nonPromotional", "factualAccuracy"];
  return Object.fromEntries(axes.map((axis) => {
    const values = list.map((item) => Number(item.scores?.[axis])).filter(Number.isFinite);
    return [axis, values.length >= DATA_FLOOR ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
  }));
}

function improvementSignals(list) {
  const badTags = tagCounter(list, "badTags");
  const acceptedWithEdit = list.filter((item) => item.overallDecision === "accepted_with_edit");
  return [
    badTags.some(([tag, count]) => tag === "一般論すぎる" && count >= 2) ? "「一般論すぎる」が多い -> 具体的経験Contextの選択状況を確認" : null,
    badTags.some(([tag, count]) => tag === "関係ないAI接続" && count >= 2) ? "「関係ないAI接続」が多い -> カテゴリ判定とallowedIdentityAnglesを確認" : null,
    badTags.some(([tag, count]) => tag === "宣伝臭が強い" && count >= 2) ? "「宣伝臭が強い」が多い -> ツール名・自己紹介・CTAの使用頻度を確認" : null,
    badTags.some(([tag, count]) => tag === "長すぎる" && count >= 2) ? "「長すぎる」が多い -> reply length設定を確認" : null,
    badTags.some(([tag, count]) => tag === "同じ構文の反復" && count >= 2) ? "「同じ構文の反復」が多い -> 直近返信との類似度と冒頭表現を確認" : null,
    acceptedWithEdit.length >= 2 ? "accepted_with_editが多い -> 編集差分の共通パターンを確認" : null,
  ].filter(Boolean);
}

function diffPatternSummary(list) {
  const items = list.filter((item) => item.overallDecision === "accepted_with_edit" && item.changeSummary);
  return {
    count: items.length,
    averageChangedChars: items.length >= DATA_FLOOR ? items.reduce((sum, item) => sum + Number(item.changeSummary.changedChars || 0), 0) / items.length : null,
  };
}

function mapSummary(grouped) {
  return Object.fromEntries([...grouped.entries()].map(([key, items]) => [key, { count: items.length, averageScore: averageScores(items) }]));
}

function mapCategorySummary(grouped) {
  return Object.fromEntries([...grouped.entries()].map(([key, items]) => [key, {
    count: items.length,
    averageScore: averageScores(items),
  }]));
}

function mapCandidateSummary(grouped) {
  return Object.fromEntries([...grouped.entries()].map(([key, items]) => [key, {
    count: items.length,
    acceptedRate: safeRatio(items.filter((item) => item.overallDecision === "accepted").length, items.length),
    averageScore: averageScores(items),
  }]));
}

function mapVersionSummary(grouped) {
  return Object.fromEntries([...grouped.entries()].map(([key, items]) => [key, {
    count: items.length,
    averageScore: averageScores(items),
  }]));
}

function mapOriginSummary(grouped) {
  return Object.fromEntries([...grouped.entries()].map(([key, items]) => [key, {
    count: items.length,
    averageScore: averageScores(items),
    evaluatedCount: items.filter((item) => item.overallDecision && item.overallDecision !== "pending").length,
  }]));
}

function topTag(entries) {
  const [tag, count] = entries[0] || [null, 0];
  return { tag, count };
}

function groupBy(items, getter) {
  return items.reduce((map, item) => {
    const key = getter(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
    return map;
  }, new Map());
}

function averageScores(scores = {}) {
  const values = Object.values(scores).map(Number).filter(Number.isFinite);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safeRatio(num, den) {
  if (!den) return null;
  return num / den;
}

function tagCounter(items, field) {
  const counter = new Map();
  items.forEach((item) => {
    (item[field] || []).forEach((tag) => counter.set(tag, (counter.get(tag) || 0) + 1));
  });
  return [...counter.entries()].sort((a, b) => b[1] - a[1]);
}

export function formatMaybeScore(value) {
  if (!Number.isFinite(value)) return "データ不足";
  return value.toFixed(1);
}
