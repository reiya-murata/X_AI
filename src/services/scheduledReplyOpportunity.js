import { callFunction, firebaseEnabled } from "../lib/firebase";

const mockConfig = {
  scheduledReplyOpportunityEnabled: false,
  minimumImpressions: 5000,
  maxPostAgeHours: 24,
  generationLimitPerRun: 1,
  dailyLimit: 8,
  authorCooldownHours: 24,
  postCooldownHours: 24,
  minOpportunityScore: 75,
  qualityScoreMinimum: 75,
  unconfirmedLimit: 20,
  operatingHoursStart: 6,
  operatingHoursEnd: 23,
  weights: {
    freshness: 0.3,
    engagementRate: 0.25,
    impressions: 0.2,
    relevance: 0.2,
    authorDiversity: 0.05,
  },
};

const mockOverview = {
  config: mockConfig,
  state: {
    id: "global",
    lastRunAt: null,
    lastRunKey: null,
    lastResultStatus: "disabled",
    lastResultSelectedCount: 0,
    dailyCounts: {},
  },
  opportunities: [
    {
      id: "draft-mock-1",
      draftId: "draft-mock-1",
      candidatePostId: "draft-mock-1",
      sourcePostId: "draft-mock-1",
      sourcePostUrl: "https://x.com/ai_ops_note/status/1810000000000000001",
      sourceText: "AIツールは導入した直後より、誰が更新するかを決めていない時に止まりがち。",
      sourceAuthorName: "AI業務改善メモ",
      sourceAuthorUsername: "ai_ops_note",
      sourceCreatedAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
      impressions: 12000,
      likes: 68,
      replies: 9,
      reposts: 14,
      generatedReply: "更新担当を最初に決めておくと、導入後の失速がかなり減りますよね。運用の回し方まで設計できると強いです。",
      generatedAt: new Date().toISOString(),
      opportunityScore: 88,
      qualityScore: 84,
      selectionReason: "新しい投稿 / 反応率が高い / 発信テーマと近い",
      status: "unread",
      openedAt: null,
      dismissedAt: null,
      sentConfirmedAt: null,
      idempotencyKey: "draft-mock-1-20260718-0",
      generationModel: "gpt-4o-mini",
      promptVersion: "x-reply-generation-v1",
      replyDraft: "更新担当を最初に決めておくと、導入後の失速がかなり減りますよね。運用の回し方まで設計できると強いです。",
    },
  ],
};

export async function getScheduledReplyOpportunityOverview() {
  if (!firebaseEnabled) return mockOverview;
  return callFunction("getScheduledReplyOpportunityOverview", {});
}

export async function saveScheduledReplyOpportunitySetting(payload) {
  if (!firebaseEnabled) return { ok: true, ...mockConfig, ...payload };
  return callFunction("saveScheduledReplyOpportunitySetting", payload);
}

export async function runScheduledReplyOpportunityNow() {
  if (!firebaseEnabled) return { ok: true, mock: true };
  return callFunction("runScheduledReplyOpportunityNow", {});
}

export async function saveScheduledReplyOpportunityDraft(payload) {
  if (!firebaseEnabled) return { ok: true, mock: true, ...payload };
  return callFunction("saveScheduledReplyOpportunityDraft", payload);
}

export async function markScheduledReplyOpportunityOpened(payload) {
  if (!firebaseEnabled) return { ok: true, mock: true, status: "opened_in_x", ...payload };
  return callFunction("markScheduledReplyOpportunityOpened", payload);
}

export async function dismissScheduledReplyOpportunity(payload) {
  if (!firebaseEnabled) return { ok: true, mock: true, status: "dismissed", ...payload };
  return callFunction("dismissScheduledReplyOpportunity", payload);
}

export function getScheduledReplyOpportunityMockOverview() {
  return mockOverview;
}
