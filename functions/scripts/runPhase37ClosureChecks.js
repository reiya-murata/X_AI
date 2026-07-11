const assert = require("node:assert/strict");
const { deprecatedAiCallable } = require("../src/phase3/deprecatedCallables");
const client = require("../src/openai/client");

process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
process.env.OPENAI_MOCK_MODE = "false";

async function main() {
  const cases = [
    "assessCandidateWithAi",
    "generateReplyDraftWithAi",
    "regenerateReplyDraftWithAi",
  ];

  for (const name of cases) {
    const fn = deprecatedAiCallable(name);
    await assert.rejects(() => fn(), (error) => {
      assert.equal(error.code, "failed-precondition");
      assert.match(error.message, /processCandidateWithAi/);
      assert.equal(error.details.callable, name);
      return true;
    });
  }

  assert.equal(typeof client.classifyOpenAi429, "function");

  const fakeDb = new FakeDb(seedDocs());
  const analysisClient = require("../src/phase3/analysis");
  const originalGetOpenAiClient = client.getOpenAiClient;
  const originalRunModeration = client.runModeration;
  let apiCalls = 0;
  client.getOpenAiClient = () => ({
    responses: {
      create: async () => {
        apiCalls += 1;
        return {
          id: "resp-test",
          _request_id: "req-test",
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
          output_parsed: {
            shouldReply: true,
            decisionSummary: "運用設計に接続できます。",
            primaryTopic: "ai_business_improvement",
            scores: { relevance: 88, replyValue: 84, profileConversion: 76 },
            selectedProjectIds: [],
            selectedExperienceIds: [],
            selectedOpinionIds: [],
            selectedWriterInstructionIds: [],
            riskFlags: [],
            replies: {
              A: { candidateKey: "A", text: "更新の流れまで見ているのが大事ですね。運用が止まりにくいです。", usedClaimEvidence: [], selfCheckFlags: [] },
              B: { candidateKey: "B", text: "未回答を拾って改善へ戻す形が効きます。現場で回しやすいです。", usedClaimEvidence: [], selfCheckFlags: [] },
              C: { candidateKey: "C", text: "人の確認を少し残す方が回しやすいです。無理なく続けやすいです。", usedClaimEvidence: [], selfCheckFlags: [] },
            },
            recommendedCandidateKey: "B",
            finalRecommendation: "ready",
          },
        };
      },
    },
  });
  client.runModeration = async () => { throw new Error("moderation should not be called"); };

  const result = await analysisClient.processCandidateWithAi({
    db: fakeDb,
    admin: fakeAdmin(),
    candidatePostId: "p1",
    firebaseUid: "uid-1",
  });
  assert.equal(apiCalls, 1);
  assert.equal(result.finalRecommendation, "ready");
  assert.ok(fakeDb.getWriteCount() > 0);

  client.getOpenAiClient = originalGetOpenAiClient;
  client.runModeration = originalRunModeration;

  console.log(JSON.stringify({
    ok: true,
    deprecatedCallables: cases.length,
    apiCalls,
    writeCount: fakeDb.getWriteCount(),
  }, null, 2));
}

function seedDocs() {
  return {
    creatorProfiles: {
      "reiya-public-x": {
        profileId: "reiya-public-x",
        displayName: "れいちぇる｜Web×AIツール開発",
        positioning: "Web制作出身のAI業務改善ツール開発者。",
        targetAudiences: ["個人事業主"],
      },
    },
    writingRules: {
      "sei-x-writing-v1": {
        ruleSetId: "sei-x-writing-v1",
        replyRules: { minCharacters: 60, maxCharacters: 180, requireOriginalPostConnection: true },
        isActive: true,
      },
    },
    experienceLibrary: {
      "exp-live-manual-ai": {
        experienceId: "exp-live-manual-ai",
        projectId: "live-manual-ai",
        title: "社内FAQ・マニュアルAI",
        categories: ["AIツール開発"],
        relatedKeywords: ["AI", "更新", "改善"],
        claimLevel: "implemented",
        usableClaims: ["未回答を拾って改善する"],
        prohibitedClaims: [],
        publicUseAllowed: true,
        useForReply: true,
        priority: 1,
      },
    },
    opinionLibrary: {
      "op-ai-small-bottleneck": {
        opinionId: "op-ai-small-bottleneck",
        category: "AIツール開発",
        statement: "1つのボトルネックを減らす方が成功しやすい。",
        publicUseAllowed: true,
        isActive: true,
      },
    },
    writerInstructions: {
      "writer-rule-1": {
        instructionId: "writer-rule-1",
        instruction: "宣伝臭を抑える。",
        useForGeneration: true,
        publicUseAllowed: true,
      },
    },
    recentContent: {},
    candidatePosts: {
      p1: {
        postId: "p1",
        text: "社内FAQは未回答を拾って改善へ戻す流れがないと、導入後に止まりがちです。",
        authorName: "AI業務改善メモ",
        authorUsername: "ai_ops_note",
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        metrics: { likes: 10, replies: 2, reposts: 1, quotes: 0 },
        authorMetrics: { followers: 1000 },
        hardFilter: { passed: true },
        status: "candidate",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    },
    replyDrafts: {},
    aiUsageLogs: {},
  };
}

class FakeDb {
  constructor(seed) {
    this.seed = seed;
    this.writeCount = 0;
  }

  getWriteCount() {
    return this.writeCount;
  }

  collection(name) {
    return new FakeCollection(this, name);
  }

  batch() {
    return {
      set: () => { this.writeCount += 1; },
      commit: async () => {},
    };
  }

  async runTransaction(fn) {
    return fn({
      get: async (ref) => ref.get(),
      set: (ref, data, options) => ref.set(data, options),
    });
  }
}

class FakeCollection {
  constructor(db, name) {
    this.db = db;
    this.name = name;
  }

  doc(id) {
    return new FakeDoc(this.db, this.name, id);
  }

  async get() {
    return { docs: Object.entries(this.db.seed[this.name] || {}).map(([id, data]) => new FakeSnap(this.db, this.name, id, data)), size: 0 };
  }

  where() { return this; }
  orderBy() { return this; }
  limit() { return this; }

  async add(data) {
    this.db.writeCount += 1;
    const id = `auto-${Object.keys(this.db.seed[this.name] || {}).length + 1}`;
    this.db.seed[this.name] = this.db.seed[this.name] || {};
    this.db.seed[this.name][id] = data;
    return { id };
  }
}

class FakeDoc {
  constructor(db, name, id) {
    this.db = db;
    this.name = name;
    this.id = id;
  }

  async get() {
    const data = this.db.seed[this.name]?.[this.id];
    return new FakeSnap(this.db, this.name, this.id, data);
  }

  async set(data) {
    this.db.writeCount += 1;
    this.db.seed[this.name] = this.db.seed[this.name] || {};
    this.db.seed[this.name][this.id] = { ...(this.db.seed[this.name][this.id] || {}), ...data };
  }
}

class FakeSnap {
  constructor(db, name, id, data) {
    this.ref = new FakeDoc(db, name, id);
    this._data = data;
    this.exists = Boolean(data);
  }

  data() {
    return this._data;
  }
}

function fakeAdmin() {
  const firestoreFn = function firestore() {
    return {
      runTransaction: async (fn) => fn({
        get: async (ref) => ref.get(),
        set: (ref, data, options) => ref.set(data, options),
      }),
    };
  };
  firestoreFn.FieldValue = { serverTimestamp: () => new Date().toISOString() };
  return { firestore: firestoreFn };
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
