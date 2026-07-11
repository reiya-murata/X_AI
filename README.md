# X Reply Intelligence

@Rachel_hkz のXリプ運用を半自動化する管理ツールです。第三者投稿への自動送信は実装せず、候補選定、返信案生成、人間確認、X Web Intentで返信画面を開くところまでを支援します。

## Phase 4 実運用フロー

Phase 4では、候補の取得、優先順位確認、返信案の確認・編集、X Web Intent、送信結果と反応の手動記録を一つの作業キューで扱います。Xへの自動投稿や送信済みの自動判定は行いません。

```bash
nvm use
npm run dev:local
```

ローカルでは `OPENAI_MOCK_MODE=true`、Firebase Emulator、`demo-` プロジェクトの組み合わせに限り、`local-mock` の決定論的返信案で全導線を確認できます。この場合のOpenAI API呼び出しは0回です。候補状態は「未処理→生成待ち→生成中→返信案あり／要確認→編集済み→送信確認待ち→送信済み／未送信」を基本とし、不採用・生成失敗・保管済みにも対応します。

Web Intentを開いた時点では送信済みにせず、アプリへ戻って「送信した」「送信しなかった」「あとで確認」から人間が結果を記録します。送信後のいいね、返信、プロフィール訪問なども任意の手動記録です。実API復旧時は既存の `processCandidateWithAi` をそのまま使用し、`OPENAI_MOCK_MODE=false` に戻します。1候補1 Responses API、自動Judgeなし、自動再生成なしの構成は維持されます。

品質Labは `VITE_ENABLE_QUALITY_LAB=true` かつlocalhost、Firebase Emulator、demoプロジェクトの場合だけ表示される開発者向け機能で、通常の運用分析には含まれません。

## Phase 4.1 本番切替前の確認

通常のpreflightは読み取り専用で、Firestore/Authへの書き込み、X投稿、Web Intent起動、OpenAI API呼び出しを行いません。

```bash
npm run preflight:local
npm run preflight:staging
npm run preflight:production
```

実OpenAIの最小確認は、stagingまたはproductionで次の二重確認を行った場合だけ最大1回実行されます。通常のpreflightでは実行しないでください。

```bash
ENABLE_REAL_OPENAI_TESTS=true CONFIRM_REAL_OPENAI_PREFLIGHT=true npm run preflight:staging -- --allow-real-openai
```

### OpenAI復旧後の段階切替

1. OpenAI管理画面でquotaとbillingを確認する。
2. Emulator環境で `npm run test:phase37:real` を実行し、3〜5候補の生成文、usage、latencyを確認する。
3. `OPENAI_MOCK_MODE=false` にする。APIキーは画面やログへ出さない。
4. demo Firebase Emulator上で実OpenAI生成だけを確認する場合は、Phase 3.7 runnerを使用する。通常UIのlocal-mockガードは解除しない。
5. 3〜5候補を人間が読み、禁止表現、claimLevel、文脈、自然さを確認する。
6. 本番preflightが合格してから、本番候補を少数取得する。
7. 返信文を編集し、Web Intent URLまで確認する。自動投稿は行わない。
8. 人間がX上で1件だけ手動送信する。
9. X_AIへ戻り、`sent_manual`、最終返信文、利用結果が記録されたことを確認する。
10. 問題がなければ件数を段階的に増やす。

### ロールバック

1. 実OpenAIの利用を止め、demo Emulatorでは `OPENAI_MOCK_MODE=true` へ戻す。本番環境でmockは有効にしない。
2. タイムライン・監視リストの手動取得を停止し、新しい本番候補の追加を止める。
3. 管理画面からX OAuthを切断し、保存済みtokenをFunctions経由で無効化する。
4. 問題のあるFunctionsを直前の確認済みバージョンへ戻す。Xへの自動投稿処理は存在しないため、停止中に投稿が継続することはない。
5. `candidatePosts` と `replyDrafts` は破壊的に変更しない。`workflowStatus` がない旧データは互換マッピングで読み取る。
6. migrationが必要な場合は必ずdry-runで対象件数と変更内容を確認し、明示承認後に別作業として実行する。

seed、dev admin、local-mockは `demo-` projectとFirebase Emulatorの組み合わせに限定されています。本番Firestoreへ自動seedするコマンドはありません。

## Phase 4.2 RC固定と運用開始

現在の安定版は `phase4.2-rc1` として表示されます。ビルド時のGit commit、build日時、dirty状態は本番準備画面と `npm run release:status` で確認できます。

運用開始前の一括確認は次のコマンドを使います。

```bash
npm run release:status
npm run release:check
```

手順書と記録テンプレートは以下を参照してください。

- [production-runbook.md](docs/production-runbook.md)
- [real-api-validation-template.md](docs/real-api-validation-template.md)

## 実装済み

- Phase 1: React / Vite管理画面、Identity Engine初期データ、ローカル生成テスト、X Web Intent導線
- Phase 2: X OAuth PKCE、token暗号化、Mockホーム/リスト取得、正規化、一次フィルター、Firestore保存
- Phase 2.5: Firebase Auth UI、Emulator接続、admin claimチェック、Firestore購読、Emulator seed/admin/E2E、Rules検証

## セットアップ

Node.jsはFunctions runtimeに合わせてNode 20系を推奨します。
ルートには `.nvmrc` を置いているので、`nvm use` で同じ系統へ揃えやすくしています。

```bash
npm install
cd functions && npm install
```

`.env.example` を参考にFirebaseの公開設定を入れてください。APIキーやOAuth tokenはフロントへ置かず、Functions側の環境変数またはSecret Managerで扱います。

## 開発コマンド

```bash
npm run dev
npm run dev:emulator
npm run lint
npm run build
npm run test:rules
cd functions && npm run lint
cd functions && npm test
```

## Emulator結合確認

```bash
HOME=/private/tmp/x-ai-firebase-home \
X_API_MOCK_MODE=true \
X_TOKEN_ENCRYPTION_KEY=dev-only-32-byte-key-for-local!! \
APP_BASE_URL=http://localhost:5174 \
npm run emulators
```

管理者を作成します。パスワードはログに表示されません。

```bash
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 \
FIREBASE_PROJECT_ID=demo-x-reply-intelligence \
EMULATOR_ADMIN_EMAIL=admin@example.local \
EMULATOR_ADMIN_PASSWORD='your-local-password' \
npm run emulator:create-admin
```

ローカル開発では `dev-admin@local.test` / `local-dev-only` を自動作成します。`npm run dev:local` を使うと、Emulator起動・seed・自動ログイン・Vite起動までをまとめて実行できます。ローカルの品質タブは `VITE_DEFAULT_TAB=quality` または `?tab=quality` で開けます。

seedとMock E2E:

```bash
npm run emulator:seed
npm run test:e2e
npm run test:e2e:ai
```

`test:e2e` / `test:e2e:ai` / `test:phase37:real` は `scripts/firebaseLocalExec.cjs` を通して実行され、Firebase CLI の config home をリポジトリ直下の `.firebase-home/` に閉じ込めます。これでグローバルな `~/.config` や個人の Firebase/Google Cloud 設定に触れません。

標準ポートは Auth `9097`、Firestore `8081`、Functions `5003`、Hosting `5002`、Emulator UI `4000` です。既に使われている場合は、`firebase.json`、`.env.example`、Vite起動時の環境変数を同じ値へ揃えてください。

X_AI の開発UIは `5174` 固定です。Threads_AI の `5173` とは並行利用できます。`VITE_LOCAL_AUTO_LOGIN=false` にすると、ローカル自動ログインを無効化できます。

Export / import:

```bash
npm run emulators:export
npm run emulators:import
```

## 環境変数

ルート/Vite:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_USE_FIREBASE=true
VITE_USE_FIREBASE_EMULATORS=true
VITE_USE_X_API_MOCK=true
VITE_FIREBASE_AUTH_EMULATOR_URL=http://127.0.0.1:9097
VITE_FIRESTORE_EMULATOR_HOST=127.0.0.1
VITE_FIRESTORE_EMULATOR_PORT=8081
VITE_FUNCTIONS_EMULATOR_HOST=127.0.0.1
VITE_FUNCTIONS_EMULATOR_PORT=5003
```

Functions:

```bash
X_API_MOCK_MODE=true
X_CLIENT_ID=
X_CLIENT_SECRET=
X_OAUTH_REDIRECT_URI=
X_TOKEN_ENCRYPTION_KEY=
APP_BASE_URL=
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9097
FIRESTORE_EMULATOR_HOST=127.0.0.1:8081
FIREBASE_PROJECT_ID=demo-x-reply-intelligence
EMULATOR_ADMIN_EMAIL=
EMULATOR_ADMIN_PASSWORD=
VITE_DEFAULT_TAB=quality
VITE_LOCAL_AUTO_LOGIN=true
VITE_LOCAL_ADMIN_EMAIL=dev-admin@local.test
VITE_LOCAL_ADMIN_PASSWORD=local-dev-only
OPENAI_API_KEY=
OPENAI_MOCK_MODE=true
```

本番では `X_TOKEN_ENCRYPTION_KEY` を32byte文字列、base64、または64桁hexでSecret Managerに保存してください。

## 安全設計

- X APIによる返信送信は実装しません。
- 「Xで返信する」は `https://x.com/intent/tweet` を新しいタブで開くだけです。
- X OAuth scopeは `tweet.read`、`users.read`、`list.read`、`offline.access` のみです。
- `xConnections`、`xOAuthStates`、`xApiUsageLogs`、`timelineSyncStates` はクライアントから直接読み書きできません。
- 管理画面とFunctions操作は `admin: true` custom claimが必要です。
- 生成Contextは `publicUseAllowed=true` の公開可能情報を前提にします。
- ローカル Firebase Emulator 実行時は `.firebase-home/` を使い、更新チェックやCLI設定も repo 内に分離します。
- ローカル Emulator の保存先は `.firebase-emulator-data/manual/` です。
- 本番環境では自動ログインは動きません。

## 本番準備

- Firebase Authでメール/パスワードなど必要なプロバイダーを有効化
- 管理者ユーザーを本番Authに作成
- Firebase Admin SDKなど安全な運用手順で `admin: true` custom claimを付与
- X Developer Consoleでcallback URLを登録
- `X_CLIENT_ID`、`X_CLIENT_SECRET`、`X_OAUTH_REDIRECT_URI`、`X_TOKEN_ENCRYPTION_KEY`、`APP_BASE_URL` をFunctions secretsへ設定
- `X_API_MOCK_MODE=false` へ切り替える前に読み取りscopeだけであることを再確認

## Auditメモ

- ルート `npm audit`: 0件
- Functions `npm audit` / `npm audit --omit=dev`: moderate 12件
- 対象は `firebase-admin` / `firebase-functions` と、`uuid` を含むFirebase・Google系の推移依存です。
- 本番依存に含まれます。
- `fixAvailable: false` を含むため、`npm audit fix --force` は実行していません。
- Firebase/Google依存の安全なpatch/minor更新で解消できることが明確になったタイミングで再確認します。
