# CI

`.github/workflows/ci.yml`はNode 20、root/functionsの`npm ci`、lint/build、Phase 3.7〜5、Rules、Firebase isolation、secret scan、critical audit、release manifestを実行する。Emulatorテストは単一job内で直列化する。

CIはdemo project、OpenAI/X mock、実APIテスト無効で動き、Firebase login、OpenAI key、X token、本番環境変数を必要としない。
