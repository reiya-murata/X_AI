const { qualityFixtures } = require("./phase3/qualityFixtureData");

function buildSeedDocuments() {
  const creatorProfile = {
    profileId: "reiya-public-x",
    displayName: "れいちぇる｜Web×AIツール開発",
    handle: "Rachel_hkz",
    positioning: "Web制作出身のAI業務改善ツール開発者。実際の業務へ落とし込み、運用・改善まで実装する人。",
    targetAudiences: ["個人事業主", "小規模事業者", "店舗経営者", "Web制作者", "SNS運用担当者"],
    desiredPerception: ["実際にツールを作っている", "Web制作と業務理解の両方がある", "AIを現実的な仕組みに変えられる"],
    coreSkills: ["React", "Vite", "Firebase", "OpenAI API", "Web制作", "業務フロー設計"],
    publicOnly: true,
    version: 1,
  };

  const experiences = [
    {
      experienceId: "exp-live-manual-ai",
      projectId: "live-manual-ai",
      title: "社内FAQ・マニュアルAI",
      description: "社内FAQ・マニュアル・業務ルールをAIが参照し、スタッフの質問へ回答するシステム",
      categories: ["社内FAQ", "マニュアル", "業務改善", "ナレッジ共有", "AIツール開発"],
      relatedKeywords: ["FAQ", "マニュアル", "未回答", "ナレッジ", "改善ループ"],
      claimLevel: "implemented",
      usableClaims: ["未回答ログからマニュアルを改善する仕組みが必要"],
      prohibitedClaims: ["導入企業で成果が出た"],
      useForReply: true,
      useForOriginalPost: true,
      publicUseAllowed: true,
      priority: 1,
    },
    {
      experienceId: "exp-threads-ai",
      projectId: "threads-ai",
      title: "SNS運用AI",
      description: "戦略、投稿生成、承認、予約、実投稿、分析、改善を管理するSNS運用AI",
      categories: ["SNS運用", "Threads", "AI自動化", "投稿生成", "AIツール開発"],
      relatedKeywords: ["SNS", "Threads", "承認", "投稿分析", "Strategy"],
      claimLevel: "verified",
      usableClaims: ["完全自動より人間確認を残した半自動運用の方が安全"],
      prohibitedClaims: ["大規模アカウントで成果を出した"],
      useForReply: true,
      useForOriginalPost: true,
      publicUseAllowed: true,
      priority: 2,
    },
    {
      experienceId: "exp-meo-assistant",
      projectId: "meo-assistant",
      title: "店舗向けMEO運用AI",
      description: "Googleビジネスプロフィールの投稿、口コミ返信、写真依頼、月次改善を支援するシステム",
      categories: ["店舗運営", "MEO", "Googleビジネスプロフィール", "口コミ返信", "業務改善"],
      relatedKeywords: ["店舗", "口コミ", "返信", "MEO", "Google", "写真", "運用"],
      claimLevel: "in_development",
      usableClaims: ["口コミ返信や写真依頼を運用ループとして設計している"],
      prohibitedClaims: ["店舗で導入して成果が出た"],
      useForReply: true,
      useForOriginalPost: true,
      publicUseAllowed: true,
      priority: 3,
    },
    {
      experienceId: "exp-ai-sales-researcher",
      projectId: "ai-sales-researcher",
      title: "営業リスト作成AI",
      description: "営業リスト収集、検索、抽出、分析を段階分けして回すリサーチ支援AI",
      categories: ["営業", "リサーチ", "AI業務改善", "Google Sheets"],
      relatedKeywords: ["営業", "リサーチ", "リード", "抽出", "分析", "Sheets"],
      claimLevel: "planned",
      usableClaims: ["段階を分けて検証しながら進めている"],
      prohibitedClaims: ["受注率が上がった"],
      useForReply: true,
      useForOriginalPost: true,
      publicUseAllowed: true,
      priority: 4,
    },
  ];

  const opinions = [
    {
      opinionId: "op-ai-small-bottleneck",
      category: "AIツール開発",
      statement: "全部を自動化するより、1つのボトルネックを減らす方が成功しやすいです。",
      supportingExperienceIds: ["exp-live-manual-ai"],
      tone: "practical",
      publicUseAllowed: true,
      isActive: true,
    },
    {
      opinionId: "op-approval-loop",
      category: "SNS運用",
      statement: "完全自動投稿より、人間承認を残した半自動運用の方が現実的です。",
      supportingExperienceIds: ["exp-threads-ai"],
      tone: "neutral",
      publicUseAllowed: true,
      isActive: true,
    },
    {
      opinionId: "op-meo-light",
      category: "MEO",
      statement: "口コミ返信はテンプレート化より、店ごとの文脈を少し残した方が自然です。",
      supportingExperienceIds: ["exp-meo-assistant"],
      tone: "practical",
      publicUseAllowed: true,
      isActive: true,
    },
    {
      opinionId: "op-research-phased",
      category: "営業",
      statement: "営業系の自動化は一気通貫より、探索・抽出・分析を分ける方が安定します。",
      supportingExperienceIds: ["exp-ai-sales-researcher"],
      tone: "practical",
      publicUseAllowed: true,
      isActive: true,
    },
  ];

  const writingRules = {
    ruleSetId: "sei-x-writing-v1",
    replyRules: {
      minCharacters: 60,
      maxCharacters: 180,
      requireOriginalPostConnection: true,
      maxProjectMentions: 1,
      allowHashtags: false,
      allowLinks: false,
      allowUnverifiedClaims: false,
    },
    originalPostRules: {
      preferredLength: "short_to_medium",
      requireExperienceOrSpecificInsight: true,
      allowHashtags: false,
      avoidGreetingIntro: true,
    },
    prohibitedExpressions: ["勉強になります", "参考になります", "詳しくはプロフィールへ", "完全自動化すればよい"],
    coreChecks: ["AIツール開発者らしい内容か", "実際の開発・検証経験を使えるか"],
    version: 1,
    isActive: true,
  };

  return [
    { collection: "creatorProfiles", id: creatorProfile.profileId, data: creatorProfile },
    ...experiences.map((item) => ({ collection: "experienceLibrary", id: item.experienceId, data: item })),
    ...opinions.map((item) => ({ collection: "opinionLibrary", id: item.opinionId, data: item })),
    { collection: "writingRules", id: writingRules.ruleSetId, data: writingRules },
    {
      collection: "searchProfiles",
      id: "home-timeline-primary",
      data: {
        searchProfileId: "home-timeline-primary",
        name: "ホームタイムライン",
        source: "home_timeline",
        prompt: null,
        keywords: [],
        listId: null,
        intervalMinutes: 30,
        maxResults: 80,
        activeHoursJst: { start: "08:00", end: "23:30" },
        isActive: true,
      },
    },
    {
      collection: "filterRuleSets",
      id: "x-hard-filter-v1",
      data: {
        filterRuleSetId: "x-hard-filter-v1",
        minimumTextLength: 20,
        maxAgeHours: 6,
        minimumImpressions: 10000,
        allowedLanguages: ["ja"],
        excludeSensitive: true,
        excludedKeywords: ["フォロー&リポスト", "フォロー＆リポスト", "プレゼント企画", "フォロバ", "仮想通貨", "爆益", "成人向け"],
        blockedAuthorIds: [],
        version: 1,
      },
    },
    {
      collection: "watchListSettings",
      id: "default_sample_list",
      data: {
        listId: "1234567890123456789",
        name: "監視リスト サンプル",
        enabled: false,
        maxPagesPerSync: 2,
        lastSinceId: null,
        lastSyncedAt: null,
      },
    },
    {
      collection: "writerInstructions",
      id: "writer-rule-1",
      data: {
        instructionId: "writer-rule-1",
        source: "human",
        instruction: "宣伝臭を抑えて、元投稿の文脈に直接反応する。",
        useFor: "reply",
        useForGeneration: true,
        adoptedAt: null,
        createdAt: new Date().toISOString(),
      },
    },
    {
      collection: "recentContent",
      id: "recent-reply-1",
      data: {
        contentId: "recent-reply-1",
        contentType: "reply",
        text: "AIは導入よりも、誰が更新して改善へ戻すかを決める方が大事。",
        topic: "ai_business_improvement",
        angle: "structure_explanation",
        usedProjectIds: ["live-manual-ai"],
        usedExperienceIds: ["exp-live-manual-ai"],
        usedOpinionIds: ["op-ai-small-bottleneck"],
        embedding: null,
        publishedAt: new Date().toISOString(),
      },
    },
    ...buildPhase4WorkflowDocuments(),
    ...qualityFixtures.map((fixture) => ({
      collection: "qualityFixtures",
      id: fixture.id,
      data: fixture,
    })),
  ];
}

function buildPhase4WorkflowDocuments() {
  const states = ["discovered", "ready", "needs_review", "edited", "intent_opened", "sent_manual", "dismissed", "generation_failed"];
  return states.flatMap((workflowStatus, stateIndex) => [1, 2].flatMap((number) => {
    const suffix = `${stateIndex + 1}${number}`;
    const postId = `18400000000000000${suffix.padStart(2, "0")}`;
    const replyDraftId = `phase4-draft-${workflowStatus}-${number}`;
    const text = stateIndex % 2 === 0
      ? `架空投稿です。AIを業務へ入れるなら、生成だけでなく確認と改善の流れまで決めることが大切だと感じています。${number}`
      : `架空のWeb制作者として、AIを制作工程へどう組み込むかを検証しています。人が確認する工程は残したいです。${number}`;
    const reply = "生成機能だけでなく、確認と改善の戻り道まで決めると、現場でも続けやすくなりますね。";
    const candidate = {
      collection: "candidatePosts", id: postId, data: {
        postId, postUrl: `https://x.com/phase4_sample_${number}/status/${postId}`, authorId: `phase4-author-${suffix}`,
        authorUsername: `phase4_sample_${suffix}`, authorName: `架空の運用担当 ${suffix}`, text, language: "ja",
        metrics: { likes: 10 + stateIndex, replies: number, reposts: 2, quotes: 0, impressions: 12000 + stateIndex * 700 + number * 250 }, authorMetrics: { followers: 300 + stateIndex * 100 },
        sourceTypes: number === 1 ? ["home_timeline"] : ["watch_list"], hardFilter: { passed: true, exclusionReasons: [] }, status: "candidate",
        workflowVersion: 1, workflowStatus, statusHistory: [], latestReplyDraftId: workflowStatus === "discovered" || workflowStatus === "generation_failed" ? null : replyDraftId,
        recommendedCandidateKey: "A", recommendedReplyText: reply, finalReplyText: ["edited", "intent_opened", "sent_manual"].includes(workflowStatus) ? `${reply} 人の確認も大切です。` : "",
        pendingSendConfirmation: workflowStatus === "intent_opened", rank: stateIndex < 3 ? "A" : "B", scores: { total: 82 - stateIndex },
        aiDecision: { generationReason: "ローカル運用確認用", claimLevel: stateIndex === 2 ? "medium" : "low", warnings: workflowStatus === "needs_review" ? ["強い断定を確認してください"] : [], selectedContextIds: ["op-approval-loop"], codeChecks: { lengthPassed: true, prohibitedExpressionPassed: true, similarityPassed: true } },
      },
    };
    if (!candidate.data.latestReplyDraftId) return [candidate];
    return [candidate, { collection: "replyDrafts", id: replyDraftId, data: { replyDraftId, candidatePostId: postId, schemaVersion: 1, isCurrent: true, status: "ready", recommendedCandidateKey: "A", selectedCandidateKey: null, editedText: candidate.data.finalReplyText || null, candidates: [{ candidateKey: "A", text: reply, selfCheckFlags: [] }], models: { reply: "local-mock" }, usage: { apiCallCount: 0 }, generationReason: "ローカル運用確認用" } }];
  }));
}

module.exports = { buildSeedDocuments };
