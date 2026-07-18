import { callFunction, firebaseEnabled } from "../lib/firebase";

const mockConfig = {
  scheduledReplyOpportunityEnabled: false,
  minimumImpressions: 5000,
  maxPostAgeHours: 6,
  generationLimitPerRun: 1,
  dailyLimit: 10,
  authorCooldownHours: 24,
  postCooldownHours: 24,
  minOpportunityScore: 55,
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
  opportunities: [],
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

export function getScheduledReplyOpportunityMockOverview() {
  return mockOverview;
}
