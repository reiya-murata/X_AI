# Architecture and Operations Decisions

ここにはコードと設定から確認できる、今後も維持すべき判断を記録する。日付は文書化日であり、最初の実装日を推測しない。

## D-001 人間がXで最終送信する

- 状態: 採用
- 決定: Xへの自動投稿を実装せず、Web Intentを開いて人間が送信する。
- 理由: 誤送信、文脈誤認、強い断定、アカウント事故の影響を限定する。
- 根拠: `src/services/xIntent.js`、README、`automaticPosting: false`のrelease manifest。

## D-002 新規AI処理は1候補1 APIに統一する

- 状態: 採用
- 決定: UIと外部Callableの新規生成は`processCandidateWithAi`を使い、1候補1 Responses APIを基本とする。Judge専用APIと品質理由による自動再生成を行わない。
- 理由: API回数、cost、429影響、経路の複雑性を抑える。
- 根拠: `src/services/xPhase3Api.js`、`functions/src/phase3/analysis.js`、Phase 3.7 closure test。

## D-003 旧AI Callableは削除せずfail-fastする

- 状態: 採用
- 決定: `assessCandidateWithAi`、`generateReplyDraftWithAi`、`regenerateReplyDraftWithAi`のexportは後方互換のため残すが、`failed-precondition`を返しOpenAIを呼ばない。
- 理由: 古いクライアントの誤作動を明示しながら旧マルチAPI経路を実行不能にする。
- 根拠: `functions/src/phase3/deprecatedCallables.js`、`functions/index.js`。

## D-004 認証とadmin境界をFunctionsで強制する

- 状態: 採用
- 決定: 管理CallableはFirebase Authと`admin: true` claimを必須とし、`requireAdmin`を迂回しない。
- 理由: UI表示制御だけでは権限境界にならないため。
- 根拠: `functions/src/auth/requireAdmin.js`、`functions/index.js`、`firestore.rules`。

## D-005 ローカル環境をdemo projectへ隔離する

- 状態: 採用
- 決定: seed、dev admin、local mock、backup/restoreは`demo-x-reply-intelligence`とFirebase Emulatorでのみ実行する。本番aliasを書き換えない。
- 理由: 本番データへの誤接続・誤書き込みを防ぐ。
- 根拠: `scripts/firebaseLocalExec.cjs`、`scripts/devLocal.cjs`、`functions/src/environmentSafety.js`、`.firebaserc`。

## D-006 品質Labは通常運用から隔離する

- 状態: 採用
- 決定: fixture、9項目評価、履歴・集計は開発者資産として保持し、localhost、demo Emulator、`VITE_ENABLE_QUALITY_LAB=true`を満たす場合だけ表示する。
- 理由: 通常運用の主目的は候補取得、返信確認・編集、Web Intent送信であり、人間評価を必須工程にしないため。
- 根拠: `src/main.jsx`、`src/environmentSafety.js`、`scripts/devLocal.cjs`。

## D-007 RC versionとpackage versionを分離する

- 状態: 採用
- 決定: package versionは`0.1.0`を維持し、運用上のRCはrelease metadataで管理する。現在RCは`phase5.0-rc1`。
- 理由: npm packageの公開versionではなく、検証済み運用候補を識別するため。
- 根拠: `package.json`、`vite.config.js`、`scripts/releaseInfo.cjs`、`scripts/testReleaseOps.cjs`。

## D-008 Schema変更と復旧はdry-runを既定にする

- 状態: 採用
- 決定: migrationのproduction applyを自動化せず、backup/restoreもdemo Emulator限定・dry-run既定・checksum確認付きとする。
- 理由: データ破壊とnamespace混入を防ぐ。
- 根拠: `functions/src/schema/registry.js`、`scripts/emulatorBackup.cjs`、`scripts/emulatorRestore.cjs`、`scripts/migrations/`。

## 未決定・未確認

- 実OpenAI品質を合格とする基準と、quota復旧時期
- 本番Firebaseおよび本番X接続の実証結果
- 初回本番運用日と段階的な件数拡大判断
- `phase5.0-rc1`のtag作成・リモートpush時期

これらは推測で確定せず、検証結果またはれいやの明示判断を受けて追記する。
