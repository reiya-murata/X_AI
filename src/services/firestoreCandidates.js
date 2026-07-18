import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db, firebaseEnabled } from "../lib/firebase";

export function subscribeCandidatePosts({ onNext, onError, minimumImpressions = 0 }) {
  if (!firebaseEnabled || !db) return () => {};
  const candidatesQuery = query(collection(db, "candidatePosts"), orderBy("createdAt", "desc"), limit(120));
  return onSnapshot(
    candidatesQuery,
    (snapshot) => {
      const now = Date.now();
      const posts = snapshot.docs
        .map((doc) => normalizeCandidateDoc(doc))
        .filter(Boolean)
        .filter((post) => post.hardFilter?.passed === true)
        .filter((post) => post.status !== "filtered_out")
        .filter((post) => passesMinimumImpressions(post, minimumImpressions))
        .filter((post) => !post.expiresAt || new Date(post.expiresAt).getTime() > now || ["sent_manual", "not_sent", "dismissed", "archived"].includes(post.workflowStatus))
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
        .slice(0, 50);
      onNext(posts);
    },
    onError,
  );
}

export function subscribeExcludedPosts({ onNext, onError }) {
  if (!firebaseEnabled || !db) return () => {};
  const excludedQuery = query(
    collection(db, "candidatePosts"),
    where("status", "==", "filtered_out"),
    orderBy("lastDiscoveredAt", "desc"),
    limit(30),
  );
  return onSnapshot(
    excludedQuery,
    (snapshot) => onNext(snapshot.docs.map((doc) => normalizeCandidateDoc(doc)).filter(Boolean)),
    onError,
  );
}

function normalizeCandidateDoc(doc) {
  const data = doc.data();
  if (!data.postId || typeof data.text !== "string") return null;
  return {
    id: doc.id,
    postId: data.postId,
    postUrl: data.postUrl || "",
    authorId: data.authorId || "",
    authorUsername: data.authorUsername || "",
    authorName: data.authorName || "",
    authorDescription: data.authorDescription || "",
    authorProfileImageUrl: data.authorProfileImageUrl || null,
    text: data.text,
    language: data.language || null,
    createdAt: toIso(data.createdAt),
    metrics: data.metrics || {},
    authorMetrics: data.authorMetrics || {},
    media: Array.isArray(data.media) ? data.media : [],
    sourceTypes: Array.isArray(data.sourceTypes) ? data.sourceTypes : [],
    hardFilter: data.hardFilter || { passed: false, exclusionReasons: [] },
    status: data.status || "candidate",
    workflowStatus: data.workflowStatus || null,
    workflowVersion: data.workflowVersion || null,
    statusHistory: Array.isArray(data.statusHistory) ? data.statusHistory : [],
    statusUpdatedAt: toIso(data.statusUpdatedAt),
    updatedAt: toIso(data.updatedAt),
    intentOpenedAt: toIso(data.intentOpenedAt),
    sentAt: toIso(data.sentAt),
    notSentAt: toIso(data.notSentAt),
    pendingSendConfirmation: data.pendingSendConfirmation === true,
    finalReplyText: data.finalReplyText || "",
    replyUrl: data.replyUrl || "",
    latestReplyDraftId: data.latestReplyDraftId || "",
    recommendedCandidateKey: data.recommendedCandidateKey || "A",
    recommendedReplyText: data.recommendedReplyText || "",
    notSentReason: data.notSentReason || "",
    rank: data.rank || null,
    scores: data.scores || {},
    aiAssessment: data.aiAssessment || null,
    aiDecision: data.aiDecision || null,
    aiProcessing: data.aiProcessing || null,
    generationStatus: data.generationStatus || null,
    generationError: data.generationError || data.aiProcessing?.lastErrorMessageSafe || null,
    generationErrorCode: data.generationErrorCode || data.aiProcessing?.lastErrorCode || null,
    expiresAt: toIso(data.expiresAt),
    firstDiscoveredAt: toIso(data.firstDiscoveredAt),
    lastDiscoveredAt: toIso(data.lastDiscoveredAt),
  };
}

function passesMinimumImpressions(post, minimumImpressions) {
  if (!minimumImpressions || Number(minimumImpressions) <= 0) return true;
  const impressions = Number.isFinite(Number(post.metrics?.impressions)) ? Number(post.metrics.impressions) : null;
  return impressions != null && impressions >= Number(minimumImpressions);
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  return null;
}
