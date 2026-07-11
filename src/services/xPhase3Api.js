import { callFunction, firebaseEnabled } from "../lib/firebase";

export async function assessCandidateWithAi() {
  throw new Error("このAI処理は廃止されました。processCandidateWithAiを使用してください。");
}

export async function generateReplyDraftWithAi() {
  throw new Error("このAI処理は廃止されました。processCandidateWithAiを使用してください。");
}

export async function processCandidateWithAi(payload) {
  if (!firebaseEnabled) return { ok: true, mock: true };
  return callFunction("processCandidateWithAi", payload);
}

export async function processCandidateBatchWithAi(payload) {
  if (!firebaseEnabled) return { ok: true, mock: true };
  return callFunction("processCandidateBatchWithAi", payload);
}

export async function regenerateReplyDraftWithAi() {
  throw new Error("このAI処理は廃止されました。processCandidateWithAiを使用してください。");
}

export async function saveReplyDraftSelection(payload) {
  if (!firebaseEnabled) return { ok: true, mock: true };
  return callFunction("saveReplyDraftSelection", payload);
}

export async function saveHumanQualityEvaluation(payload) {
  if (!firebaseEnabled) return { ok: true, mock: true };
  return callFunction("saveHumanQualityEvaluation", payload);
}
