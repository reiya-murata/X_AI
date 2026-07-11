# Emulator Backup / Restore

`npm run backup:emulator -- <dir>`はdemo Firestore Emulatorだけを保存し、manifestとSHA-256 checksumを作る。`xConnections`と`xOAuthStates`はtoken保護のため除外する。

`npm run restore:emulator -- <dir>`はdry-run。適用は`CONFIRM_EMULATOR_RESTORE=RESTORE_DEMO_DATA npm run restore:emulator -- <dir> --apply`の明示確認が必要で、Emulator以外を拒否する。`npm run test:backup-restore`は一時documentの作成、backup、削除、復元、比較、cleanupを行う。
