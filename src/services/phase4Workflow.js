import { callFunction, firebaseEnabled } from "../lib/firebase";

const mock = { ok: true, mock: true };
export const transitionCandidateWorkflow = (payload) => firebaseEnabled ? callFunction("transitionCandidateWorkflow", payload) : Promise.resolve(mock);
export const saveWorkflowReplyDraft = (payload) => firebaseEnabled ? callFunction("saveWorkflowReplyDraft", payload) : Promise.resolve(mock);
export const recordReplyIntentOpened = (payload) => firebaseEnabled ? callFunction("recordReplyIntentOpened", payload) : Promise.resolve(mock);
export const recordManualSendResult = (payload) => firebaseEnabled ? callFunction("recordManualSendResult", payload) : Promise.resolve(mock);
export const saveReplyUsageFeedback = (payload) => firebaseEnabled ? callFunction("saveReplyUsageFeedback", payload) : Promise.resolve(mock);
export const saveReplyOutcomeMetrics = (payload) => firebaseEnabled ? callFunction("saveReplyOutcomeMetrics", payload) : Promise.resolve(mock);
export const getPhase4OperationsSummary = () => firebaseEnabled ? callFunction("getPhase4OperationsSummary", {}) : Promise.resolve({ ...mock, insufficientData: true });
export const getProductionReadiness = () => firebaseEnabled ? callFunction("getProductionReadiness", {}) : Promise.resolve({ ...mock, connectivity: {}, configuration: {} });
