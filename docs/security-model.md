# Security Model

- Functionsは`requireAdmin`を維持する。
- seed、backup、restoreはdemo projectとEmulator以外を拒否する。
- OAuth、operationLogs、outcome系はクライアント直接書き込み不可。
- operationLogsは許可リスト、key/value redaction、長さ・深さ・配列上限を適用する。
- secret scanは検出値をマスクし、実値を表示しない。
- CIとPhase 5テストはOpenAI/X実APIと本番Firebaseを使用しない。
