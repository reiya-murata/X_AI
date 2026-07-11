# Real API Validation Template

OpenAI実APIが復旧したあと、3〜5件の候補をこの形式で記録してください。複雑な9項目採点は不要です。

- 実行日時:
- releaseCandidateVersion:
- model:
- candidatePostId:
- 元投稿カテゴリ:
- 生成文:
- API呼び出し回数:
- latencyMs:
- inputTokens:
- outputTokens:
- claimLevel:
- warnings:
- そのまま使用可能:
- 軽微修正:
- 不使用:
- 修正内容:
- 問題点:
- 次の対応:

## 記録の考え方

- `そのまま使用可能` は、編集なしでそのままWeb Intentに載せられる文面を指します。
- `軽微修正` は、語尾や一部表現だけを直せば使える文面です。
- `不使用` は、宣伝臭、断定、誤情報、文脈外れが強いものです。
- `warnings` には、claimLevel高、一般論、類似表現、禁止表現の警告を短く書きます。

