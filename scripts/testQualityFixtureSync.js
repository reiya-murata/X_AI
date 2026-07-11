import assert from "node:assert/strict";
import crypto from "node:crypto";
import * as source from "../src/qualityFixtureData.js";
import generated from "../functions/src/phase3/qualityFixtureData.js";

function main() {
  const srcFixtures = source.qualityFixtures;
  const genFixtures = generated.qualityFixtures;
  assert.equal(srcFixtures.length, genFixtures.length, "fixture count");
  assert.deepEqual(srcFixtures.map((item) => item.id), genFixtures.map((item) => item.id), "fixture ids");
  assert.deepEqual(srcFixtures.map((item) => item.sourcePost), genFixtures.map((item) => item.sourcePost), "fixture text");
  assert.deepEqual(srcFixtures.map((item) => item.mockReplies.map((reply) => reply.text)), genFixtures.map((item) => item.mockReplies.map((reply) => reply.text)), "candidate replies");
  assert.equal(source.qualityFixtureVersion, generated.version, "fixture version");
  const srcChecksum = crypto.createHash("sha256").update(JSON.stringify({
    version: source.qualityFixtureVersion,
    humanEvaluationTags: source.humanEvaluationTags,
    qualityFixtures: source.qualityFixtures,
  })).digest("hex");
  assert.equal(srcChecksum, generated.checksum, "checksum");
  console.log(JSON.stringify({
    ok: true,
    fixtureCount: srcFixtures.length,
    version: source.qualityFixtureVersion,
    checksum: srcChecksum,
  }, null, 2));
}

main();
