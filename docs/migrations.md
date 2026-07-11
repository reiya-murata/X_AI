# Migrations

migrationはID、from/to version、対象collection、planned/changed/skipped/error件数、rollback note、idempotencyを持つ。Phase 5はapplyを提供せず、demo Emulatorのdry-runのみ。

`npm run migration:workflow-status:dry-run`は旧`status`から`workflowStatus` v1への予定変更を表示する。既存値はskipし、データを変更しない。
