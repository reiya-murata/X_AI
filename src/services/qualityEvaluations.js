import { collection, onSnapshot } from "firebase/firestore";
import { db, firebaseEnabled } from "../lib/firebase";

export function subscribeQualityEvaluations({ onNext, onError }) {
  if (!firebaseEnabled || !db) return () => {};
  return onSnapshot(
    collection(db, "replyDraftHumanEvaluations"),
    (snapshot) => {
      onNext(snapshot.docs.map((doc) => ({ id: doc.id, ...normalizeEvaluation(doc.data()) })));
    },
    onError,
  );
}

function normalizeEvaluation(data) {
  return {
    fixtureId: data.fixtureId || data.candidatePostId || "unknown",
    candidateId: data.candidateId || data.candidateKey || "A",
    candidateKey: data.candidateKey || data.candidateId || "A",
    overallDecision: data.overallDecision || "pending",
    scores: data.scores || {},
    goodTags: Array.isArray(data.goodTags) ? data.goodTags : splitTags(data.feedbackTags, "good"),
    badTags: Array.isArray(data.badTags) ? data.badTags : splitTags(data.feedbackTags, "bad"),
    feedbackTags: Array.isArray(data.feedbackTags) ? data.feedbackTags : [],
    evaluatorNotes: data.evaluatorNotes || data.humanMemo || "",
    humanEditedText: data.humanEditedText || "",
    originalReplyText: data.originalReplyText || data.originalText || "",
    sourceType: data.sourceType || "fixture",
    evaluationOrigin: data.evaluationOrigin || "legacy_unknown",
    generationVersion: data.generationVersion || "",
    promptVersion: data.promptVersion || "",
    contextSelectorVersion: data.contextSelectorVersion || "",
    codeCheckVersion: data.codeCheckVersion || "",
    model: data.model || null,
    responseId: data.responseId || null,
    apiCallCount: Number(data.apiCallCount || 0),
    inputTokens: data.inputTokens ?? null,
    outputTokens: data.outputTokens ?? null,
    latencyMs: data.latencyMs ?? null,
    evaluatedAt: data.evaluatedAt || data.createdAt || null,
    createdAt: data.createdAt || null,
    changeSummary: data.changeSummary || null,
  };
}

function splitTags(tags, kind) {
  const list = Array.isArray(tags) ? tags : [];
  if (kind === "good") return list.filter((tag) => tag && !isBadTag(tag));
  return list.filter((tag) => tag && isBadTag(tag));
}

function isBadTag(tag) {
  return [
    "一般論すぎる",
    "元投稿の言い換えだけ",
    "共感だけで終わっている",
    "文脈を読み違えている",
    "関係ないAI接続",
    "宣伝臭が強い",
    "自己紹介が不自然",
    "上から目線",
    "説教臭い",
    "長すぎる",
    "同じ構文の反復",
    "れいや固有性がない",
    "根拠のない断定",
    "相手より自分の話が中心",
    "Xの返信として重い",
    "不自然なプロフィール誘導",
  ].includes(tag);
}
