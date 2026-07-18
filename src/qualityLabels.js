const decisionLabels = {
  accepted: "そのまま採用",
  accepted_with_edit: "修正して採用",
  rejected: "不採用",
  pending: "保留",
};

const originLabels = {
  human_manual: "人間による評価",
  test_snapshot: "テスト用スナップショット",
  seeded_sample: "表示確認用サンプル",
  automated_test: "自動テスト",
  legacy_unknown: "旧データ・出自不明",
};

const sourceTypeLabels = {
  fixture: "評価用サンプル",
  mock: "模擬生成",
  real_api: "実API生成",
  production_manual: "実運用・手動登録",
};

const candidateSourceTypeLabels = {
  home_timeline: "ホームタイムライン",
  watch_list: "監視リスト",
  search: "検索",
  manual: "手動取得",
  imported: "取り込み",
};

const candidateLabels = {
  A: "候補A",
  B: "候補B",
  C: "候補C",
};

const categoryLabels = {
  ai_workflow: "AI業務改善",
  ai_tool_dev: "AIツール開発",
  web_ai: "Web制作",
  devlog: "個人開発・検証",
  store_meo: "店舗・MEO運用",
  sns_ops: "SNS・X運用",
  work: "仕事・成長",
  human_relation: "人間関係",
  misinfo_risk: "誤情報・強い断定",
  promo_risk: "宣伝接続の注意",
  clarification_needed: "意図確認が必要",
  general_work: "一般的な仕事論",
  ai_opinion: "AIへの意見",
  life_work: "生活・仕事",
  question: "質問",
  offtopic: "対象外",
};

const versionLabels = {
  fixtureVersion: "評価データ版",
  generationVersion: "生成処理版",
  promptVersion: "指示文版",
  contextSelectorVersion: "文脈選択版",
  codeCheckVersion: "自動検査版",
  evaluationSchemaVersion: "評価形式版",
};

const exclusionReasonLabels = {
  below_minimum_impressions: "最低インプレッション未満",
  self_post: "自分の投稿",
  giveaway_or_follow_campaign: "フォロー・リポスト系のキャンペーン",
  protected_author: "鍵アカウント",
  too_old: "古い投稿",
  too_short: "本文が短い",
  unsupported_language: "対応外の言語",
  sensitive: "センシティブ",
  blocked_author: "ブロック対象",
  empty_text: "本文なし",
  url_only: "URLのみ",
  invalid_post_id: "投稿ID不正",
  invalid_created_at: "投稿日時不正",
  already_processed: "処理済み",
  investment_spam: "投資スパム",
  adult_content: "成人向け",
};

const scoreLabels = {
  sourceUnderstanding: "元投稿の理解",
  addedValue: "一段深い価値",
  reiyaSpecificity: "れいやらしさ",
  naturalness: "文章の自然さ",
  replyFit: "X返信としての適合度",
  nonPromotional: "宣伝臭の少なさ",
  profileCuriosity: "プロフィールへの興味",
  contextRelevance: "使用文脈の関連性",
  originality: "独自性",
  originalPostRelevance: "元投稿の理解",
  usefulAdditionalInsight: "一段深い価値",
  naturalJapanese: "文章の自然さ",
  profileVisitPotential: "プロフィールへの興味",
  factualAccuracy: "事実の正確さ",
};

function formatLabel(map, value, fallback = "未分類") {
  if (value == null || value === "") return fallback;
  return map[value] || fallback;
}

function formatDecisionLabel(value) {
  return formatLabel(decisionLabels, value, "未分類");
}

function formatOriginLabel(value) {
  return formatLabel(originLabels, value, "未分類");
}

function formatSourceTypeLabel(value) {
  return formatLabel(sourceTypeLabels, value, "未分類");
}

function formatCandidateSourceTypeLabel(value) {
  return formatLabel(candidateSourceTypeLabels, value, "未分類");
}

function formatCandidateLabel(value) {
  return formatLabel(candidateLabels, value, "未分類");
}

function formatCategoryLabel(value) {
  return formatLabel(categoryLabels, value, "未分類");
}

function formatVersionLabel(key) {
  return formatLabel(versionLabels, key, "技術情報");
}

function formatExclusionReasonLabel(value) {
  return formatLabel(exclusionReasonLabels, value, "未分類");
}

export {
  candidateLabels,
  candidateSourceTypeLabels,
  categoryLabels,
  exclusionReasonLabels,
  decisionLabels,
  originLabels,
  scoreLabels,
  sourceTypeLabels,
  versionLabels,
  formatCandidateLabel,
  formatCandidateSourceTypeLabel,
  formatCategoryLabel,
  formatDecisionLabel,
  formatExclusionReasonLabel,
  formatOriginLabel,
  formatSourceTypeLabel,
  formatVersionLabel,
};
