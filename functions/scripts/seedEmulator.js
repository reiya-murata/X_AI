const admin = require("firebase-admin");
const { buildSeedDocuments } = require("../src/seed");
const { assertEmulatorOnly } = require("./emulatorGuards");

async function main() {
  assertEmulatorOnly();
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const db = admin.firestore();
  const docs = buildSeedDocuments();
  let inserted = 0;
  let skipped = 0;

  for (const item of docs) {
    const ref = db.collection(item.collection).doc(item.id);
    const snapshot = await ref.get();
    if (snapshot.exists) {
      skipped += 1;
      continue;
    }
    await ref.set({
      ...item.data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    inserted += 1;
  }

  console.log(JSON.stringify({ ok: true, inserted, skipped, total: docs.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
