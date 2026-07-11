# Disaster Recovery

1. 操作を停止し環境を確認する。
2. `data:audit`で破損範囲を記録する。
3. 現在データを別backupへ退避する。
4. 復元対象をdry-runしchecksumと件数を照合する。
5. demo Emulatorで復元とPhase 4フロー再開を検証する。
6. 本番対応は人間承認後に行い、自動復旧しない。

訓練は`npm run test:disaster-recovery`。OpenAI/X APIや本番書き込みは行わない。
