import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  Clipboard,
  ClipboardList,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link,
  ListFilter,
  MessageSquareReply,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Unplug,
  X,
} from "lucide-react";
import "./styles.css";
import { seedData } from "./seedData";
import { humanEvaluationTags, qualityFixtures } from "./qualityFixtureData";
import { generateLocalReplyTest } from "./services/replyGenerator";
import { openXReply } from "./services/xIntent";
import { subscribeQualityEvaluations } from "./services/qualityEvaluations";
import {
  processCandidateBatchWithAi,
  processCandidateWithAi,
  saveReplyDraftSelection,
  saveHumanQualityEvaluation,
} from "./services/xPhase3Api";
import {
  beginXOAuth,
  disconnectX,
  fetchHomeTimelineNow,
  fetchWatchListTimelineNow,
  getSyncOverview,
  getXConnectionStatus,
  listCandidatePosts,
  saveWatchListSetting,
} from "./services/xPhase2Api";
import { clientEnvironment, environmentSafety, forceLocalAdminSession, getLocalAdminCredentials, hasLocalAdminBootstrapAttempted, loginWithEmail, logout, markLocalAdminBootstrapAttempted, runtimeInfo, shouldUseLocalQualityMode, watchAuth, firebaseEnabled } from "./lib/firebase";
import { subscribeCandidatePosts, subscribeExcludedPosts } from "./services/firestoreCandidates";
import { buildHumanEditDiff, filterQualityEvaluations, formatMaybeScore, summarizeQualityEvaluations } from "./qualityAnalysis";
import { getPhase4OperationsSummary, getProductionReadiness, recordManualSendResult, recordReplyIntentOpened, saveReplyOutcomeMetrics, saveWorkflowReplyDraft, transitionCandidateWorkflow } from "./services/phase4Workflow";
import { claimLevelLabels, feedbackLabels, formatWorkflowStatus, hasCurrentGenerationWarnings, hasUsableReplyDraft, normalizeWorkflowStatus, notSentReasonLabels, resolveDisplayedWorkflowStatus, workflowStatusLabels } from "./phase4Labels";
import { formatOperationalError } from "./operationalErrors";
import {
  formatCandidateLabel,
  formatCandidateSourceTypeLabel,
  formatCategoryLabel,
  formatDecisionLabel,
  formatOriginLabel,
  formatSourceTypeLabel,
  formatVersionLabel,
  scoreLabels,
} from "./qualityLabels";

const baseTabs = [
  { id: "dashboard", label: "候補", icon: MessageSquareReply },
  { id: "excluded", label: "除外一覧", icon: ListFilter },
  { id: "test", label: "生成テスト", icon: Sparkles },
  { id: "identity", label: "発信プロフィール", icon: Settings },
  { id: "analysis", label: "分析", icon: BarChart3 },
  { id: "readiness", label: "本番準備", icon: ShieldCheck },
];

function shouldShowQualityLab() {
  const hostname = window.location.hostname;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const isEmulator = import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
  const isDemoProject = String(import.meta.env.VITE_FIREBASE_PROJECT_ID || runtimeInfo.projectId || "").startsWith("demo-");
  const isLocalLabEnabled = import.meta.env.VITE_ENABLE_QUALITY_LAB === "true";
  return isLocalHost && isEmulator && isDemoProject && isLocalLabEnabled;
}

function App() {
  const qualityLabEnabled = shouldShowQualityLab();
  const tabs = useMemo(() => (qualityLabEnabled ? [...baseTabs, { id: "quality", label: "品質", icon: ClipboardList }] : baseTabs), [qualityLabEnabled]);
  const [activeTab, setActiveTab] = useState(() => getInitialTab(qualityLabEnabled));
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [authState, setAuthState] = useState({ user: null, admin: false, loading: firebaseEnabled, error: null });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [localAuthStatus, setLocalAuthStatus] = useState("");
  const [localAuthError, setLocalAuthError] = useState("");
  const [localAuthPhase, setLocalAuthPhase] = useState("idle");
  const [localAuthFailureStage, setLocalAuthFailureStage] = useState("");
  const localAuthPhaseRef = useRef("idle");
  const [connection, setConnection] = useState(null);
  const [syncOverview, setSyncOverview] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [excluded, setExcluded] = useState([]);
  const [listId, setListId] = useState("1234567890123456789");
  const [listName, setListName] = useState("監視リスト");
  const [testPost, setTestPost] = useState("AIツールは導入した直後より、社内で誰が更新するか決めていない時に止まりがち。");
  const [testResult, setTestResult] = useState(() => generateLocalReplyTest(testPost));
  const [aiBusyId, setAiBusyId] = useState("");
  const [replyDraftLookup, setReplyDraftLookup] = useState({});
  const [humanEvalForm, setHumanEvalForm] = useState({
    candidatePostId: "",
    replyDraftId: "",
    candidateKey: "A",
    wouldPost: true,
    requiredEditLevel: "minor",
    overallDecision: "pending",
    sourceType: "fixture",
    generationVersion: "mock",
    promptVersion: "mock",
    contextSelectorVersion: "mock",
    codeCheckVersion: "mock",
    rejectionReasons: [],
    editReasons: [],
    feedbackTags: [],
    humanEditedText: "",
    evaluatorNotes: "",
    humanMemo: "",
  });
  const [qualityCategory, setQualityCategory] = useState("all");
  const [qualityDecision, setQualityDecision] = useState("all");
  const [qualityOnlyPending, setQualityOnlyPending] = useState(true);
  const [qualityOnlyEdited, setQualityOnlyEdited] = useState(false);
  const [qualitySelection, setQualitySelection] = useState(qualityFixtures[0]);
  const [qualityEvaluations, setQualityEvaluations] = useState([]);
  const [qualityCandidateFilter, setQualityCandidateFilter] = useState("all");
  const [qualityGoodTagFilter, setQualityGoodTagFilter] = useState("all");
  const [qualityBadTagFilter, setQualityBadTagFilter] = useState("all");
  const [qualitySourceFilter, setQualitySourceFilter] = useState("all");
  const [qualityVersionFilter, setQualityVersionFilter] = useState("all");
  const [qualityOriginMode, setQualityOriginMode] = useState("human");

  useEffect(() => {
    const unsubscribe = watchAuth((next) => {
      if (shouldUseLocalQualityMode() && localAuthPhaseRef.current !== "ready") {
        const localEmail = getLocalAdminCredentials().email;
        const isLocalAdmin = next.user?.email === localEmail && next.admin === true;
        if (!isLocalAdmin) {
          setAuthState((current) => ({ ...current, user: null, admin: false, loading: true, error: null }));
          return;
        }
      }
      setAuthState(next);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    localAuthPhaseRef.current = localAuthPhase;
  }, [localAuthPhase]);

  useEffect(() => {
    if (!qualityLabEnabled && activeTab === "quality") {
      setActiveTab("dashboard");
    }
  }, [activeTab, qualityLabEnabled]);

  useEffect(() => {
    if (!shouldUseLocalQualityMode()) return () => {};
    let cancelled = false;
    const stageMessage = {
      auth_wait: "Firebase Auth 初期化を確認しています。",
      sign_out: "古いセッションを切り替えています。",
      sign_in: "開発用管理者で接続しています。",
      token_refresh: "管理者権限を更新しています。",
      admin_claim_check: "管理者権限を確認しています。",
    };
    async function run() {
      if (hasLocalAdminBootstrapAttempted()) return;
      markLocalAdminBootstrapAttempted(true);
      setLocalAuthPhase("preparing");
      setLocalAuthError("");
      setLocalAuthStatus("ローカル評価環境を準備しています");
      setAuthState((current) => ({ ...current, loading: true }));
      try {
        const result = await forceLocalAdminSession({
          onStage: (stage) => {
            if (cancelled) return;
            console.info(`[local-auth] ${stage}`);
            setLocalAuthPhase(stage);
            setLocalAuthStatus(stageMessage[stage] || "ローカル評価環境を準備しています");
            setAuthState((current) => ({ ...current, loading: true, error: null }));
          },
        });
        if (cancelled) return;
        setAuthState((current) => ({ ...current, user: result.user, admin: result.admin, loading: false, error: null }));
        setLocalAuthStatus("開発用管理者で接続しています");
        setLocalAuthPhase("ready");
      } catch (error) {
        if (cancelled) return;
        console.info(`[local-auth] failed ${localAuthPhase || "unknown"}`);
        setLocalAuthError(error.message || "ローカル管理者ログインに失敗しました");
        setLocalAuthFailureStage(localAuthPhase);
        setLocalAuthStatus("");
        setLocalAuthPhase("error");
        setAuthState((current) => ({ ...current, loading: false, error }));
        markLocalAdminBootstrapAttempted(false);
      }
    }
    if (localAuthPhase !== "ready") {
      run();
    }
    return () => {
      cancelled = true;
    };
  }, [localAuthPhase]);

  useEffect(() => {
    if (!firebaseEnabled) {
      refreshAll();
      return () => {};
    }
    if (!authState.user || !authState.admin) return () => {};
    refreshMeta();
    const unsubscribeCandidates = subscribeCandidatePosts({
      onNext: setCandidates,
      onError: (error) => notify(error.message || "候補の購読に失敗しました"),
    });
    const unsubscribeExcluded = subscribeExcludedPosts({
      onNext: setExcluded,
      onError: (error) => notify(error.message || "除外一覧の購読に失敗しました"),
    });
    const unsubscribeEvaluations = subscribeQualityEvaluations({
      onNext: setQualityEvaluations,
      onError: (error) => notify(error.message || "評価履歴の購読に失敗しました"),
    });
    return () => {
      unsubscribeCandidates();
      unsubscribeExcluded();
      unsubscribeEvaluations();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authState.user, authState.admin]);

  const stats = useMemo(() => {
    const sourceCount = new Set(candidates.flatMap((item) => item.sourceTypes || [])).size;
    const lastState = syncOverview?.states?.[0];
    return [
      { label: "表示候補", value: candidates.length, status: "一次フィルター通過" },
      { label: "除外投稿", value: excluded.length, status: "Debugで確認" },
      { label: "取得元", value: sourceCount, status: "重複は投稿IDで統合" },
      { label: "前回保存", value: lastState?.lastSavedCount ?? 0, status: lastState?.lastErrorCode || "エラーなし" },
    ];
  }, [candidates, excluded, syncOverview]);

  const qualitySummary = useMemo(
    () => summarizeQualityEvaluations(qualityEvaluations, qualityFixtures, { mode: qualityOriginMode, includeLegacyUnknown: false }),
    [qualityEvaluations, qualityOriginMode],
  );

  const autoLoginActive = shouldUseLocalQualityMode();
  const showingLocalBootstrap = autoLoginActive && localAuthPhase !== "ready";
  const topbarUserLabel = showingLocalBootstrap ? localAuthStatus || "ローカル評価環境を準備しています" : (authState.user ? `${authState.user.email || authState.user.uid}` : "未ログイン");
  const topbarAdminLabel = showingLocalBootstrap ? "admin確認中" : (authState.admin ? "admin" : "adminなし");

  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  async function refreshAll() {
    setLoading(true);
    try {
      const [status, overview, posts] = await Promise.all([
        getXConnectionStatus(),
        getSyncOverview(),
        listCandidatePosts(),
      ]);
      setConnection(status);
      setSyncOverview(overview);
      setCandidates(posts.candidates || []);
      setExcluded(posts.excluded || []);
    } catch (error) {
      notify(error.message || "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function refreshMeta() {
    setLoading(true);
    try {
      const [status, overview] = await Promise.all([
        getXConnectionStatus(),
        getSyncOverview(),
      ]);
      setConnection(status);
      setSyncOverview(overview);
    } catch (error) {
      notify(error.message || "接続状態の読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAuthError("");
    setLoading(true);
    try {
      await loginWithEmail(loginForm.email, loginForm.password);
    } catch (error) {
      setAuthError(error.message || "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await logout();
    setCandidates([]);
    setExcluded([]);
    setConnection(null);
    setSyncOverview(null);
  }

  async function handleBeginOAuth() {
    const result = await beginXOAuth();
    if (result.authorizationUrl) {
      window.location.href = result.authorizationUrl;
    }
  }

  async function handleDisconnect() {
    await disconnectX();
    notify("X接続を解除しました");
    refreshAll();
  }

  async function handleFetchHome() {
    setLoading(true);
    try {
      const result = await fetchHomeTimelineNow();
      notify(`ホーム取得: 保存${result.savedCount}件 / 除外${result.excludedCount}件`);
      await refreshAll();
    } catch (error) {
      notify(formatOperationalError(error, "ホームタイムライン取得に失敗しました。X接続を確認してください。"));
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchList() {
    setLoading(true);
    try {
      await saveWatchListSetting({ listId, name: listName, enabled: true });
      const result = await fetchWatchListTimelineNow(listId);
      notify(`リスト取得: 保存${result.savedCount}件 / 除外${result.excludedCount}件`);
      await refreshAll();
    } catch (error) {
      notify(formatOperationalError(error, "監視リスト取得に失敗しました。X接続とリストIDを確認してください。"));
    } finally {
      setLoading(false);
    }
  }

  const handleGenerate = () => {
    setTestResult(generateLocalReplyTest(testPost));
    notify("生成テストを更新しました");
  };

  async function handleAiAction(candidate, action) {
    setAiBusyId(candidate.postId);
    try {
      let result;
      if (action === "process") {
        await transitionCandidateWorkflow({ candidatePostId: candidate.postId, to: "queued" });
        await transitionCandidateWorkflow({ candidatePostId: candidate.postId, to: "generating" });
        try {
          result = await processCandidateWithAi({ candidatePostId: candidate.postId });
        } catch (error) {
          await transitionCandidateWorkflow({ candidatePostId: candidate.postId, to: "generation_failed" }).catch(() => {});
          throw error;
        }
      } else if (action === "manual") {
        result = await saveReplyDraftSelection({
          candidatePostId: candidate.postId,
          replyDraftId: candidate.replyDraftId || candidate.latestReplyDraftId || "",
          selectedCandidateKey: candidate.recommendedCandidateKey || "A",
          editedText: candidate.recommendedReplyText || candidate.text,
          humanMemo: "manual_review",
        });
      }
      if (result) {
        setReplyDraftLookup((current) => ({ ...current, [candidate.postId]: result }));
      }
      notify("AI処理を実行しました");
      await refreshAll();
    } catch (error) {
      notify(formatOperationalError(error, "返信案の生成に失敗しました。ローカルモック設定またはOpenAI設定を確認してください。"));
    } finally {
      setAiBusyId("");
    }
  }

  async function handleBatchAi(limit = 10) {
    setLoading(true);
    try {
      const result = await processCandidateBatchWithAi({ limit });
      notify(`一括処理: ${result.processed}件`);
      await refreshAll();
    } catch (error) {
      notify(formatOperationalError(error, "一括処理に失敗しました。失敗した候補の状態を確認して再試行してください。"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveHumanEval(event) {
    event.preventDefault();
    setLoading(true);
    try {
      const selectedFixture = qualitySelection || qualityFixtures[0];
      const selectedReply = selectedFixture.mockReplies?.find((item) => item.id === humanEvalForm.candidateKey) || selectedFixture.mockReplies?.[0] || { text: "" };
      const result = await saveHumanQualityEvaluation({
        ...humanEvalForm,
        candidatePostId: humanEvalForm.candidatePostId || selectedFixture.id,
        replyDraftId: humanEvalForm.replyDraftId || `${selectedFixture.id}-reply`,
        fixtureId: selectedFixture.id,
        candidateId: humanEvalForm.candidateKey,
        originalReplyText: selectedReply.text || "",
        goodTags: (humanEvalForm.feedbackTags || []).filter((tag) => humanEvaluationTags.good.includes(tag)),
        badTags: (humanEvalForm.feedbackTags || []).filter((tag) => humanEvaluationTags.bad.includes(tag)),
        scores: {
          originalPostRelevance: Number(humanEvalForm.scores?.originalPostRelevance || 80),
          reiyaSpecificity: Number(humanEvalForm.scores?.reiyaSpecificity || 75),
          naturalJapanese: Number(humanEvalForm.scores?.naturalJapanese || 80),
          usefulAdditionalInsight: Number(humanEvalForm.scores?.usefulAdditionalInsight || 70),
          profileVisitPotential: Number(humanEvalForm.scores?.profileVisitPotential || 65),
          nonPromotional: Number(humanEvalForm.scores?.nonPromotional || 90),
          factualAccuracy: Number(humanEvalForm.scores?.factualAccuracy || 90),
        },
        feedbackTags: humanEvalForm.feedbackTags || [],
        sourceType: humanEvalForm.sourceType || "fixture",
        overallDecision: humanEvalForm.overallDecision || "pending",
        changeSummary: buildHumanEditDiff(selectedReply.text || "", humanEvalForm.humanEditedText || ""),
      });
      if (result?.duplicate) {
        notify("同じ内容はすでに保存されています");
      } else {
        notify("人間評価を保存しました");
      }
      return { saved: true, duplicate: Boolean(result?.duplicate), fixtureId: selectedFixture.id, candidateKey: humanEvalForm.candidateKey };
    } catch (error) {
      notify(error.message || "人間評価の保存に失敗しました");
      return { saved: false, error };
    } finally {
      setLoading(false);
    }
  }

  if (!environmentSafety.ok) {
    return <EnvironmentBlocked checks={environmentSafety.checks} projectId={runtimeInfo.projectId} />;
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">XR</span>
          <div>
            <h1>X Reply Intelligence</h1>
            <p>@Rachel_hkz</p>
          </div>
        </div>
        <nav className="nav-list" aria-label="管理メニュー">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? "nav-item active" : "nav-item"}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="safety-box">
          <ShieldCheck size={18} />
          <p>読み取り専用。投稿・いいね・フォロー権限は要求しません。</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Phase 2 読み取り基盤</p>
            <h2>{tabs.find((tab) => tab.id === activeTab)?.label}</h2>
          </div>
          <div className="api-state">
            <EnvironmentBadges connection={connection} />
            <span>{connection?.connected ? `X接続中 @${connection.username}` : "X未接続"}</span>
            <span>{topbarUserLabel}</span>
            <span>{topbarAdminLabel}</span>
          </div>
        </header>

        {firebaseEnabled && autoLoginActive && (localAuthPhase === "preparing" || authState.loading) && (
          <AuthStatus
            title="ローカル評価環境を準備しています"
            body="開発用管理者で接続しています。"
          />
        )}
        {firebaseEnabled && autoLoginActive && localAuthPhase === "error" && (
          <LocalAuthErrorPanel
          error={localAuthError}
            projectId={runtimeInfo.projectId}
            authHost={import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || "http://127.0.0.1:9097"}
            stage={localAuthFailureStage || (localAuthError?.includes("stage timeout") ? "timeout" : localAuthPhase)}
            onRetry={() => {
              markLocalAdminBootstrapAttempted(false);
              setLocalAuthPhase("idle");
              setLocalAuthFailureStage("");
            }}
          />
        )}
        {firebaseEnabled && !autoLoginActive && !authState.loading && !authState.user && (
          <LoginPanel
            form={loginForm}
            setForm={setLoginForm}
            loading={loading}
            error={authError}
            onSubmit={handleLogin}
            autoLoginActive={autoLoginActive}
            localAuthStatus={localAuthStatus}
          />
        )}
        {firebaseEnabled && authState.user && !authState.admin && (
          <AccessDenied user={authState.user} onLogout={handleLogout} />
        )}

        {(!firebaseEnabled || (authState.user && authState.admin) || (autoLoginActive && localAuthPhase === "ready")) && (
          <>
            <UserBar user={authState.user} admin={authState.admin} onLogout={handleLogout} />
            {autoLoginActive && localAuthPhase === "ready" && (
              <section className="login-panel">
                <h3>ローカル品質評価</h3>
                <p>Firebase Emulator で自動ログインしています。</p>
                <p className="profile-copy">{getLocalAdminCredentials().email}</p>
                <p className="profile-copy">admin</p>
              </section>
            )}

            <ConnectionPanel
              connection={connection}
              syncOverview={syncOverview}
              listId={listId}
              setListId={setListId}
              listName={listName}
              setListName={setListName}
              loading={loading}
              onConnect={handleBeginOAuth}
              onDisconnect={handleDisconnect}
              onFetchHome={handleFetchHome}
              onFetchList={handleFetchList}
              onRefresh={firebaseEnabled ? refreshMeta : refreshAll}
            />

            {activeTab === "dashboard" && (
              <Dashboard
                stats={stats}
                candidates={candidates}
                notify={notify}
                setTestPost={setTestPost}
                setActiveTab={setActiveTab}
                onAiAction={handleAiAction}
                onBatchAi={handleBatchAi}
                aiBusyId={aiBusyId}
                replyDraftLookup={replyDraftLookup}
              />
            )}
            {activeTab === "excluded" && <ExcludedPanel posts={excluded} />}
            {activeTab === "test" && (
              <GenerationTest testPost={testPost} setTestPost={setTestPost} testResult={testResult} onGenerate={handleGenerate} notify={notify} />
            )}
            {activeTab === "identity" && <IdentityPanel />}
            {activeTab === "analysis" && <OperationsAnalysis candidates={candidates} />}
            {activeTab === "readiness" && <ProductionReadinessPanel authState={authState} />}
            {qualityLabEnabled && activeTab === "quality" && (
              <QualityFixturePanel
                fixtures={qualityFixtures}
                tags={humanEvaluationTags}
                selected={qualitySelection}
                setSelected={setQualitySelection}
                evaluations={qualityEvaluations}
                summary={qualitySummary}
                filterCategory={qualityCategory}
                setFilterCategory={setQualityCategory}
                filterDecision={qualityDecision}
                setFilterDecision={setQualityDecision}
                onlyPending={qualityOnlyPending}
                setOnlyPending={setQualityOnlyPending}
                onlyEdited={qualityOnlyEdited}
                setOnlyEdited={setQualityOnlyEdited}
                candidateFilter={qualityCandidateFilter}
                setCandidateFilter={setQualityCandidateFilter}
                goodTagFilter={qualityGoodTagFilter}
                setGoodTagFilter={setQualityGoodTagFilter}
                badTagFilter={qualityBadTagFilter}
                setBadTagFilter={setQualityBadTagFilter}
                sourceFilter={qualitySourceFilter}
                setSourceFilter={setQualitySourceFilter}
                versionFilter={qualityVersionFilter}
                setVersionFilter={setQualityVersionFilter}
                originMode={qualityOriginMode}
                setOriginMode={setQualityOriginMode}
                humanEvalForm={humanEvalForm}
                setHumanEvalForm={setHumanEvalForm}
                onSaveHumanEval={handleSaveHumanEval}
                loading={loading}
              />
            )}
          </>
        )}
      </section>

      {toast && <div className="toast" role="status" aria-live="polite" aria-atomic="true">{toast}</div>}
    </main>
  );
}

function LoginPanel({ form, setForm, loading, error, onSubmit, autoLoginActive, localAuthStatus }) {
  return (
    <section className="login-panel">
      <div>
        <p className="eyebrow">Firebase Auth</p>
        <h3>管理者ログイン</h3>
        <p>{autoLoginActive ? localAuthStatus || "ローカル管理者でログインしています。" : "Emulatorでは `npm run emulator:create-admin` で作成したメールアドレスとパスワードを使います。"}</p>
      </div>
      <form className="login-form" onSubmit={onSubmit}>
        <label>
          メールアドレス
          <input
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            autoComplete="email"
            required
          />
        </label>
        <label>
          パスワード
          <input
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="primary-action wide" disabled={loading}>ログイン</button>
      </form>
    </section>
  );
}

function LocalAuthErrorPanel({ error, onRetry, stage, projectId, authHost }) {
  return (
    <section className="login-panel">
      <h3>ローカル管理者の接続に失敗しました</h3>
      <p>{error || "理由を確認してください。"}</p>
      {stage && <p>失敗段階: {stage}</p>}
      <p>Project ID: {projectId || "不明"}</p>
      <p>Auth Emulator: {authHost || "不明"}</p>
      <p>Emulator が起動しているか、local admin seed が完了しているかを確認してください。</p>
      <button type="button" className="primary-action wide" onClick={onRetry}>再試行</button>
    </section>
  );
}

function getInitialTab(qualityLabEnabled = shouldShowQualityLab()) {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get("tab") || (qualityLabEnabled ? import.meta.env.VITE_DEFAULT_TAB : null);
  const allowedTabs = new Set([...baseTabs.map((item) => item.id), ...(qualityLabEnabled ? ["quality"] : [])]);
  return allowedTabs.has(tab) ? tab : "dashboard";
}

function AccessDenied({ user, onLogout }) {
  return (
    <section className="login-panel">
      <h3>管理者権限がありません</h3>
      <p>このアカウントには管理者権限がありません。管理者claimの設定後、再ログインしてください。</p>
      <p className="profile-copy">{user.email || user.uid}</p>
          {!shouldUseLocalQualityMode() && <button type="button" className="quiet-action" onClick={onLogout}>ログアウト</button>}
    </section>
  );
}

function AuthStatus({ title, body }) {
  return (
    <section className="login-panel">
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}

function UserBar({ user, admin, onLogout }) {
  if (!user) return null;
  return (
    <section className="user-bar">
      <span>{user.email || user.uid}</span>
      <span>{admin ? "管理者" : "権限なし"}</span>
      {!shouldUseLocalQualityMode() && <button type="button" className="quiet-action" onClick={onLogout}>ログアウト</button>}
    </section>
  );
}

function ConnectionPanel(props) {
  const { connection, syncOverview, listId, setListId, listName, setListName, loading, onConnect, onDisconnect, onFetchHome, onFetchList, onRefresh } = props;
  const state = syncOverview?.states?.[0];
  return (
    <section className="control-grid">
      <article className="work-panel">
        <div className="panel-title">
          <h3>X接続</h3>
          <span className={connection?.connected ? "judge-pass" : "judge-warn"}>{connection?.connected ? "接続済み" : "未接続"}</span>
        </div>
        <p className="profile-copy">
          {connection?.connected ? `${connection.displayName} / @${connection.username}` : "tweet.read / users.read / list.read / offline.access だけを要求します。"}
        </p>
        <div className="topic-row">
          {(connection?.scopes || []).map((scope) => <span key={scope}>{scope}</span>)}
        </div>
        <div className="action-row">
          <button type="button" className="primary-action" onClick={onConnect} disabled={loading}>
            <Link size={17} />
            {connection?.connected ? "再接続" : "Xと接続"}
          </button>
          <button type="button" className="quiet-action" onClick={onDisconnect} disabled={loading}>
            <Unplug size={17} />
            接続解除
          </button>
          <button type="button" className="icon-action" onClick={onRefresh} aria-label="再読み込み">
            <RefreshCw size={17} />
          </button>
        </div>
      </article>

      <article className="work-panel">
        <div className="panel-title">
          <h3>タイムライン取得</h3>
          <span className="judge-warn">定期取得 停止中</span>
        </div>
        <div className="sync-lines">
          <p>最終取得: {formatDate(state?.lastSuccessfulAt)}</p>
          <p>前回取得 {state?.lastResultCount ?? 0}件 / 保存 {state?.lastSavedCount ?? 0}件 / 除外 {state?.lastExcludedCount ?? 0}件</p>
          <p>since_id: {state?.latestSinceId || "未保存"}</p>
        </div>
        <button type="button" className="primary-action wide" onClick={onFetchHome} disabled={loading}>
          <RefreshCw size={17} />
          {loading ? "取得中" : "ホームタイムラインを取得"}
        </button>
      </article>

      <article className="work-panel">
        <div className="panel-title">
          <h3>監視リスト</h3>
          <span>読み取りのみ</span>
        </div>
        <input value={listName} onChange={(event) => setListName(event.target.value)} aria-label="監視リスト名" />
        <input value={listId} onChange={(event) => setListId(event.target.value.replace(/\D/g, ""))} aria-label="監視リストID" />
        <button type="button" className="primary-action wide" onClick={onFetchList} disabled={loading || !listId}>
          <ListFilter size={17} />
          監視リストを取得
        </button>
      </article>
    </section>
  );
}

function Dashboard({ stats, candidates, notify, setTestPost, setActiveTab, onAiAction, onBatchAi, aiBusyId, replyDraftLookup }) {
  const [selectedId, setSelectedId] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("priority");
  const [selectedIds, setSelectedIds] = useState([]);
  const visible = useMemo(() => candidates
    .filter((item) => statusFilter === "all" || (statusFilter === "active" ? !["sent_manual", "dismissed", "archived"].includes(resolveDisplayedWorkflowStatus(item, replyDraftLookup[item.postId])) : resolveDisplayedWorkflowStatus(item, replyDraftLookup[item.postId]) === statusFilter))
    .filter((item) => sourceFilter === "all" || item.sourceTypes?.includes(sourceFilter))
    .filter((item) => !keyword.trim() || `${item.text} ${item.authorName} ${item.authorUsername}`.toLowerCase().includes(keyword.trim().toLowerCase()))
    .sort((a, b) => sortCandidates(a, b, sort, replyDraftLookup)), [candidates, statusFilter, sourceFilter, keyword, sort, replyDraftLookup]);
  const selectedIndex = Math.max(0, visible.findIndex((item) => item.postId === selectedId));
  const selected = visible[selectedIndex] || null;
  const runBatchStatus = async (to, label) => {
    if (!selectedIds.length || !window.confirm(`選択した${selectedIds.length}件を「${label}」にしますか？`)) return;
    const results = await Promise.allSettled(selectedIds.map((candidatePostId) => transitionCandidateWorkflow({ candidatePostId, to })));
    notify(`${label}: 成功${results.filter((item) => item.status === "fulfilled").length}件 / 失敗${results.filter((item) => item.status === "rejected").length}件`);
    setSelectedIds([]);
  };
  return (
    <div className="panel-stack">
      <section className="stat-grid" aria-label="ダッシュボード指標">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <p>{stat.label}</p>
            <strong>{stat.value}</strong>
            <span>{stat.status}</span>
          </article>
        ))}
      </section>
      <section className="work-panel">
        <div className="panel-title">
          <h3>返信作業キュー</h3>
          <span>候補を選び、生成・編集・送信確認まで進めます</span>
        </div>
        <div className="action-row">
          <button type="button" className="primary-action" onClick={() => onBatchAi(10)}>
            <Sparkles size={17} />
            最大10件まとめて生成
          </button>
          <button type="button" className="quiet-action" onClick={() => onBatchAi(3)}>
            <RefreshCw size={17} />
            3件だけ試す
          </button>
        </div>
      </section>
      <section className="work-panel workflow-toolbar" aria-label="候補の絞り込み">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="状態で絞り込み">
          <option value="active">未完了</option><option value="all">すべて</option>
          {Object.entries(workflowStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} aria-label="取得元で絞り込み">
          <option value="all">すべての取得元</option><option value="home_timeline">ホームタイムライン</option><option value="watch_list">監視リスト</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="並び順">
          <option value="priority">優先度順</option><option value="newest">新着順</option><option value="oldest">古い順</option><option value="review">要確認優先</option><option value="followers">フォロワー数順</option>
        </select>
        <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="投稿・投稿者を検索" aria-label="候補を検索" />
        <span>{visible.length}件</span>
        <div className="batch-actions"><button className="quiet-action" disabled={!selectedIds.length} onClick={() => runBatchStatus("queued", "生成待ち")}>生成待ちへ</button><button className="quiet-action" disabled={!selectedIds.length} onClick={() => runBatchStatus("dismissed", "不採用")}>不採用</button><button className="quiet-action" disabled={!selectedIds.length} onClick={() => runBatchStatus("archived", "保管")}>保管</button></div>
      </section>
      {selected && <CandidateDetail candidate={selected} aiState={replyDraftLookup[selected.postId]} notify={notify} onClose={() => setSelectedId("")} onAiAction={onAiAction} busy={aiBusyId === selected.postId} onMove={(step) => setSelectedId(visible[selectedIndex + step]?.postId || selected.postId)} canPrevious={selectedIndex > 0} canNext={selectedIndex < visible.length - 1} />}
      <section className="candidate-grid">
        {visible.length ? visible.map((candidate) => (
          <CandidateCard
            key={candidate.postId}
            candidate={candidate}
            notify={notify}
            setTestPost={setTestPost}
            setActiveTab={setActiveTab}
            onAiAction={onAiAction}
            busy={aiBusyId === candidate.postId}
            aiState={replyDraftLookup[candidate.postId]}
            onSelect={() => setSelectedId(candidate.postId)}
            checked={selectedIds.includes(candidate.postId)}
            onToggle={() => setSelectedIds((current) => current.includes(candidate.postId) ? current.filter((id) => id !== candidate.postId) : [...current, candidate.postId])}
            compact={Boolean(selected)}
            selected={selected?.postId === candidate.postId}
          />
        )) : <EmptyCandidates />}
      </section>
    </div>
  );
}

function EmptyCandidates() {
  return (
    <section className="empty-state">
      <Search size={34} />
      <h3>表示できる候補はまだありません</h3>
      <p>ホームタイムライン取得またはMockモードで候補を確認できます。</p>
    </section>
  );
}

function CandidateCard({ candidate, notify, setTestPost, setActiveTab, onAiAction, busy, aiState, onSelect, checked, onToggle, compact, selected }) {
  const latestDraft = candidate.replyDrafts?.[0] || null;
  const hasReplyDraft = hasUsableReplyDraft(candidate, aiState);
  const shouldReply = resolveShouldReply(candidate, aiState);
  const draftText = candidate.finalReplyText || candidate.recommendedReplyText || latestDraft?.candidates?.[0]?.text || aiState?.adapterOutput?.replyText || "";
  const displayStatus = resolveDisplayedWorkflowStatus(candidate, aiState);
  const copyDraft = async () => {
    await navigator.clipboard.writeText(draftText);
    notify("文面をコピーしました");
  };
  if (compact) return (
    <article className={`candidate-card candidate-card-compact workflow-${displayStatus}${selected ? " selected" : ""}`} aria-current={selected ? "true" : undefined}>
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`${candidate.authorName}の候補を選択`} />
      <div className="compact-candidate-body">
        <div className="compact-candidate-head"><strong>{candidate.authorName}</strong><span>@{candidate.authorUsername}</span>{selected && <span className="selected-label">選択中</span>}</div>
        <p>{candidate.text}</p>
        <div className="topic-row"><span className="workflow-status">{shouldReply ? formatWorkflowStatus(candidate, aiState) : "返信対象外"}</span><span>{(candidate.sourceTypes || []).map(formatCandidateSourceTypeLabel).join(" / ") || "未分類"}</span><span>優先度 {candidate.rank || Math.round(candidate.scores?.total || 0) || "-"}</span></div>
        {!shouldReply && <p className="workflow-note">{getReplyTargetReason(candidate, aiState)}</p>}
      </div>
      <button type="button" className={selected ? "primary-action" : "quiet-action"} onClick={onSelect}>{selected ? "表示中" : "開く"}</button>
    </article>
  );
  return (
    <article className={`candidate-card workflow-${displayStatus}`}>
      <div className="candidate-head">
        <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`${candidate.authorName}の候補を選択`} />
        <span className="source-badge">{(candidate.sourceTypes || []).map((value) => formatCandidateSourceTypeLabel(value)).join(" / ") || "未分類"}</span>
        <div>
          <h3>{candidate.authorName}</h3>
          <p>@{candidate.authorUsername} ・ {(candidate.authorMetrics?.followers || 0).toLocaleString()} フォロワー</p>
        </div>
      </div>
      <p className="post-text">{candidate.text}</p>
      <div className="topic-row">
        {candidate.rank && <span>順位 {candidate.rank}</span>}
        {candidate.aiAssessment?.primaryTopic && <span>{candidate.aiAssessment.primaryTopic}</span>}
        {typeof candidate.scores?.total === "number" && <span>総合 {Math.round(candidate.scores.total)}</span>}
        <span className="workflow-status">{formatWorkflowStatus(candidate, aiState)}</span>
      </div>
      {candidate.aiDecision && (
        <div className="debug-list">
          <p>方針 {candidate.aiDecision.decisionSummary || candidate.aiAssessment?.decisionSummary || "-"}</p>
          <p>要確認 {candidate.aiDecision.warnings?.join(" / ") || candidate.aiDecision.riskFlags?.join(" / ") || "-"}</p>
          <p>文脈 {(candidate.aiDecision.selectedProjectIds || candidate.aiAssessment?.selectedProjectIds || []).join(" / ") || "-"}</p>
          <p>claimLevel {(candidate.aiDecision.claimLevel || []).join(" / ") || "-"}</p>
        </div>
      )}
      {candidate.replyDrafts?.length > 0 && (
        <div className="debug-list">
          <p>返信案 {candidate.replyDrafts.length}件</p>
        </div>
      )}
      {aiState?.candidatePostId && (
        <div className="debug-list">
          <p>AI結果を取得済みです。</p>
        </div>
      )}
      <div className="metric-row">
        <span>{formatElapsed(candidate.createdAt)}</span>
        <span>いいね {candidate.metrics?.likes ?? 0}</span>
        <span>リプ {candidate.metrics?.replies ?? 0}</span>
        <span>リポスト {candidate.metrics?.reposts ?? 0}</span>
        <span>引用 {candidate.metrics?.quotes ?? 0}</span>
      </div>
      {candidate.media?.length > 0 && (
        <div className="media-strip">
          {candidate.media.map((item) => <span key={item.mediaKey}>{item.type}</span>)}
        </div>
      )}
      {hasReplyDraft ? <div className="draft-preview"><p>{draftText}</p></div> : <div className="draft-preview empty"><p>返信案はまだありません。</p></div>}
      <div className="action-row">
        <button type="button" className="primary-action" onClick={onSelect}>
          <MessageSquareReply size={17} />
          確認・編集
        </button>
        <button type="button" className="quiet-action" onClick={() => onAiAction(candidate, "process")} disabled={busy}>
          <Sparkles size={17} />
          AIで候補生成
        </button>
        <button type="button" className="quiet-action" onClick={() => onAiAction(candidate, "manual")} disabled={busy}>
          <X size={17} />
          手動確認へ
        </button>
        <button type="button" className="icon-action" onClick={copyDraft} aria-label="文面をコピー" disabled={!hasReplyDraft}>
          <Clipboard size={17} />
        </button>
        <a className="icon-action" href={candidate.postUrl} target="_blank" rel="noreferrer" aria-label="元投稿を開く">
          <ExternalLink size={17} />
        </a>
        <button type="button" className="quiet-action" onClick={() => { setTestPost(candidate.text); setActiveTab("test"); }}>
          別案を見る
        </button>
      </div>
    </article>
  );
}

function CandidateDetail({ candidate, aiState, notify, onClose, onAiAction, busy, onMove, canPrevious, canNext }) {
  const hasReplyDraft = hasUsableReplyDraft(candidate, aiState);
  const shouldReply = resolveShouldReply(candidate, aiState);
  const originalText = hasReplyDraft ? (candidate.recommendedReplyText || aiState?.decision?.replies?.[aiState?.recommendedCandidateKey || "A"]?.text || aiState?.adapterOutput?.replyText || "") : "";
  const draftId = candidate.latestReplyDraftId || aiState?.replyDraftId || "";
  const [text, setText] = useState(candidate.finalReplyText || originalText);
  const [saving, setSaving] = useState(false);
  const [showSendCheck, setShowSendCheck] = useState(candidate.pendingSendConfirmation === true || normalizeWorkflowStatus(candidate) === "intent_opened");
  const [feedback, setFeedback] = useState(text === originalText ? "adopted" : "edited_and_used");
  const [notSentReason, setNotSentReason] = useState("revise_text");
  const [replyUrl, setReplyUrl] = useState(candidate.replyUrl || "");
  const [outcome, setOutcome] = useState({ likes: 0, replies: 0, reposts: 0, profileVisits: "unknown", followed: "unknown", inquiryOccurred: "unknown", memo: "" });
  const storedCandidateStatus = normalizeWorkflowStatus(candidate);
  const candidateStatus = resolveDisplayedWorkflowStatus(candidate, aiState);
  const hasWarnings = hasCurrentGenerationWarnings(candidate, aiState);
  const selectedContextLabels = formatSelectedContextLabels(candidate, aiState);
  useEffect(() => { setText(candidate.finalReplyText || originalText); setShowSendCheck(candidate.pendingSendConfirmation === true || candidateStatus === "intent_opened"); }, [candidate.postId, candidate.finalReplyText, candidate.pendingSendConfirmation, candidateStatus, originalText]);
  const run = async (task, success) => { if (saving) return; setSaving(true); try { await task(); notify(success); } catch (error) { notify(formatOperationalError(error, "保存に失敗しました。認証とFirestore接続を確認して再試行してください。")); } finally { setSaving(false); } };
  const save = () => run(() => saveWorkflowReplyDraft({ candidatePostId: candidate.postId, replyDraftId: draftId, editedText: text }), "返信文を保存しました");
  const openIntent = () => run(async () => { if (draftId && text !== originalText) await saveWorkflowReplyDraft({ candidatePostId: candidate.postId, replyDraftId: draftId, editedText: text }); await recordReplyIntentOpened({ candidatePostId: candidate.postId, replyDraftId: draftId, finalReplyText: text }); openXReply({ postId: candidate.postId, replyText: text }); setShowSendCheck(true); }, "Xの返信画面を開きました。送信後に結果を記録してください");
  const recordSend = (sent) => run(() => recordManualSendResult({ candidatePostId: candidate.postId, sent, finalReplyText: text, replyUrl, notSentReason, feedback: sent ? feedback : "not_used" }), sent ? "送信済みとして記録しました" : "未送信として記録しました");
  return <section className="workflow-detail" aria-label="候補の詳細">
    <div className="panel-title"><div><span className="workflow-status">{formatWorkflowStatus(candidate, aiState)}</span><h3>{candidate.authorName} <small>@{candidate.authorUsername}</small></h3><small>{(candidate.sourceTypes || []).map(formatCandidateSourceTypeLabel).join(" / ") || "取得元不明"}</small></div><button className="icon-action" onClick={onClose} aria-label="詳細を閉じる"><X size={18} /></button></div>
    <div className="workflow-source"><strong>元投稿</strong><p>{candidate.text}</p><small>{formatDate(candidate.createdAt)} ・ {(candidate.sourceTypes || []).map(formatCandidateSourceTypeLabel).join(" / ")}</small></div>
    {!shouldReply ? (
      <div className="workflow-no-reply"><strong>返信対象外</strong><p>{getReplyTargetReason(candidate, aiState)}</p><small>返信案はありません。必要なら保管または不採用に進めます。</small></div>
    ) : (
      <>
        <div className="workflow-context">
          <strong>返信に使った文脈</strong>
          {selectedContextLabels.length > 0 ? <ul className="quality-list">{selectedContextLabels.slice(0, 2).map((item) => <li key={item}>{item}</li>)}</ul> : <p className="profile-copy">固有文脈は使用していません。</p>}
        </div>
        <div className="workflow-reply"><strong>返信案</strong><textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} maxLength={280} /><div className="detail-meta"><span>{text.length}文字</span><span>{candidate.aiDecision?.generationReason || candidate.aiAssessment?.decisionSummary || "ローカル候補"}</span><span>{claimLevelLabels[candidate.aiDecision?.claimLevel] || "断定リスク：未判定"}</span></div></div>
      </>
    )}
    {hasWarnings && <div className="workflow-warning"><AlertTriangle size={18} /><div><strong>要確認</strong><p>{(candidate.aiDecision?.warnings || candidate.aiAssessment?.riskFlags || aiState?.adapterOutput?.warnings || []).join(" / ")}</p></div></div>}
    {(storedCandidateStatus === "generation_failed" || candidate.generationError || candidate.generationErrorCode) && (candidate.generationError || candidate.generationErrorCode) && <details className="technical-info"><summary>技術情報</summary><p>以前の生成失敗: {candidate.generationError || candidate.generationErrorCode}</p></details>}
    {shouldReply ? <div className="action-row"><button className="quiet-action" onClick={save} disabled={saving || !draftId}>{saving ? "保存中" : "編集を保存"}</button><button className="quiet-action" onClick={() => setText(originalText)} disabled={saving}>元に戻す</button><button className="primary-action" onClick={openIntent} disabled={saving || !text.trim()}><ExternalLink size={17} />Web IntentでXを開く</button><button className="quiet-action" onClick={() => onAiAction(candidate, "process")} disabled={busy}>モック生成</button><button className="quiet-action" onClick={() => run(() => transitionCandidateWorkflow({ candidatePostId: candidate.postId, to: "dismissed" }), "不採用にしました")}>不採用</button></div> : <div className="action-row"><button className="quiet-action" onClick={() => run(() => transitionCandidateWorkflow({ candidatePostId: candidate.postId, to: "archived" }), "保管しました")}>保管</button><button className="quiet-action" onClick={() => run(() => transitionCandidateWorkflow({ candidatePostId: candidate.postId, to: "dismissed" }), "不採用にしました")}>不採用</button></div>}
    <div className="detail-navigation"><button className="quiet-action" disabled={!canPrevious} onClick={() => onMove(-1)}><ChevronLeft size={17} />前の候補</button><button className="quiet-action" disabled={!canNext} onClick={() => onMove(1)}>次の候補<ChevronRight size={17} /></button></div>
    {showSendCheck && <div className="send-confirm"><h4>Xで返信を送信しましたか？</h4><div className="form-grid"><label>利用結果<select value={feedback} onChange={(event) => setFeedback(event.target.value)}>{Object.entries(feedbackLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>返信URL（任意）<input value={replyUrl} onChange={(event) => setReplyUrl(event.target.value)} placeholder="https://x.com/..." /></label><label>未送信の理由<select value={notSentReason} onChange={(event) => setNotSentReason(event.target.value)}>{Object.entries(notSentReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div><div className="action-row"><button className="primary-action" onClick={() => recordSend(true)} disabled={saving}>送信した</button><button className="quiet-action" onClick={() => recordSend(false)} disabled={saving}>送信しなかった</button><button className="quiet-action" onClick={() => setShowSendCheck(false)}>あとで確認</button></div></div>}
    {candidateStatus === "sent_manual" && <OutcomeForm value={outcome} setValue={setOutcome} onSave={() => run(() => saveReplyOutcomeMetrics({ candidatePostId: candidate.postId, metrics: outcome }), "反応を記録しました")} saving={saving} />}
  </section>;
}

function OutcomeForm({ value, setValue, onSave, saving }) {
  const update = (key, next) => setValue((current) => ({ ...current, [key]: next }));
  return <div className="outcome-form"><h4>送信後の反応（任意）</h4><div className="form-grid"><label>いいね数<input type="number" min="0" value={value.likes} onChange={(event) => update("likes", event.target.value)} /></label><label>返信数<input type="number" min="0" value={value.replies} onChange={(event) => update("replies", event.target.value)} /></label><label>リポスト数<input type="number" min="0" value={value.reposts} onChange={(event) => update("reposts", event.target.value)} /></label>{[["profileVisits", "プロフィール訪問"], ["followed", "フォロー"], ["inquiryOccurred", "問い合わせ"]].map(([key, label]) => <label key={key}>{label}<select value={value[key]} onChange={(event) => update(key, event.target.value)}><option value="unknown">不明</option><option value="yes">あり</option><option value="no">なし</option></select></label>)}</div><label>メモ<textarea rows="2" value={value.memo} onChange={(event) => update("memo", event.target.value)} /></label><button className="quiet-action" onClick={onSave} disabled={saving}>反応を保存</button></div>;
}

function sortCandidates(a, b, mode, replyDraftLookup = {}) {
  if (mode === "oldest") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  if (mode === "followers") return (b.authorMetrics?.followers || 0) - (a.authorMetrics?.followers || 0);
  if (mode === "review") return Number(resolveDisplayedWorkflowStatus(b, replyDraftLookup[b.postId]) === "needs_review") - Number(resolveDisplayedWorkflowStatus(a, replyDraftLookup[a.postId]) === "needs_review");
  if (mode === "priority") return (b.scores?.total || 0) - (a.scores?.total || 0) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
}

function resolveShouldReply(candidate, aiState) {
  if (typeof aiState?.decision?.shouldReply === "boolean") return aiState.decision.shouldReply;
  if (typeof candidate?.aiDecision?.shouldReply === "boolean") return candidate.aiDecision.shouldReply;
  if (typeof candidate?.aiAssessment?.shouldReply === "boolean") return candidate.aiAssessment.shouldReply;
  return true;
}

function getReplyTargetReason(candidate, aiState) {
  return candidate?.aiDecision?.decisionSummary
    || candidate?.aiAssessment?.decisionSummary
    || aiState?.decision?.decisionSummary
    || "固有文脈が薄いため、返信対象外です。";
}

function formatSelectedContextLabels(candidate, aiState) {
  const ids = [...new Set(aiState?.adapterOutput?.selectedContextIds || candidate?.aiDecision?.selectedContextIds || [])];
  const contextMap = new Map([
    ...seedData.experiences.map((item) => [item.experienceId, item.title || item.name || item.experienceId]),
    ...seedData.experiences.map((item) => [item.projectId, item.title || item.name || item.projectId]),
    ...seedData.opinions.map((item) => [item.opinionId, item.statement || item.opinionId]),
  ]);
  return ids.map((id) => contextMap.get(id) || id);
}

function ExcludedPanel({ posts }) {
  return (
    <section className="candidate-grid">
      {posts.map((post) => (
        <article className="candidate-card" key={post.postId}>
          <div className="candidate-head">
            <span className="source-badge">除外</span>
            <div>
              <h3>{post.authorName || "投稿者不明"}</h3>
              <p>@{post.authorUsername || "-"} ・ {formatElapsed(post.createdAt)}</p>
            </div>
          </div>
          <p className="post-text">{post.text}</p>
          <div className="topic-row">
            {(post.hardFilter?.exclusionReasons || []).map((reason) => <span key={reason}>{reason}</span>)}
          </div>
        </article>
      ))}
    </section>
  );
}

function GenerationTest({ testPost, setTestPost, testResult, onGenerate, notify }) {
  return (
    <div className="two-column">
      <section className="work-panel">
        <label className="field-label" htmlFor="test-post">元投稿本文</label>
        <textarea id="test-post" value={testPost} onChange={(event) => setTestPost(event.target.value)} rows={9} />
        <button type="button" className="primary-action wide" onClick={onGenerate}>
          <RefreshCw size={17} />
          生成テスト
        </button>
        <div className="debug-list">
          <h3>選ばれた文脈</h3>
          <p>現在はローカルルールによる生成テストです。OpenAI接続はPhase 3で追加します。</p>
          <p>プロジェクト: {testResult.relatedProjects.join(" / ")}</p>
          <p>経験: {testResult.usedExperienceIds.join(" / ")}</p>
          <p>意見: {testResult.usedOpinionIds.join(" / ")}</p>
        </div>
      </section>
      <section className="work-panel">
        <div className="judge-line">
          <span className={testResult.aiJudge.passed ? "judge-pass" : "judge-warn"}>{testResult.aiJudge.passed ? "AI判定 合格" : "手動確認"}</span>
          <span>{testResult.decisionReason}</span>
        </div>
        <div className="draft-list">
          {testResult.candidates.map((candidate, index) => (
            <article key={candidate.type} className={index === testResult.recommendedIndex ? "draft-card recommended" : "draft-card"}>
              <div><strong>{candidate.label}</strong><span>Fit {candidate.profileFitScore} / 独自性 {candidate.uniquenessScore}</span></div>
              <p>{candidate.text}</p>
              <button type="button" className="quiet-action" onClick={async () => { await navigator.clipboard.writeText(candidate.text); notify("生成案をコピーしました"); }}>コピー</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function IdentityPanel() {
  return (
    <div className="two-column">
      <section className="work-panel">
        <h3>{seedData.creatorProfile.displayName}</h3>
        <p className="profile-copy">{seedData.creatorProfile.positioning}</p>
        <h4>対象読者</h4>
        <div className="topic-row">{seedData.creatorProfile.targetAudiences.map((audience) => <span key={audience}>{audience}</span>)}</div>
      </section>
      <section className="work-panel">
        <h3>公開可能な経験</h3>
        <div className="experience-list">
          {seedData.experiences.map((experience) => (
            <article key={experience.experienceId}>
              <strong>{experience.title}</strong>
              <span>{experience.claimLevel}</span>
              <p>{experience.usableClaims[0]}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function EnvironmentBlocked({ checks, projectId }) {
  return <main className="environment-blocked"><AlertTriangle size={36} /><h1>安全のため起動を停止しました</h1><p>Firebase project: {projectId || "未設定"}</p>{checks.map((check) => <article key={check.id}><strong>{check.message}</strong><p>{check.action}</p></article>)}</main>;
}

function EnvironmentBadges({ connection }) {
  const badges = [
    [clientEnvironment.emulators && clientEnvironment.openAiMock ? "ローカルモック" : clientEnvironment.appEnv === "production" ? "本番候補" : "検証環境", clientEnvironment.appEnv === "production" ? "safe" : "verify"],
    [clientEnvironment.emulators ? "Firebase Emulator" : "Firebase実接続", clientEnvironment.emulators ? "verify" : "safe"],
    [clientEnvironment.openAiMock ? "OpenAIモック" : "実OpenAI", clientEnvironment.openAiMock ? "verify" : "safe"],
    [clientEnvironment.xApiMock ? "X API Mock" : connection?.connected ? "X実接続" : "X実接続・未接続", clientEnvironment.xApiMock ? "verify" : connection?.connected ? "safe" : "danger"],
    ["自動投稿なし", "safe"],
  ];
  return <div className="environment-badges" aria-label="実行環境">{badges.map(([label, tone]) => <span key={label} className={`environment-badge ${tone}`}>{label}</span>)}</div>;
}

const releaseOperationalLimits = [
  "初日: 最大3件",
  "2〜3日目: 最大5件",
  "1週間以内: 最大10件/日",
  "連続Web Intent起動を避ける",
  "同一投稿者への連続返信を避ける",
  "警告付きdraftは必ず人間確認",
  "generation_failedは送信不可",
  "claimLevel highは原則見送り",
];

const releaseStopConditions = [
  "OpenAI quota不足",
  "同じ文面の連続生成",
  "関係ない自己紹介の繰り返し",
  "宣伝臭が強い",
  "元投稿の意味を読み違える",
  "強い断定や誤情報リスク",
  "X OAuth不安定",
  "Firestore保存失敗",
  "status遷移不整合",
  "Web Intent先URL異常",
  "本番projectId不一致",
  "mock混入",
  "dev admin有効",
  "Quality Lab露出",
];

function ProductionReadinessPanel({ authState }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const refresh = async () => {
    setLoading(true); setError("");
    try { setResult(await getProductionReadiness()); } catch (reason) { setError(reason.message || "Functions接続に失敗しました。"); } finally { setLoading(false); }
  };
  useEffect(() => { if (authState.user && authState.admin) refresh(); }, [authState.user, authState.admin]);
  const server = result || { connectivity: {}, configuration: {}, environment: { flags: {} } };
  const releaseCandidate = runtimeInfo.releaseCandidateVersion || "phase5.0-rc1";
  const releaseInfo = [
    ["RC", releaseCandidate],
    ["Git", runtimeInfo.gitCommitHash || "unknown"],
    ["ビルド日時", runtimeInfo.buildTimestamp || "未設定"],
    ["ビルド状態", runtimeInfo.buildStatus || "未確定ビルド"],
  ];
  const checks = [
    readiness("Firebase projectId", runtimeInfo.projectId ? "passed" : "failed", runtimeInfo.projectId || "未設定"),
    readiness("Auth接続", server.connectivity.auth ? "passed" : authState.user ? "warning" : "failed", authState.admin ? "admin認証済み" : "admin権限を確認してください"),
    readiness("Firestore接続", server.connectivity.firestore ? "passed" : "unconfirmed", server.connectivity.firestore ? "読み取り確認済み" : "未確認"),
    readiness("Functions接続", server.connectivity.functions ? "passed" : error ? "failed" : "unconfirmed", error || (server.connectivity.functions ? "Callable応答あり" : "未確認")),
    readiness("X OAuth接続", server.connectivity.xOAuth ? "passed" : "warning", server.connectivity.xOAuth ? "接続済み" : "Xへ接続してください"),
    readiness("OpenAI key", server.configuration.openAiKeyConfigured ? "passed" : "warning", server.configuration.openAiKeyConfigured ? "設定あり（値は非表示）" : "未設定"),
    readiness("OpenAI quota", "unconfirmed", "実APIを呼ばないため未確認"),
    readiness("OpenAI mock無効", server.configuration.openAiMock === false ? "passed" : "warning", server.configuration.openAiMock === false ? "無効" : "現在はモック"),
    readiness("開発用admin無効", clientEnvironment.localAutoLogin ? "warning" : "passed", clientEnvironment.localAutoLogin ? "ローカル自動ログイン中" : "無効"),
    readiness("品質Lab非表示", clientEnvironment.qualityLab ? "warning" : "passed", clientEnvironment.qualityLab ? "開発者モードで表示中" : "非表示"),
    readiness("自動投稿機能なし", "passed", "Xへの自動書き込みなし"),
    readiness("Web Intent手動送信", "passed", "人間がX上で最終送信"),
    readiness("Firestore Rules", "unconfirmed", "npm run test:rulesで確認"),
    readiness("必須環境変数", runtimeInfo.projectId ? "warning" : "failed", "preflightコマンドで最終確認"),
    readiness("最新build", "unconfirmed", "npm run buildで確認"),
    readiness("migration要否", "warning", "後方互換Schema。実データのdry-run確認が必要"),
    readiness("rollback手順", "passed", "READMEに記載済み"),
  ];
  return <div className="panel-stack"><section className="work-panel"><div className="panel-title"><div><h3>本番準備チェック</h3><span>読み取り専用。OpenAI・X API・Firestoreへの書き込みは行いません</span></div><button className="quiet-action" onClick={refresh} disabled={loading}><RefreshCw size={16} />{loading ? "確認中" : "再確認"}</button></div>{error && <div className="workflow-warning"><AlertTriangle size={18} /><p>{error} Functions Emulatorまたは接続先を確認してください。</p></div>}<div className="release-info-grid">{releaseInfo.map(([label, value]) => <article key={label} className="readiness-item warning"><span className="readiness-status">固定</span><div><strong>{label}</strong><p>{value}</p></div></article>)}</div></section><section className="readiness-list">{checks.map((check) => <article key={check.label} className={`readiness-item ${check.status}`}><span className="readiness-status">{readinessStatusLabel(check.status)}</span><div><strong>{check.label}</strong><p>{check.detail}</p></div></article>)}</section><section className="work-panel"><div className="panel-title"><div><h3>初期運用上限</h3><span>文書上の安全上限。コード強制はまだ行いません</span></div></div><ul className="plain-list">{releaseOperationalLimits.map((item) => <li key={item}>{item}</li>)}</ul></section><section className="work-panel"><div className="panel-title"><div><h3>停止条件</h3><span>発生時は自動復旧せず、人間確認へ戻します</span></div></div><ul className="plain-list">{releaseStopConditions.map((item) => <li key={item}>{item}</li>)}</ul></section><section className="work-panel"><div className="panel-title"><div><h3>未確認事項</h3><span>未確認を合格表示しません</span></div></div><ul className="plain-list">{(runtimeInfo.unconfirmedItems || []).map((item) => <li key={item}>{item}</li>)}</ul></section></div>;
}

function readiness(label, status, detail) { return { label, status, detail }; }
function readinessStatusLabel(status) { return { passed: "合格", warning: "注意", unconfirmed: "未確認", failed: "失敗" }[status] || "未確認"; }

function OperationsAnalysis({ candidates }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { getPhase4OperationsSummary().then(setSummary).catch((reason) => setError(reason.message || "運用集計を読み込めませんでした")); }, [candidates]);
  if (error) return <section className="empty-state"><AlertTriangle size={28} /><h3>分析を読み込めませんでした</h3><p>{error}</p></section>;
  const cards = [
    ["取得候補数", summary?.totalCandidates], ["返信案生成数", summary?.generated], ["要確認数", summary?.needsReview], ["編集数", summary?.edited],
    ["Intentを開いた数", summary?.intentOpened], ["手動送信数", summary?.sentManual], ["不使用数", summary?.notUsed],
    ["候補から送信した割合", formatOperationRate(summary?.candidateToSendRate)], ["そのまま使用率", formatOperationRate(summary?.adoptedRate)], ["修正して使用率", formatOperationRate(summary?.editedAndUsedRate)],
  ];
  return <div className="panel-stack"><section className="stat-grid">{cards.map(([label, value]) => <StatCard key={label} label={label} value={value ?? "-"} status={summary?.insufficientData ? "データ不足" : "運用記録のみ"} />)}</section><section className="work-panel"><div className="panel-title"><h3>運用分析</h3><span>品質Labの採点は含みません</span></div><p>手動で記録した送信結果を集計しています。反応との因果関係は断定しません。</p></section></div>;
}

function formatOperationRate(value) { return typeof value === "number" ? `${value}%` : "データ不足"; }

function QualityFixturePanel({
  fixtures,
  tags,
  selected,
  setSelected,
  evaluations,
  summary,
  filterCategory,
  setFilterCategory,
  filterDecision,
  setFilterDecision,
  onlyPending,
  setOnlyPending,
  onlyEdited,
  setOnlyEdited,
  candidateFilter,
  setCandidateFilter,
  goodTagFilter,
  setGoodTagFilter,
  badTagFilter,
  setBadTagFilter,
  sourceFilter,
  setSourceFilter,
  versionFilter,
  setVersionFilter,
  originMode,
  setOriginMode,
  humanEvalForm,
  setHumanEvalForm,
  onSaveHumanEval,
  loading,
}) {
  const filteredFixtures = useMemo(() => fixtures.filter((item) => filterCategory === "all" || item.category === filterCategory), [fixtures, filterCategory]);
  const orderedCandidates = useMemo(() => filteredFixtures.flatMap((fixture) => ["A", "B", "C"].map((candidateKey) => ({ fixture, candidateKey, key: `${fixture.id}:${candidateKey}` }))), [filteredFixtures]);
  const latestManualEvaluations = useMemo(() => {
    const map = new Map();
    [...evaluations]
      .filter((item) => item.evaluationOrigin === "human_manual")
      .sort((a, b) => new Date(b.evaluatedAt || b.createdAt || 0).getTime() - new Date(a.evaluatedAt || a.createdAt || 0).getTime())
      .forEach((item) => {
        const key = `${item.fixtureId || "unknown"}:${item.candidateId || item.candidateKey || "A"}`;
        if (!map.has(key)) map.set(key, item);
      });
    return map;
  }, [evaluations]);
  const currentIndex = useMemo(() => {
    const fixtureId = selected?.id || filteredFixtures[0]?.id || "";
    const candidateKey = humanEvalForm.candidateKey || "A";
    return orderedCandidates.findIndex((item) => item.fixture.id === fixtureId && item.candidateKey === candidateKey);
  }, [filteredFixtures, humanEvalForm.candidateKey, orderedCandidates, selected?.id]);
  const currentCandidate = currentIndex >= 0 ? orderedCandidates[currentIndex] : orderedCandidates[0] || null;
  const current = currentCandidate?.fixture || selected || filteredFixtures[0] || null;
  const evaluatedCount = orderedCandidates.filter((item) => latestManualEvaluations.has(item.key)).length;
  const completionMessage = orderedCandidates.length > 0 && evaluatedCount >= orderedCandidates.length ? "すべての候補を評価しました" : "";
  const originFiltered = useMemo(() => filterQualityEvaluations(evaluations, originMode, { includeLegacyUnknown: false }), [evaluations, originMode]);
  const evaluationRows = originFiltered.filter((item) => {
    if (onlyPending && item.overallDecision !== "pending") return false;
    if (onlyEdited && item.overallDecision !== "accepted_with_edit") return false;
    if (filterDecision !== "all" && item.overallDecision !== filterDecision) return false;
    if (candidateFilter !== "all" && (item.candidateId || item.candidateKey) !== candidateFilter) return false;
    if (goodTagFilter !== "all" && !(item.goodTags || []).includes(goodTagFilter)) return false;
    if (badTagFilter !== "all" && !(item.badTags || []).includes(badTagFilter)) return false;
    if (sourceFilter !== "all" && item.sourceType !== sourceFilter) return false;
    if (versionFilter !== "all") {
      const versionKey = `${item.sourceType || "unknown"}|${item.generationVersion || "unknown"}|${item.promptVersion || "unknown"}|${item.contextSelectorVersion || "unknown"}|${item.codeCheckVersion || "unknown"}`;
      if (versionKey !== versionFilter) return false;
    }
    return current ? item.fixtureId === current.id || item.fixtureId === current.candidatePostId : true;
  });
  const legacyUnknownCount = evaluations.filter((item) => !item.evaluationOrigin || item.evaluationOrigin === "legacy_unknown").length;
  const excludedLegacyUnknownCount = legacyUnknownCount;

  useEffect(() => {
    if (!current) return;
    const nextCandidate = currentCandidate?.fixture?.id === current.id ? currentCandidate : { fixture: current, candidateKey: "A", key: `${current.id}:A` };
    if (latestManualEvaluations.has(nextCandidate.key)) {
      const next = orderedCandidates.find((item, index) => index > Math.max(currentIndex, -1) && !latestManualEvaluations.has(item.key));
      if (next) {
        setSelected(next.fixture);
        setHumanEvalForm((form) => buildQualityEvalForm(next.fixture, next.candidateKey, form));
      }
      return;
    }
    setSelected(nextCandidate.fixture);
    setHumanEvalForm((form) => buildQualityEvalForm(nextCandidate.fixture, nextCandidate.candidateKey, form));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, currentCandidate?.key, orderedCandidates.length, latestManualEvaluations.size]);

  const toggleTag = (tag) => {
    setHumanEvalForm((form) => {
      const nextTags = new Set([...(form.feedbackTags || [])]);
      if (nextTags.has(tag)) nextTags.delete(tag);
      else nextTags.add(tag);
      return { ...form, feedbackTags: Array.from(nextTags) };
    });
  };

  function setCandidate(target) {
    if (!target) return;
    setSelected(target.fixture);
    setHumanEvalForm((form) => buildQualityEvalForm(target.fixture, target.candidateKey, form));
  }

  function selectCandidateKey(candidateKey) {
    if (!current) return;
    setCandidate({ fixture: current, candidateKey, key: `${current.id}:${candidateKey}` });
  }

  function buildQualityEvalForm(fixture, candidateKey, currentForm) {
    const reply = fixture?.mockReplies?.find((item) => item.id === candidateKey) || fixture?.mockReplies?.[0] || { text: "" };
    return {
      ...currentForm,
      candidatePostId: fixture?.id || "",
      replyDraftId: `${fixture?.id || "unknown"}-reply`,
      candidateKey,
      fixtureId: fixture?.id || "",
      humanEditedText: reply.text || "",
      feedbackTags: [],
      rejectionReasons: [],
      editReasons: [],
      overallDecision: "pending",
      sourceType: "fixture",
      evaluatorNotes: "",
      humanMemo: "",
    };
  }

  function moveToIndex(nextIndex) {
    const target = orderedCandidates[nextIndex];
    if (!target) return false;
    setCandidate(target);
    return true;
  }

  async function handleSaveAndMaybeAdvance(event, shouldAdvance) {
    event.preventDefault();
    const result = await onSaveHumanEval(event);
    if (!result?.saved) return;
    if (!shouldAdvance) return;
    const next = orderedCandidates.slice(Math.max(currentIndex, -1) + 1).find((item) => !latestManualEvaluations.has(item.key));
    if (next) {
      moveToIndex(orderedCandidates.findIndex((item) => item.key === next.key));
    }
  }

  return (
    <div className="panel-stack">
      <section className="stat-grid">
        <StatCard label="評価済み件数 / 全件数" value={`${summary.evaluatedCount || 0} / ${summary.totalEvaluations || 0}`} status={summary.totalEvaluations ? "履歴ベース" : "データ不足"} />
        <StatCard label="そのまま採用率" value={formatPercent(summary.acceptedRate)} status="全候補" />
        <StatCard label="修正して採用率" value={formatPercent(summary.acceptedWithEditRate)} status="全候補" />
        <StatCard label="不採用率" value={formatPercent(summary.rejectedRate)} status="全候補" />
        <StatCard label="保留率" value={formatPercent(summary.pendingRate)} status="全候補" />
        <StatCard label="平均総合点" value={formatMaybeScore(summary.averageScore)} status="データ不足は省略" />
        <StatCard label="最も多い良かった点" value={summary.topGoodTag?.tag || "データ不足"} status={summary.topGoodTag?.count ? `n=${summary.topGoodTag.count}` : "データ不足"} />
        <StatCard label="最も多い問題点" value={summary.topBadTag?.tag || "データ不足"} status={summary.topBadTag?.count ? `n=${summary.topBadTag.count}` : "データ不足"} />
        <StatCard label="旧データ・出自不明" value={legacyUnknownCount} status={summary.originMode === "human" ? "既定集計から除外" : "参照のみ"} />
      </section>

      <section className="control-grid">
        <article className="work-panel">
          <div className="panel-title">
            <h3>品質用サンプル</h3>
            <span>{fixtures.length}件</span>
          </div>
          <div className="action-row">
            <label className="field-label">集計対象
              <select value={originMode} onChange={(event) => setOriginMode(event.target.value)}>
                <option value="human">人間による評価</option>
                <option value="test">テスト用スナップショット</option>
                <option value="all">すべて</option>
              </select>
            </label>
            <label className="field-label">カテゴリ
              <select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}>
                <option value="all">すべて</option>
                {[...new Set(fixtures.map((item) => item.category))].map((category) => <option key={category} value={category}>{formatCategoryLabel(category)}</option>)}
              </select>
            </label>
            <label className="field-label">最終判断
              <select value={filterDecision} onChange={(event) => setFilterDecision(event.target.value)}>
                <option value="all">すべて</option>
                {["accepted", "accepted_with_edit", "rejected", "pending"].map((value) => <option key={value} value={value}>{formatDecisionLabel(value)}</option>)}
              </select>
            </label>
            <label className="field-label">候補
              <select value={candidateFilter} onChange={(event) => setCandidateFilter(event.target.value)}>
                <option value="all">すべて</option>
                {["A", "B", "C"].map((value) => <option key={value} value={value}>{formatCandidateLabel(value)}</option>)}
              </select>
            </label>
            <label className="field-label">良かった点
              <select value={goodTagFilter} onChange={(event) => setGoodTagFilter(event.target.value)}>
                <option value="all">すべて</option>
                {tags.good.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </label>
            <label className="field-label">問題点
              <select value={badTagFilter} onChange={(event) => setBadTagFilter(event.target.value)}>
                <option value="all">すべて</option>
                {tags.bad.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            </label>
            <label className="field-label">候補の出自
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                <option value="all">すべて</option>
                {["fixture", "mock", "real_api", "production_manual"].map((value) => <option key={value} value={value}>{formatSourceTypeLabel(value)}</option>)}
              </select>
            </label>
            <label className="field-label">技術情報
              <select value={versionFilter} onChange={(event) => setVersionFilter(event.target.value)}>
                <option value="all">すべて</option>
                {[...new Set(evaluations.map((item) => `${item.sourceType || "unknown"}|${item.generationVersion || "unknown"}|${item.promptVersion || "unknown"}|${item.contextSelectorVersion || "unknown"}|${item.codeCheckVersion || "unknown"}`))].map((value) => {
                  const [sourceType, generationVersion, promptVersion, contextSelectorVersion, codeCheckVersion] = value.split("|");
                  return <option key={value} value={value}>{`${formatSourceTypeLabel(sourceType)} / ${generationVersion || "不明"} / ${promptVersion || "不明"} / ${contextSelectorVersion || "不明"} / ${codeCheckVersion || "不明"}`}</option>;
                })}
              </select>
            </label>
            <label className="field-label"><input type="checkbox" checked={onlyPending} onChange={(event) => setOnlyPending(event.target.checked)} /> 未評価のみ</label>
            <label className="field-label"><input type="checkbox" checked={onlyEdited} onChange={(event) => setOnlyEdited(event.target.checked)} /> 修正して採用のみ</label>
          </div>
          <p className="profile-copy">旧データ・出自不明は既定で集計から除外します。件数のみ表示し、過去互換の読み取りに使います。</p>
          <div className="draft-list">
            {filteredFixtures.map((fixture) => (
              <button key={fixture.id} type="button" className={current?.id === fixture.id ? "draft-card recommended" : "draft-card"} onClick={() => setCandidate({ fixture, candidateKey: "A", key: `${fixture.id}:A` })}>
                <strong>{fixture.id}</strong>
                <span>{formatCategoryLabel(fixture.category)}</span>
                <p>{fixture.sourcePost}</p>
              </button>
            ))}
          </div>
        </article>

        <article className="work-panel">
          <h3>評価パネル</h3>
          <p className="profile-copy">{current?.notes}</p>
          <div className="topic-row">
            <span>現在位置 {orderedCandidates.length ? `${Math.max(currentIndex + 1, 1)} / ${orderedCandidates.length}` : "0 / 0"}</span>
            <span>評価済み {evaluatedCount}件 / 全{orderedCandidates.length || 0}</span>
            <span>{currentCandidate ? `${formatCandidateLabel(currentCandidate.candidateKey)} / ${current.id}` : "未選択"}</span>
          </div>
          <article className="quality-block quality-block-source">
            <div className="quality-block-head">
              <span className="quality-block-kicker">元投稿</span>
              <strong>{current?.id || "-"}</strong>
            </div>
            <p className="quality-block-text">{current?.sourcePost}</p>
          </article>
          <article className="quality-block quality-block-strategy">
            <div className="quality-block-head">
              <span className="quality-block-kicker">この返信で狙うこと</span>
            </div>
            <ul className="quality-list">
              {(current?.expectedReplyStrategy || []).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
          <article className="quality-block quality-block-context">
            <div className="quality-block-head">
              <span className="quality-block-kicker">使ってよい視点</span>
            </div>
            <ul className="quality-list">
              {(current?.allowedIdentityAngles || []).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
          <article className="quality-block quality-block-warning">
            <div className="quality-block-head">
              <span className="quality-block-kicker">避けること</span>
              <AlertTriangle size={16} />
            </div>
            <div className="quality-block-subsection">
              <strong>回避文脈</strong>
              <ul className="quality-list">
                {(current?.avoidIdentityAngles || []).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="quality-block-subsection">
              <strong>回避項目</strong>
              <ul className="quality-list">
                {(current?.mustAvoid || []).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="quality-claim-level">
              <span className={`claim-badge claim-${String(current?.expectedClaimLevel || "none")}`}>断定リスク：{current?.expectedClaimLevel === "low" ? "低" : current?.expectedClaimLevel === "medium" ? "中" : current?.expectedClaimLevel === "high" ? "高" : "なし"}</span>
            </div>
          </article>
          <div className="quality-candidate-stack">
            {["A", "B", "C"].map((candidateKey, index) => {
              const reply = current?.mockReplies?.[index]?.text || "-";
              const selected = humanEvalForm.candidateKey === candidateKey;
              return (
                <article key={candidateKey} className={`quality-candidate-card quality-candidate-${candidateKey.toLowerCase()}${selected ? " selected" : ""}`}>
                  <div className="quality-block-head">
                    <span className="quality-block-kicker">{formatCandidateLabel(candidateKey)}</span>
                    {selected ? <span className="selected-pill">選択中</span> : null}
                  </div>
                  <p className="quality-block-text" role="button" tabIndex={0} onClick={() => selectCandidateKey(candidateKey)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") selectCandidateKey(candidateKey); }}>
                    {reply}
                  </p>
                  <button type="button" className="quiet-action wide" onClick={() => selectCandidateKey(candidateKey)}>
                    この候補を評価
                  </button>
                </article>
              );
            })}
          </div>
          <form className="debug-list" onSubmit={(event) => handleSaveAndMaybeAdvance(event, false)}>
            <label className="field-label">最終判断
              <select value={humanEvalForm.overallDecision} onChange={(event) => setHumanEvalForm({ ...humanEvalForm, overallDecision: event.target.value })}>
                <option value="pending">保留</option>
                <option value="accepted">そのまま採用</option>
                <option value="accepted_with_edit">修正して採用</option>
                <option value="rejected">不採用</option>
              </select>
            </label>
            <label className="field-label">修正後の返信文<textarea rows={4} value={humanEvalForm.humanEditedText} onChange={(event) => setHumanEvalForm({ ...humanEvalForm, humanEditedText: event.target.value })} /></label>
            <label className="field-label">評価メモ<textarea rows={4} value={humanEvalForm.evaluatorNotes} onChange={(event) => setHumanEvalForm({ ...humanEvalForm, evaluatorNotes: event.target.value })} /></label>
            <div className="topic-row">
              {tags.good.map((tag) => <button key={tag} type="button" className="quiet-action" onClick={() => toggleTag(tag)}>{tag}</button>)}
            </div>
            <div className="topic-row">
              {tags.bad.map((tag) => <button key={tag} type="button" className="quiet-action" onClick={() => toggleTag(tag)}>{tag}</button>)}
            </div>
            <div className="topic-row">
              {(humanEvalForm.feedbackTags || []).map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            <div className="action-row">
              <button type="submit" className="primary-action" disabled={loading}><CheckCircle2 size={17} />保存のみ</button>
              <button type="button" className="primary-action" disabled={loading} onClick={(event) => handleSaveAndMaybeAdvance(event, true)}><CheckCircle2 size={17} />保存して次へ</button>
              <button type="button" className="quiet-action" onClick={() => moveToIndex(Math.max(currentIndex - 1, 0))} disabled={currentIndex <= 0}>前の候補</button>
              <button type="button" className="quiet-action" onClick={() => moveToIndex(Math.min(currentIndex + 1, orderedCandidates.length - 1))} disabled={currentIndex < 0 || currentIndex >= orderedCandidates.length - 1}>次の候補</button>
            </div>
            {completionMessage ? <p className="profile-copy">すべての候補を評価しました。評価済み {evaluatedCount}件 / 履歴 {evaluations.length}件。</p> : <p className="profile-copy">保存後は次の未評価候補へ自動で進みます。</p>}
          </form>
        </article>
      </section>

      <section className="two-column">
        <article className="work-panel">
          <div className="panel-title">
            <h3>評価履歴</h3>
            <span>{evaluationRows.length}件</span>
          </div>
          <div className="draft-list">
            {evaluationRows.map((item) => (
              <article key={item.id} className="draft-card">
                {(() => {
                  const diff = buildHumanEditDiff(item.originalReplyText, item.humanEditedText);
                  return (
                    <>
                <div><strong>{formatCandidateLabel(item.candidateId || item.candidateKey)}</strong><span>{formatDecisionLabel(item.overallDecision)}</span></div>
                <p>{formatDate(item.evaluatedAt || item.createdAt)}</p>
                <p>良かった点: {(item.goodTags || []).join(" / ") || "-"}</p>
                <p>問題点: {(item.badTags || []).join(" / ") || "-"}</p>
                <p>評価メモ: {item.evaluatorNotes || "-"}</p>
                <p>元の返信: {item.originalReplyText || "-"}</p>
                <p>修正後: {item.humanEditedText || "-"}</p>
                <p>差分: {diff.summary} / +{diff.addedText || "-"} / -{diff.removedText || "-"}</p>
                <p>出自: {formatSourceTypeLabel(item.sourceType || "fixture")} / {item.generationVersion || "-"} / {item.promptVersion || "-"}</p>
                <p>評価種別: {formatOriginLabel(item.evaluationOrigin || "legacy_unknown")}</p>
                    </>
                  );
                })()}
              </article>
            ))}
          </div>
        </article>

        <article className="work-panel">
          <h3>傾向</h3>
          <div className="debug-list">
            <p>{summary.byCategory && Object.entries(summary.byCategory).map(([name, item]) => `${formatCategoryLabel(name)}：平均${formatMaybeScore(item.averageScore)}（n=${item.count}${item.count < 3 ? "・データ不足" : ""}）`).join(" / ") || "データ不足"}</p>
            <p>{summary.byCandidate && Object.entries(summary.byCandidate).map(([name, item]) => `${formatCandidateLabel(name)}：採用率${formatPercent(item.acceptedRate)}（n=${item.count}）`).join(" / ") || "データ不足"}</p>
            <p>{summary.scoreAverages && Object.entries(summary.scoreAverages).map(([name, value]) => `${scoreLabels[name] || name}:${formatMaybeScore(value)}`).join(" / ") || "データ不足"}</p>
            <p>良かった点上位: {(summary.topGoodTags || []).map(([tag, count]) => `${tag}(${count})`).join(" / ") || "データ不足"}</p>
            <p>問題点上位: {(summary.topBadTags || []).map(([tag, count]) => `${tag}(${count})`).join(" / ") || "データ不足"}</p>
            <p>版別: {Object.entries(summary.byVersion || {}).map(([key, item]) => `${formatVersionLabel(key)} ${key} n=${item.count} avg=${formatMaybeScore(item.averageScore)}`).join(" / ") || "データ不足"}</p>
            <p>出自別: {Object.entries(summary.byOrigin || {}).map(([key, item]) => `${formatOriginLabel(key)} n=${item.count} avg=${formatMaybeScore(item.averageScore)}`).join(" / ") || "データ不足"}</p>
            <p>改善分析: {(summary.improvementSignals || []).join(" / ") || "データ不足"}</p>
            <p>修正差分平均: {formatMaybeScore(summary.acceptedWithEditAverageChangedChars)}</p>
            <p>旧データ・出自不明の除外数: {excludedLegacyUnknownCount}</p>
          </div>
        </article>
      </section>
    </div>
  );
}

function StatCard({ label, value, status }) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{status}</span>
    </article>
  );
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "データ不足";
  return `${(value * 100).toFixed(1)}%`;
}

function formatDate(value) {
  if (!value) return "未取得";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatElapsed(value) {
  if (!value) return "日時不明";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes}分前`;
  return `${Math.round(minutes / 60)}時間前`;
}

createRoot(document.getElementById("root")).render(<App />);
