# Incident Response

停止条件はproject不一致、mock混入、dev admin露出、quota/billing、OAuth不安定、保存失敗、status不整合、Web Intent異常、重複文面、誤読・強い断定・宣伝臭である。

発生時は操作を停止し、correlationId/operationId、時刻、安全化済みerror categoryを記録する。token、本文、prompt、Authorization、秘密値を含むstackは記録しない。`data:audit`、`release:status`、preflight、operationLogsの順に確認する。
