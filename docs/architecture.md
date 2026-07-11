# Architecture

React/Vite管理UIはFirebase Authでadminを確認し、Callable Functionsへ操作を依頼する。FunctionsはFirestoreの`candidatePosts`と`replyDrafts`を中心に状態を管理し、Xへの送信はWeb Intentを人間が行う。OpenAIは`processCandidateWithAi`から1候補1 Responses APIで利用し、Judgeと自動再生成は行わない。

信頼境界はブラウザ、Callable Functions、Firestore、外部Adapter、Web Intentの5層。ブラウザは権限や状態遷移を確定せず、Functionsが`requireAdmin`、Schema、環境ガードを強制する。主要障害点は外部API quota、OAuth期限、接続障害、競合更新、参照切れであり、Schema監査、冪等遷移、backup/restore、安全ログで復旧可能性を確保する。
