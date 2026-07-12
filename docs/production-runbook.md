# Production Runbook

この手順は、OpenAI実APIと本番Firebaseが復旧した日に、段階的に安全確認してから運用を始めるためのものです。自動投稿は行わず、Xへの最終送信は必ず人間が `Web Intent` で実施します。

## 1. 事前確認

```bash
nvm use
node -v
npm ci
npm run lint
npm run build
npm run preflight:production
```

期待結果:
- Node 20系で実行される
- lint と build が成功する
- preflight は読み取り専用で終了する

失敗時の対応:
- Nodeの系統を合わせる
- 依存を入れ直す
- 先に `README` のロールバック手順へ戻る

## 2. OpenAI復旧確認

実行前に、現在のシェルで`OPENAI_API_KEY`が設定済みであることを確認します。キー自体は表示しません。runnerは`OPENAI_MOCK_MODE=false`と`ENABLE_REAL_OPENAI_TESTS=true`が揃わない場合、安全にskipします。

```bash
OPENAI_MOCK_MODE=false ENABLE_REAL_OPENAI_TESTS=true npm run test:phase37:real
```

期待結果:
- quota不足では止まらない
- 3〜5件の返信品質、usage、latency が確認できる

失敗時の対応:
- quota/billing を確認する
- `OPENAI_MOCK_MODE=true` に戻して作業を止める

## 3. 段階検証

```bash
OPENAI_MOCK_MODE=false ENABLE_REAL_OPENAI_TESTS=true npm run test:phase37:real
```

期待結果:
- Emulator 上で実OpenAIの生成だけを確認できる
- 1候補1 Responses API のまま
- 自動Judge / 自動再生成なし

失敗時の対応:
- 生成文の不自然さ、断定、宣伝臭、claimLevel を確認する
- 問題があれば運用開始を止める

## 4. 本番候補の少数確認

```bash
npm run preflight:production
```

期待結果:
- 本番切替前の安全確認が合格する
- 本番候補を少数だけ取得できる

失敗時の対応:
- projectId と接続先を確認する
- mock 混入があれば止める

## 5. 手動送信

1件だけ `Web Intent` を開き、X上で手動送信します。

期待結果:
- `sent_manual` が記録される
- 返信文と結果が保存される

失敗時の対応:
- 送信を中止する
- アプリに戻って `not_sent` と理由を残す

## 6. 開始基準

- 初日は最大3件
- 2〜3日目は最大5件
- 1週間以内でも最大10件/日を目安にする
- 連続Web Intent起動を避ける
- 同一投稿者への連続返信を避ける
- `generation_failed` は送信しない
- `claimLevel high` は原則見送る

## 7. 停止条件

以下のいずれかが出たら即停止し、人間確認へ戻します。

- OpenAI quota不足
- 同じ文面の連続生成
- 関係ない自己紹介の繰り返し
- 宣伝臭が強い
- 元投稿の意味を読み違える
- 強い断定や誤情報リスク
- X OAuth不安定
- Firestore保存失敗
- status遷移不整合
- Web Intent先URL異常
- 本番projectId不一致
- mock混入
- dev admin有効
- Quality Lab露出

## 8. ロールバック

- 実OpenAIを止めて `OPENAI_MOCK_MODE=true` に戻す
- 本番候補取得を止める
- X OAuthを切断する
- 問題のFunctionsを直前の確認済み版へ戻す
- Firestore schema は後方互換を維持する
- migration は dry-run を必須にする
