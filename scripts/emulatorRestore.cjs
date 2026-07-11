const fs = require("node:fs");
const path = require("node:path");
const { getDb, requireEmulator, deserialize } = require("./phase5Firebase.cjs");
const { sha256 } = require("./emulatorBackup.cjs");

async function restoreBackup(inputDir, { apply = false } = {}) {
  if (!inputDir) throw new Error("backup directoryを指定してください。");
  const projectId = requireEmulator();
  const manifest = JSON.parse(fs.readFileSync(path.join(inputDir, "manifest.json"), "utf8"));
  const dataText = fs.readFileSync(path.join(inputDir, "data.json"), "utf8");
  if (manifest.projectId !== projectId) throw new Error("backupのprojectIdが一致しません。");
  if (manifest.checksum !== sha256(dataText)) throw new Error("backup checksumが一致しません。");
  const documents = JSON.parse(dataText);
  const summary = { ok: true, dryRun: !apply, projectId, documentCount: Object.values(documents).reduce((sum, rows) => sum + rows.length, 0), collections: manifest.collections };
  if (!apply) { console.log(JSON.stringify(summary, null, 2)); return summary; }
  if (process.env.CONFIRM_EMULATOR_RESTORE !== "RESTORE_DEMO_DATA") throw new Error("restore applyにはCONFIRM_EMULATOR_RESTORE=RESTORE_DEMO_DATAが必要です。");
  const db = getDb();
  for (const [collection, rows] of Object.entries(documents)) {
    for (let index = 0; index < rows.length; index += 400) {
      const batch = db.batch();
      rows.slice(index, index + 400).forEach((row) => batch.set(db.collection(collection).doc(row.id), deserialize(row.data), { merge: false }));
      await batch.commit();
    }
  }
  summary.restored = true;
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}
if (require.main === module) restoreBackup(process.argv[2], { apply: process.argv.includes("--apply") }).catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { restoreBackup };
