# Dependency Audit

Node 20をFunctions engineとCIで固定する。root/functionsのlockfileを分け、メジャー更新は自動適用しない。CIは`npm audit --audit-level=critical`を拒否条件とする。high以下は利用経路と互換性を確認して判断する。

`punycode`警告がFirebase系の推移的依存の場合は直接抑制せず上流更新を待つ。Vite/Firebase/firebase-functions/OpenAI SDKのモデル・API構成はPhase 5で変更しない。
