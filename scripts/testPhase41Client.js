import assert from "node:assert/strict";
import { evaluateClientEnvironment } from "../src/environmentSafety.js";

const safeLocal = { appEnv: "development", hostname: "localhost", projectId: "demo-x", emulators: true, openAiMock: true, realOpenAi: false, qualityLab: false, localAutoLogin: true, xApiMock: true };
assert.equal(evaluateClientEnvironment(safeLocal).ok, true);
assert.equal(evaluateClientEnvironment({ ...safeLocal, appEnv: "production" }).ok, false);
assert.equal(evaluateClientEnvironment({ ...safeLocal, projectId: "x-reply-intelligence", emulators: false, localAutoLogin: false }).ok, false);
assert.equal(evaluateClientEnvironment({ ...safeLocal, openAiMock: false, realOpenAi: true }).ok, false);
assert.equal(evaluateClientEnvironment({ ...safeLocal, hostname: "example.com", qualityLab: true, localAutoLogin: false }).ok, false);
assert.equal(evaluateClientEnvironment({ ...safeLocal, emulators: false }).ok, false);
console.log(JSON.stringify({ ok: true, startupGuardCases: 6 }));
