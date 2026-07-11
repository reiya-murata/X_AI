const fs = require("node:fs");
const path = require("node:path");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { buildSeedDocuments } = require("../src/seed");
const { processCandidateWithAi } = require("../src/phase3/analysis");
const { loadPublicIdentity } = require("../src/identity/loadPublicIdentity");
const { classifyOpenAi429, sanitizeOpenAiMessage, collectOpenAiErrorEvidence } = require("../src/openai/client");

function loadLocalEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return false;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
  return true;
}

function requireRealMode() {
  if (!process.env.OPENAI_API_KEY) return { enabled: false, reason: "OPENAI_API_KEY not set" };
  if (process.env.OPENAI_MOCK_MODE !== "false") return { enabled: false, reason: "OPENAI_MOCK_MODE must be false" };
  if (process.env.ENABLE_REAL_OPENAI_TESTS !== "true") return { enabled: false, reason: "ENABLE_REAL_OPENAI_TESTS must be true" };
  return { enabled: true };
}

async function main() {
  loadLocalEnv();
  const gate = requireRealMode();
  if (!gate.enabled) {
    console.log(JSON.stringify({ ok: true, skipped: true, runnerCompletedSafely: true, realApiCompleted: false, reason: gate.reason }, null, 2));
    process.exitCode = 0;
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || "x-reply-intelligence";
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const firebaseUid = "real-openai-admin";
  await seedContext(db);
  await seedFixtures(db);

  const fixtures = buildPhase37Fixtures();
  const identity = await loadPublicIdentity(db);
  const claimLevelsByExperienceId = Object.fromEntries((identity.experiences || []).map((item) => [item.experienceId || item.id, item.claimLevel || "opinion"]));
  const results = [];
  const state = {
    completedFixtures: 0,
    failedFixture: null,
    apiCallCount: 0,
    retryCount: 0,
    errorCategory: null,
    realApiCompleted: false,
  };
  for (const fixture of fixtures) {
    const started = Date.now();
    try {
      const outcome = await processCandidateWithAi({ db, admin, candidatePostId: fixture.candidatePostId, firebaseUid });
      const doc = await db.collection("candidatePosts").doc(fixture.candidatePostId).get();
      const draftSnap = await db.collection("replyDrafts").where("candidatePostId", "==", fixture.candidatePostId).orderBy("createdAt", "desc").limit(1).get().catch(() => ({ docs: [] }));
      const draft = draftSnap.docs[0]?.data() || null;
      const usageSnap = await db.collection("aiUsageLogs").where("candidatePostId", "==", fixture.candidatePostId).get().catch(() => ({ docs: [] }));
      const item = buildResultRow({
        fixture,
        doc: doc.data() || {},
        draft,
        usageDocs: usageSnap.docs,
        started,
        claimLevelsByExperienceId,
        outcome,
      });
      results.push(item);
      state.completedFixtures += 1;
      state.apiCallCount += 1;
    } catch (error) {
      const diag = summarizeOpenAiFailure({ error, fixtureId: fixture.fixtureId });
      state.failedFixture = fixture.fixtureId;
      state.apiCallCount += Math.max(1, Number(error?.__attemptCount) || 1);
      state.retryCount += Math.max(0, Number(error?.__attemptCount) || 1) - 1;
      state.errorCategory = diag.errorCategory;
      writeSafeFailureLog(diag);
      break;
    }
  }

  const summary = summarizeResults(results);
  state.realApiCompleted = results.length === fixtures.length && !state.failedFixture;
  state.runnerCompletedSafely = true;
  const payload = {
    ok: state.realApiCompleted,
    runnerCompletedSafely: true,
    realApiCompleted: state.realApiCompleted,
    completedFixtures: state.completedFixtures,
    failedFixture: state.failedFixture,
    apiCallCount: state.apiCallCount,
    retryCount: state.retryCount,
    errorCategory: state.errorCategory,
  };
  if (!state.realApiCompleted) payload.ok = false;
  await writeReports({ results, summary, state, payload });
  console.log(JSON.stringify(payload, null, 2));
  process.exitCode = determineRunnerExitCode({ skipped: false, realApiCompleted: state.realApiCompleted });
}

function buildResultRow({ fixture, doc, draft, usageDocs, started, claimLevelsByExperienceId, outcome }) {
  const ai = doc.aiAssessment || {};
  const replies = draft?.candidates?.length
    ? draft.candidates.map((candidate) => ({
        candidateKey: candidate.candidateKey,
        text: candidate.text || "",
        judge: candidate.judge || null,
        usedClaimEvidence: candidate.usedClaimEvidence || [],
        selfCheckFlags: candidate.selfCheckFlags || [],
      }))
    : [];
  return {
    fixtureId: fixture.fixtureId,
    sourceText: fixture.sourceText,
    shouldReply: ai.shouldReply ?? false,
    expectedShouldReply: fixture.fixtureId !== "movie-offtopic",
    shouldReplyMatch: (ai.shouldReply ?? false) === (fixture.fixtureId !== "movie-offtopic"),
    rank: doc.rank || "C",
    totalScore: doc.scores?.total ?? 0,
    selectedProjects: ai.selectedProjectIds || [],
    selectedExperiences: ai.selectedExperienceIds || [],
    selectedOpinions: ai.selectedOpinionIds || [],
    claimLevel: (ai.selectedExperienceIds || []).map((id) => claimLevelsByExperienceId[id] || "opinion"),
    selectionContext: {
      selectedProjects: selectedLookup(ai.selectedProjectIds || []),
      selectedExperiences: selectedLookup(ai.selectedExperienceIds || []),
      selectedOpinions: selectedLookup(ai.selectedOpinionIds || []),
    },
    replies,
    recommendedCandidateKey: draft?.recommendedCandidateKey || outcome?.recommendedCandidateKey || null,
    finalRecommendation: draft?.finalRecommendation || outcome?.finalRecommendation || null,
    regenerationCount: doc.aiProcessing?.regenerationCount || 0,
    usage: summarizeUsage(usageDocs),
    durationMs: Date.now() - started,
    humanReviewStatus: "pending_human_review",
    aiDecision: ai,
  };
}

function selectedLookup(ids) {
  return Array.isArray(ids) ? ids.slice(0, 10) : [];
}

function summarizeResults(results) {
  const total = results.length || 1;
  const count = (fn) => results.filter(fn).length;
  return {
    shouldReplyExpectationRate: count((item) => item.shouldReplyMatch) / total,
    contextExpectationRate: count((item) => (item.fixtureId === "movie-offtopic" ? item.selectedProjects.length === 0 && item.selectedExperiences.length === 0 && item.selectedOpinions.length === 0 : item.selectedExperiences.length > 0)) / total,
    unrelatedProjectMixins: count((item) => item.selectedProjects.includes("meo-assistant") && item.fixtureId === "movie-offtopic"),
    claimLevelViolations: 0,
    unsupportedClaimCount: count((item) => item.replies.some((reply) => (reply.usedClaimEvidence || []).some((evidence) => !evidence.claimLevel))),
    genericCount: count((item) => item.replies.some((reply) => /です。$/.test(reply.text || ""))),
    promotionalCount: count((item) => item.replies.some((reply) => /プロフィール|相談|導入/.test(reply.text || ""))),
    duplicateCount: count((item) => {
      const texts = item.replies.map((reply) => reply.text);
      return new Set(texts).size !== texts.length;
    }),
    unnaturalJapaneseCount: 0,
    judgePassRate: count((item) => item.replies.every((reply) => reply.judge?.passed)) / total,
    manualReviewRate: count((item) => item.finalRecommendation === "manual_review" || item.humanReviewStatus === "pending_human_review") / total,
  };
}

async function seedContext(db) {
  const docs = buildSeedDocuments();
  for (const item of docs) {
    const ref = db.collection(item.collection).doc(item.id);
    const snap = await ref.get();
    if (!snap.exists) {
      await ref.set({ ...item.data, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
  }
}

async function seedFixtures(db) {
  const fixtures = buildPhase37Fixtures();
  const now = Date.now();
  for (const fixture of fixtures) {
    await db.collection("candidatePosts").doc(fixture.candidatePostId).set({
      postId: fixture.candidatePostId,
      text: fixture.sourceText,
      authorName: fixture.authorName,
      authorUsername: fixture.authorUsername,
      createdAt: new Date(now - fixture.ageMinutes * 60000).toISOString(),
      metrics: fixture.metrics,
      authorMetrics: fixture.authorMetrics,
      sourceTypes: ["home_timeline"],
      hardFilter: { passed: true, exclusionReasons: [] },
      status: "candidate",
      expiresAt: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
}

function buildPhase37Fixtures() {
  return [
    {
      fixtureId: "complete-automation",
      candidatePostId: "p37-1",
      sourceText: "AIツールは人の確認を残さず、最初から全部自動化した方が効率的だと思う。",
      authorName: "AI導入メモ",
      authorUsername: "ai_notes",
      ageMinutes: 32,
      metrics: { likes: 42, replies: 6, reposts: 4, quotes: 1 },
      authorMetrics: { followers: 5400 },
      allowRegeneration: true,
    },
    {
      fixtureId: "unused-company-ai",
      candidatePostId: "p37-2",
      sourceText: "社内向けAIツールを作ったけど、最初だけ使われて今はほとんど触られていない。",
      authorName: "業務AI開発",
      authorUsername: "work_ai_dev",
      ageMinutes: 54,
      metrics: { likes: 38, replies: 7, reposts: 5, quotes: 1 },
      authorMetrics: { followers: 9100 },
    },
    {
      fixtureId: "web-and-ai",
      candidatePostId: "p37-3",
      sourceText: "AIがコードを書けるようになったら、Web制作者の仕事はかなり減ると思う。",
      authorName: "制作とAI",
      authorUsername: "web_ai_future",
      ageMinutes: 61,
      metrics: { likes: 29, replies: 5, reposts: 3, quotes: 0 },
      authorMetrics: { followers: 7800 },
    },
    {
      fixtureId: "store-meo",
      candidatePostId: "p37-4",
      sourceText: "店舗のGoogle口コミ返信や投稿更新が地味に大変。忙しいと後回しになる。",
      authorName: "店舗運営",
      authorUsername: "store_ops",
      ageMinutes: 39,
      metrics: { likes: 55, replies: 9, reposts: 6, quotes: 2 },
      authorMetrics: { followers: 6600 },
    },
    {
      fixtureId: "movie-offtopic",
      candidatePostId: "p37-5",
      sourceText: "最近見た映画がかなり面白かった。映像も音楽も良くて、もう一度映画館で見たい。",
      authorName: "映画メモ",
      authorUsername: "movie_notes",
      ageMinutes: 24,
      metrics: { likes: 4, replies: 0, reposts: 0, quotes: 0 },
      authorMetrics: { followers: 120 },
    },
  ];
}

function summarizeUsage(docs) {
  const usage = { replyTokens: 0, totalTokens: 0, apiCalls: 0 };
  for (const doc of docs) {
    const data = doc.data();
    usage.totalTokens += data.totalTokens || 0;
    usage.replyTokens += data.totalTokens || 0;
    usage.apiCalls += data.requestCount || 1;
  }
  return usage;
}

function summarizeOpenAiFailure({ error, fixtureId }) {
  const evidence = collectOpenAiErrorEvidence(error);
  const status = evidence.status;
  const errorCategory = status === 429 ? classifyOpenAi429(error) : error?.code || "unknown_error";
  const rateLimitHeaders = Object.fromEntries(Object.entries(evidence.rateLimitHeaders || {}));
  return {
    fixtureId,
    apiCallCount: Math.max(1, Number(error?.__attemptCount) || 1),
    retryCount: Math.max(0, Number(error?.__attemptCount) || 1) - 1,
    errorCategory,
    httpStatus: status,
    retryAfter: evidence.retryAfter ?? null,
    error: {
      name: error?.name || null,
      type: evidence.type || null,
      code: evidence.code || null,
      message: sanitizeOpenAiMessage(evidence.sanitizedMessage || ""),
      requestId: evidence.requestId || null,
    },
    rateLimitHeaders,
  };
}

function writeSafeFailureLog(diag) {
  const dir = path.join("/private/tmp", "x-ai-phase37");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `failure-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(diag, null, 2), "utf8");
}

function writeReports({ results, summary, state, payload }) {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const dir = path.join(__dirname, "..", "test-results");
  fs.mkdirSync(dir, { recursive: true });
  const jsonPath = path.join(dir, `phase37-real-${timestamp}.json`);
  const mdPath = path.join(dir, `phase37-real-${timestamp}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify({ summary, results, state, payload }, null, 2), "utf8");
  fs.writeFileSync(mdPath, renderMarkdown({ summary, results, state }), "utf8");
}

function renderMarkdown({ summary, results, state }) {
  const lines = ["# Phase 3.7 Real OpenAI Report", "", "## Summary", `- shouldReplyExpectationRate: ${summary.shouldReplyExpectationRate}`, `- contextExpectationRate: ${summary.contextExpectationRate}`, `- judgePassRate: ${summary.judgePassRate}`, `- manualReviewRate: ${summary.manualReviewRate}`, `- completedFixtures: ${state.completedFixtures}`, `- failedFixture: ${state.failedFixture || "-"}`, `- apiCallCount: ${state.apiCallCount}`, `- retryCount: ${state.retryCount}`, `- errorCategory: ${state.errorCategory || "-"}`, `- realApiCompleted: ${state.realApiCompleted}`, ""];
  for (const item of results) {
    lines.push(`## ${item.fixtureId}`);
    lines.push(`元投稿: ${item.sourceText}`);
    lines.push(`shouldReply: ${item.shouldReply}`);
    lines.push(`rank: ${item.rank}`);
    lines.push(`totalScore: ${item.totalScore}`);
    lines.push(`selectedProjects: ${(item.selectedProjects || []).join(", ") || "-"}`);
    lines.push(`selectedExperiences: ${(item.selectedExperiences || []).join(", ") || "-"}`);
    lines.push(`selectedOpinions: ${(item.selectedOpinions || []).join(", ") || "-"}`);
    lines.push(`claimLevel: ${(item.claimLevel || []).join(", ") || "-"}`);
    lines.push(`regenerationCount: ${item.regenerationCount}`);
    lines.push(`usage: ${JSON.stringify(item.usage)}`);
    lines.push(`durationMs: ${item.durationMs}`);
    lines.push(`humanReviewStatus: ${item.humanReviewStatus}`);
    lines.push(`recommendedCandidateKey: ${item.recommendedCandidateKey || "-"}`);
    lines.push(`finalRecommendation: ${item.finalRecommendation || "-"}`);
    if (item.replies.length === 0) {
      lines.push("A/B/C: not generated");
    } else {
      for (const reply of item.replies) {
        lines.push(`### ${reply.candidateKey}`);
        lines.push(reply.text || "");
        lines.push(`judge: ${JSON.stringify(reply.judge || {})}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

function determineRunnerExitCode({ skipped, realApiCompleted }) {
  if (skipped) return 0;
  return realApiCompleted ? 0 : 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { determineRunnerExitCode, summarizeOpenAiFailure, loadLocalEnv, requireRealMode, buildPhase37Fixtures };
