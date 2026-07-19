import assert from "node:assert/strict";
import { buildClientEnvironment, evaluateClientEnvironment } from "../src/environmentSafety.js";

const safeLocal = { appEnv: "development", hostname: "localhost", projectId: "demo-x", emulators: true, openAiMock: true, realOpenAi: false, allowRealOpenAiWithEmulator: false, qualityLab: false, localAutoLogin: true, xApiMock: true };
assert.equal(evaluateClientEnvironment(safeLocal).ok, true);
assert.equal(evaluateClientEnvironment({ ...safeLocal, appEnv: "production" }).ok, false);
assert.equal(evaluateClientEnvironment({ ...safeLocal, projectId: "x-reply-intelligence", emulators: false, localAutoLogin: false }).ok, false);
assert.equal(evaluateClientEnvironment({ ...safeLocal, openAiMock: false, realOpenAi: true }).ok, false);
assert.equal(evaluateClientEnvironment({ ...safeLocal, openAiMock: false, realOpenAi: true, allowRealOpenAiWithEmulator: true }).ok, true);
assert.equal(evaluateClientEnvironment({ ...safeLocal, openAiMock: false, realOpenAi: true, allowRealOpenAiWithEmulator: true, hostname: "example.com" }).ok, false);
assert.equal(evaluateClientEnvironment({ ...safeLocal, hostname: "example.com", qualityLab: true, localAutoLogin: false }).ok, false);
assert.equal(evaluateClientEnvironment({ ...safeLocal, emulators: false }).ok, false);
const productionDefaultsToRealOpenAi = buildClientEnvironment({ MODE: "production" }, "x-ai-322c9.web.app");
assert.equal(productionDefaultsToRealOpenAi.openAiMock, false);
assert.equal(productionDefaultsToRealOpenAi.realOpenAi, true);
const localDefaultsToMock = buildClientEnvironment({ MODE: "development" }, "localhost");
assert.equal(localDefaultsToMock.openAiMock, true);
assert.equal(localDefaultsToMock.realOpenAi, false);
console.log(JSON.stringify({ ok: true, startupGuardCases: 8 }));
