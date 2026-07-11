# Firestore Schema

正本は`functions/src/schema/registry.js`。registry versionと各documentの`schemaVersion`は独立する。

| Collection | Version | 主な制約 |
|---|---:|---|
| candidatePosts | 1 | postId必須、workflowStatus enum、statusHistory最大30、返信最大280 |
| replyDrafts | 1 | candidatePostId必須、candidates最大3、編集文最大280 |
| operationLogs | 2 | action/timestamp必須、metadata許可制、保持90日 |
| replyUsageFeedback | 1 | candidatePostId/feedback必須 |
| replyOutcomeMetrics | 1 | candidatePostId必須、反応数は非負 |
| xConnections | 1 | firebaseUid/status必須、tokenは暗号化しFunctions専用 |
| qualityEvaluations | 2 | fixture/candidate/decision/origin必須 |

既存documentのversion欠落はversion 0相当で読み込み、migration dry-runで候補を確認する。
