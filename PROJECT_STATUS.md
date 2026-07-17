# X_AI Project Status

最終確認日: 2026-07-12

## 確認済みの現在地

- 製品目的: `@Rachel_hkz`向けのX返信候補管理。候補取得、AI返信案、編集、Web Intent、送信結果・反応の手動記録を支援する。
- 現在RC: `phase5.0-rc1`。`vite.config.js`、`src/lib/firebase.js`、`src/main.jsx`、`scripts/releaseInfo.cjs`、release testが同じ値を参照する。
- package version: root/functionsともに`0.1.0`。
- Git基準: RC昇格コミットは`d52ca1d`。現在のGit状態は`git status`と`npm run release:status`を正本として確認する。
- working tree: `git status`と`npm run release:status`の結果を正本とし、個別ファイルの固定一覧では追跡しない。
- Runtime: `.nvmrc`とFunctions engineはNode 20。
- Frontend: React 18 + Vite 6 + Firebase Web SDK。
- Backend: Firebase Functions v2、Firebase Admin、Firestore、OpenAI SDK、Zod。
- Firebase: 本番aliasは`x-ai-322c9`。ローカルはwrapperから`demo-x-reply-intelligence`を明示し、Auth 9097 / Firestore 8082 / Functions 5003 / UI 5174を使う。
- 認証: 管理操作はFirebase Authと`admin: true` custom claimが必要。Functionsは`requireAdmin`を維持する。
- AI: 既定モデル`gpt-4o-mini`の1候補1 Responses APIフロー。モデルは環境変数で上書き可能。旧assessment/Judge/自動再生成経路は廃止Callableとしてfail-fastする。
- X: OAuth PKCE、読み取りAPI、token暗号化を実装。返信送信APIはなく、人間がWeb Intentで送信する。
- データ: `candidatePosts`、`replyDrafts`、`workflowStatus`、`statusHistory`、operation logs、利用結果、反応記録を管理する。
- Phase 5: CI、Schema registry、secret scan、Emulator backup/restore、migration dry-run、release manifest、復旧テスト、安全ログを実装済み。
- 品質Lab: fixtureと人間評価資産は保持するが、localhost + demo Emulator +明示フラグの開発者機能。通常`dev:local`では非表示。

## 直近の確認結果

RC昇格時に以下が成功している。

- `npm run build`
- `npm run release:status`
- `npm run test:release`
- `npm run release:check`
- release manifest: `phase5.0-rc1`、`automaticPosting: false`
- Phase 4 E2E: `sent_manual`まで成功
- OpenAI API 0回、X API・投稿0回、本番Firestore/Auth書き込み0回

この結果はローカル確認であり、GitHub Actions上の最新CI結果や本番環境の成功を意味しない。

## 未確認・残課題

- OpenAI実APIの品質、quota、billing復旧
- 本番Firebase/Auth/Firestore/Functionsの実接続
- 本番X APIによる候補取得
- 本番Web Intentによる手動送信1件
- 本番operationLogs、`sent_manual`、分析反映
- GitHub Actionsがリモート上で実際に完走したか
- RC昇格変更のtag未作成、push未実施、GitHub Actions未確認

未確認項目を合格扱いしない。実運用開始は`docs/production-runbook.md`の段階確認に従う。
