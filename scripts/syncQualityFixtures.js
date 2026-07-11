import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import * as source from "../src/qualityFixtureData.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const functionsFile = path.join(repoRoot, "functions", "src", "phase3", "qualityFixtureData.js");

const payload = {
  version: source.qualityFixtureVersion || "1.0.0",
  humanEvaluationTags: source.humanEvaluationTags,
  qualityFixtures: source.qualityFixtures,
};
const checksum = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");

const body = `// AUTO-GENERATED FILE. DO NOT EDIT BY HAND.\n` +
  `// Source of truth: /Users/reiya/Projects/X_AI/src/qualityFixtureData.js\n` +
  `const data = ${JSON.stringify({ ...payload, checksum }, null, 2)};\n\n` +
  `module.exports = data;\n`;

fs.writeFileSync(functionsFile, body);
console.log(JSON.stringify({
  ok: true,
  fixtures: source.qualityFixtures.length,
  version: payload.version,
  checksum,
}, null, 2));
